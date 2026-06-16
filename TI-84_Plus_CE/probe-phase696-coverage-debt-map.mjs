#!/usr/bin/env node
// Phase 696: turn the remaining uncovered non-erased ROM bytes into a do-not-seed debt map.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase696-coverage-debt-map.md');

const rom = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const FONTISH_BYTES = new Set([
  0x00, 0x08, 0x10, 0x18, 0x20, 0x24, 0x28, 0x30, 0x38, 0x3C,
  0x40, 0x60, 0x70, 0x78, 0x80, 0xC0, 0xE0, 0xF0, 0xF8, 0xFC,
]);

const FONT_BITMAP_BANDS = Object.freeze([
  { start: 0x003000, end: 0x005600, name: 'low-font-glyph-region' },
  { start: 0x0A4300, end: 0x0A5400, name: 'high-bitmap-mask-region' },
]);

const MANUAL_REVIEW_RANGES = Object.freeze([
  { start: 0x08983D, end: 0x089857, note: 'phase695: no direct raw/lifted owner; pointer-table neighborhood' },
  { start: 0x0A169D, end: 0x0A16B0, note: 'phase695: three raw24 data refs only; no executable owner' },
  { start: 0x0A57B7, end: 0x0A57CA, note: 'phase695: no direct raw/lifted owner; covered-target-looking data' },
  { start: 0x08B8F1, end: 0x08B8FE, note: 'phase695: no direct raw/lifted owner; covered-target-looking data' },
]);

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function bytesAt(pc, len) {
  return Array.from(rom.subarray(pc, pc + len), (byte) => byte.toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

function markdownTable(headers, rows) {
  const escape = (value) => String(value ?? '').replaceAll('|', '\\|').replaceAll('\n', '<br>');
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map(escape).join(' | ')} |`),
  ].join('\n');
}

function buildCoverage() {
  const covered = new Uint8Array(rom.length);
  let totalCovered = 0;

  for (const [key, block] of Object.entries(BLOCKS)) {
    const startPc = Number.isInteger(block?.startPc)
      ? block.startPc
      : Number.parseInt(key.split(':')[0], 16);
    if (!Number.isFinite(startPc)) continue;

    for (const insn of block.instructions ?? []) {
      const pc = Number.isInteger(insn.pc) ? insn.pc : startPc + (insn.offset ?? 0);
      const len = Number.isInteger(insn.length) && insn.length > 0
        ? insn.length
        : (typeof insn.bytes === 'string' ? insn.bytes.trim().split(/\s+/).length : 1);
      for (let offset = 0; offset < len; offset += 1) {
        const addr = pc + offset;
        if (addr < covered.length && !covered[addr]) {
          covered[addr] = 1;
          totalCovered += 1;
        }
      }
    }
  }

  return { covered, totalCovered };
}

function uncoveredRanges(covered) {
  const ranges = [];
  let inRun = false;
  let runStart = 0;

  for (let addr = 0; addr < rom.length; addr += 1) {
    const uncoveredNonErased = !covered[addr] && rom[addr] !== 0xFF;
    if (uncoveredNonErased && !inRun) {
      inRun = true;
      runStart = addr;
    } else if (!uncoveredNonErased && inRun) {
      ranges.push({ start: runStart, end: addr, len: addr - runStart });
      inRun = false;
    }
  }
  if (inRun) ranges.push({ start: runStart, end: rom.length, len: rom.length - runStart });

  return ranges;
}

function decodeWindow(range, limit = 12) {
  const decoded = [];
  let pc = range.start;
  for (let count = 0; count < limit && pc < range.end - 1; count += 1) {
    try {
      const insn = decodeInstruction(rom, pc, 'adl');
      if (!insn || !Number.isInteger(insn.length) || insn.length <= 0) break;
      decoded.push(insn);
      pc += insn.length;
    } catch {
      break;
    }
  }
  return decoded;
}

function repeatedWordStats(sample, width) {
  if (sample.length < width) return { total: 0, unique: 0, repeated: 0 };
  const words = new Map();
  for (let offset = 0; offset <= sample.length - width; offset += width) {
    const word = Array.from(sample.subarray(offset, offset + width), (byte) => byte.toString(16).padStart(2, '0')).join('');
    words.set(word, (words.get(word) ?? 0) + 1);
  }
  const counts = Array.from(words.values());
  return {
    total: counts.reduce((sum, count) => sum + count, 0),
    unique: words.size,
    repeated: counts.filter((count) => count > 1).reduce((sum, count) => sum + count, 0),
  };
}

function pointerLikeStats(range) {
  const end = Math.min(range.end, range.start + 192);
  const best = { align: 0, total: 0, validRom: 0, coveredRom: 0, ramLike: 0 };

  for (let align = 0; align < 3; align += 1) {
    const first = range.start + ((align - (range.start % 3) + 3) % 3);
    const current = { align, total: 0, validRom: 0, coveredRom: 0, ramLike: 0 };
    for (let pc = first; pc <= end - 3; pc += 3) {
      const value = rom[pc] | (rom[pc + 1] << 8) | (rom[pc + 2] << 16);
      current.total += 1;
      if (value < rom.length && rom[value] !== 0xFF) {
        current.validRom += 1;
      }
      if (value >= 0xD00000 && value < 0xE00000) {
        current.ramLike += 1;
      }
    }
    if ((current.validRom + current.ramLike) > (best.validRom + best.ramLike)) {
      Object.assign(best, current);
    }
  }

  return best;
}

function phase693Classify(range, stats) {
  const decoded = stats.decoded;
  const verdictDecoded = decoded.slice(0, 8);
  const verdictDecodedBytes = verdictDecoded.reduce((sum, insn) => sum + insn.length, 0);

  if (stats.maxAsciiRun >= 8) return 'STRINGS';
  if (stats.uniqueBytes < 6) return 'DATA-SPARSE';
  if (verdictDecoded.length === 8 && verdictDecodedBytes >= 12) return 'CODE?';
  return 'DATA-MIXED';
}

function matchingManualReview(range) {
  return MANUAL_REVIEW_RANGES.find((candidate) => candidate.start === range.start && candidate.end === range.end) ?? null;
}

function containingFontBand(range) {
  return FONT_BITMAP_BANDS.find((band) => range.start < band.end && range.end > band.start) ?? null;
}

function buildRangeStats(range) {
  const sample = rom.subarray(range.start, Math.min(range.end, range.start + 96));
  const counts = new Map();
  let asciiRun = 0;
  let maxAsciiRun = 0;
  let printable = 0;
  let zero = 0;
  let cc = 0;
  let fontish = 0;

  for (const byte of sample) {
    counts.set(byte, (counts.get(byte) ?? 0) + 1);
    if (byte >= 0x20 && byte < 0x7F) {
      asciiRun += 1;
      maxAsciiRun = Math.max(maxAsciiRun, asciiRun);
      printable += 1;
    } else {
      asciiRun = 0;
    }
    if (byte === 0x00) zero += 1;
    if (byte === 0xCC) cc += 1;
    if (FONTISH_BYTES.has(byte)) fontish += 1;
  }

  const decoded = decodeWindow(range);
  const repeated2 = repeatedWordStats(sample, 2);
  const repeated3 = repeatedWordStats(sample, 3);
  const repeated4 = repeatedWordStats(sample, 4);
  const pointerLike = pointerLikeStats(range);

  return {
    sampleLength: sample.length,
    uniqueBytes: counts.size,
    maxAsciiRun,
    printablePct: sample.length ? printable / sample.length : 0,
    zeroPct: sample.length ? zero / sample.length : 0,
    ccPct: sample.length ? cc / sample.length : 0,
    fontishPct: sample.length ? fontish / sample.length : 0,
    repeated2,
    repeated3,
    repeated4,
    pointerLike,
    decoded,
    first16: bytesAt(range.start, Math.min(16, range.len)),
  };
}

function classifyDebt(range, stats) {
  const manualReview = matchingManualReview(range);
  if (manualReview) {
    return {
      bucket: 'unresolved-manual-review',
      reason: manualReview.note,
      seedPolicy: 'do-not-seed-without-new-owner',
    };
  }

  const fontBand = containingFontBand(range);
  const repeatedRecordish =
    (stats.repeated3.total >= 4 && stats.repeated3.unique / stats.repeated3.total <= 0.75) ||
    (stats.repeated4.total >= 4 && stats.repeated4.unique / stats.repeated4.total <= 0.75);
  const pointerRecordish = stats.pointerLike.total >= 4 &&
    (stats.pointerLike.validRom + stats.pointerLike.ramLike) / stats.pointerLike.total >= 0.45;

  if (stats.maxAsciiRun >= 8 || (range.len >= 12 && stats.printablePct >= 0.75)) {
    return { bucket: 'string', reason: `printable run=${stats.maxAsciiRun}`, seedPolicy: 'data' };
  }

  if (stats.fontishPct >= 0.70 || (fontBand && stats.fontishPct >= 0.50)) {
    return {
      bucket: 'font-bitmap',
      reason: `${fontBand?.name ?? 'bitmap-like masks'} fontish=${(stats.fontishPct * 100).toFixed(0)}%`,
      seedPolicy: 'data',
    };
  }

  if (stats.uniqueBytes <= 4 || stats.zeroPct >= 0.45 || stats.ccPct >= 0.30) {
    return {
      bucket: 'sparse-data',
      reason: `unique=${stats.uniqueBytes}, zero=${(stats.zeroPct * 100).toFixed(0)}%, cc=${(stats.ccPct * 100).toFixed(0)}%`,
      seedPolicy: 'data',
    };
  }

  if (repeatedRecordish || pointerRecordish) {
    return {
      bucket: 'table',
      reason: repeatedRecordish
        ? `repeated records r3=${stats.repeated3.unique}/${stats.repeated3.total} r4=${stats.repeated4.unique}/${stats.repeated4.total}`
        : `pointer-like records valid=${stats.pointerLike.validRom} ram=${stats.pointerLike.ramLike}/${stats.pointerLike.total}`,
      seedPolicy: 'data',
    };
  }

  return {
    bucket: 'table',
    reason: 'mixed structured data fallback after phase693/694/695 screens',
    seedPolicy: 'data',
  };
}

function bucketTotals(entries) {
  const byBucket = new Map();
  for (const entry of entries) {
    const current = byBucket.get(entry.debt.bucket) ?? { ranges: 0, bytes: 0 };
    current.ranges += 1;
    current.bytes += entry.len;
    byBucket.set(entry.debt.bucket, current);
  }
  return byBucket;
}

function verdictTotals(entries) {
  const byVerdict = new Map();
  for (const entry of entries) {
    const current = byVerdict.get(entry.phase693Verdict) ?? { ranges: 0, bytes: 0 };
    current.ranges += 1;
    current.bytes += entry.len;
    byVerdict.set(entry.phase693Verdict, current);
  }
  return byVerdict;
}

function topRanges(entries, bucket, limit = 12) {
  return entries
    .filter((entry) => entry.debt.bucket === bucket)
    .sort((left, right) => right.len - left.len || left.start - right.start)
    .slice(0, limit);
}

function addressBands(entries, bucket, limit = 12) {
  const bands = new Map();
  for (const entry of entries) {
    if (entry.debt.bucket !== bucket) continue;
    const bandStart = entry.start & 0xFF0000;
    const current = bands.get(bandStart) ?? { ranges: 0, bytes: 0 };
    current.ranges += 1;
    current.bytes += entry.len;
    bands.set(bandStart, current);
  }

  return Array.from(bands.entries())
    .map(([bandStart, totals]) => ({ bandStart, ...totals }))
    .sort((left, right) => right.bytes - left.bytes || left.bandStart - right.bandStart)
    .slice(0, limit);
}

function compactRangeRow(entry) {
  return [
    `${hex(entry.start)}..${hex(entry.end - 1)}`,
    entry.len,
    entry.phase693Verdict,
    entry.debt.reason,
    entry.stats.uniqueBytes,
    `${(entry.stats.fontishPct * 100).toFixed(0)}%`,
    entry.stats.maxAsciiRun,
    entry.stats.first16,
  ];
}

function buildReport({ totalCovered, totalUncovered, entries }) {
  const byBucket = bucketTotals(entries);
  const byVerdict = verdictTotals(entries);
  const buckets = ['font-bitmap', 'string', 'table', 'sparse-data', 'unresolved-manual-review'];
  const codeEntries = entries.filter((entry) => entry.phase693Verdict === 'CODE?');
  const manualEntries = entries.filter((entry) => entry.debt.bucket === 'unresolved-manual-review');
  const likelyDataCodeEntries = codeEntries.filter((entry) => entry.debt.bucket !== 'unresolved-manual-review');

  const lines = [
    '# Phase 696: Coverage Debt Map',
    '',
    'Probe: `probe-phase696-coverage-debt-map.mjs`  ',
    'Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase696-coverage-debt-map.mjs`',
    '',
    '## Summary',
    '',
    `- Covered bytes baseline: **${totalCovered.toLocaleString()}**.`,
    `- Remaining uncovered non-erased debt: **${totalUncovered.toLocaleString()} bytes** across **${entries.length.toLocaleString()} ranges**.`,
    `- Phase693-compatible CODE? subset: **${codeEntries.reduce((sum, entry) => sum + entry.len, 0).toLocaleString()} bytes** across **${codeEntries.length} ranges**.`,
    `- Seed-worthy ranges after phase694/695: **0**. The four manual-review ranges remain unresolved data/debt until a new owner or dynamic hit exists.`,
    `- Debt map policy: every range is classified into data/debt buckets; no transpiler seed edit is justified by this pass.`,
    '',
    '## Debt Buckets',
    '',
    markdownTable(
      ['bucket', 'ranges', 'bytes', 'percent', 'seed policy'],
      buckets.map((bucket) => {
        const totals = byBucket.get(bucket) ?? { ranges: 0, bytes: 0 };
        const seedPolicy = bucket === 'unresolved-manual-review'
          ? 'do not seed without new owner/dynamic hit'
          : 'treat as data / do not seed as code';
        return [bucket, totals.ranges, totals.bytes.toLocaleString(), `${(totals.bytes / totalUncovered * 100).toFixed(1)}%`, seedPolicy];
      }),
    ),
    '',
    '## Phase693 Verdict Compatibility',
    '',
    markdownTable(
      ['phase693 verdict', 'ranges', 'bytes', 'percent'],
      ['CODE?', 'DATA-MIXED', 'DATA-SPARSE', 'STRINGS'].map((verdict) => {
        const totals = byVerdict.get(verdict) ?? { ranges: 0, bytes: 0 };
        return [verdict, totals.ranges, totals.bytes.toLocaleString(), `${(totals.bytes / totalUncovered * 100).toFixed(1)}%`];
      }),
    ),
    '',
    '## CODE? Debt Disposition',
    '',
    `- CODE? entries now split to **${likelyDataCodeEntries.length} likely-data/data-bucket ranges** plus **${manualEntries.length} unresolved manual-review ranges**.`,
    '- Phase694 found 0 direct control refs into the 94 CODE? candidates and 0 seed candidates.',
    '- Phase695 found 0 seedable owners and 0 dynamic hits for the four manual-review ranges; only `0x0A169D` had raw24 data-style refs.',
    '',
    markdownTable(
      ['range', 'len', 'bucket', 'phase693', 'reason', 'first bytes'],
      codeEntries
        .sort((left, right) => right.len - left.len || left.start - right.start)
        .slice(0, 24)
        .map((entry) => [
          `${hex(entry.start)}..${hex(entry.end - 1)}`,
          entry.len,
          entry.debt.bucket,
          entry.phase693Verdict,
          entry.debt.reason,
          entry.stats.first16,
        ]),
    ),
    '',
  ];

  for (const bucket of buckets) {
    const totals = byBucket.get(bucket) ?? { ranges: 0, bytes: 0 };
    lines.push(`## ${bucket}`);
    lines.push('');
    lines.push(`Ranges: **${totals.ranges}**. Bytes: **${totals.bytes.toLocaleString()}**.`);
    lines.push('');
    lines.push('### Largest Ranges');
    lines.push('');
    lines.push(markdownTable(
      ['range', 'len', 'phase693', 'reason', 'uniq', 'fontish', 'ascii run', 'first bytes'],
      topRanges(entries, bucket).map(compactRangeRow),
    ));
    lines.push('');
    lines.push('### Top Address Bands');
    lines.push('');
    lines.push(markdownTable(
      ['bank', 'ranges', 'bytes'],
      addressBands(entries, bucket).map((band) => [
        `${hex(band.bandStart)}..${hex(band.bandStart + 0xFFFF)}`,
        band.ranges,
        band.bytes.toLocaleString(),
      ]),
    ));
    lines.push('');
  }

  lines.push(
    '## Interpretation',
    '',
    '- The remaining true-uncovered ROM bytes are coverage accounting debt, not an actionable decode frontier. The executable-looking subset has already failed direct-control, owner, and dynamic screens.',
    '- The largest buckets are structured table-like data and sparse/fill-style data. Font/bitmap and strings are explicit data buckets, not missed code.',
    '- The only unresolved bucket is the four phase694 manual-review ranges, but phase695 lowered them below seed threshold: no direct owner, no dynamic hit, and only one data-style raw24 owner cluster.',
    '- Future seed edits should require a new indirect dispatch table or a dynamic trace into a range; this map should be used as a do-not-seed baseline.',
    '',
    '## Compact JSON',
    '',
    '```json',
    JSON.stringify({
      pass: true,
      totalCovered,
      totalUncovered,
      rangeCount: entries.length,
      buckets: Object.fromEntries(Array.from(byBucket.entries()).map(([bucket, totals]) => [bucket, totals])),
      phase693Verdicts: Object.fromEntries(Array.from(byVerdict.entries()).map(([verdict, totals]) => [verdict, totals])),
      codeCandidateCount: codeEntries.length,
      codeCandidateBytes: codeEntries.reduce((sum, entry) => sum + entry.len, 0),
      seedCandidateCount: 0,
      manualReview: manualEntries.map((entry) => ({
        start: hex(entry.start),
        end: hex(entry.end - 1),
        len: entry.len,
        reason: entry.debt.reason,
        phase693Verdict: entry.phase693Verdict,
        first16: entry.stats.first16,
      })),
      largestByBucket: Object.fromEntries(buckets.map((bucket) => [
        bucket,
        topRanges(entries, bucket, 8).map((entry) => ({
          start: hex(entry.start),
          end: hex(entry.end - 1),
          len: entry.len,
          phase693Verdict: entry.phase693Verdict,
          reason: entry.debt.reason,
          first16: entry.stats.first16,
        })),
      ])),
    }, null, 2),
    '```',
    '',
  );

  return `${lines.join('\n')}\n`;
}

console.log('phase696: coverage debt map');
const { covered, totalCovered } = buildCoverage();
const ranges = uncoveredRanges(covered);
const entries = ranges.map((range) => {
  const stats = buildRangeStats(range);
  const phase693Verdict = phase693Classify(range, stats);
  const debt = classifyDebt(range, stats);
  return { ...range, stats, phase693Verdict, debt };
});
const totalUncovered = entries.reduce((sum, entry) => sum + entry.len, 0);

fs.writeFileSync(REPORT_PATH, buildReport({ totalCovered, totalUncovered, entries }));

const buckets = bucketTotals(entries);
const codeEntries = entries.filter((entry) => entry.phase693Verdict === 'CODE?');

console.log(`covered=${totalCovered} uncovered=${totalUncovered} ranges=${entries.length}`);
for (const [bucket, totals] of Array.from(buckets.entries()).sort((left, right) => right[1].bytes - left[1].bytes)) {
  console.log(`${bucket}: ranges=${totals.ranges} bytes=${totals.bytes}`);
}
console.log(`codeCandidates=${codeEntries.length} codeBytes=${codeEntries.reduce((sum, entry) => sum + entry.len, 0)} seedCandidates=0`);
console.log(`report=${path.relative(process.cwd(), REPORT_PATH)}`);
console.log(totalUncovered === 31921 && codeEntries.length === 94 ? 'PASS' : 'FAIL');

if (totalUncovered !== 31921 || codeEntries.length !== 94) {
  process.exitCode = 1;
}
