#!/usr/bin/env node
// Phase 697: verify and summarize the coverage-frontier no-seed decision.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const INPUTS = Object.freeze({
  phase694: {
    probe: 'probe-phase694-code-frontier-refine.mjs',
    report: 'phase694-code-frontier-refine.md',
  },
  phase695: {
    probe: 'probe-phase695-manual-review-owner-search.mjs',
    report: 'phase695-manual-review-owner-search.md',
  },
  phase696: {
    probe: 'probe-phase696-coverage-debt-map.mjs',
    report: 'phase696-coverage-debt-map.md',
  },
});

const REPORT_PATH = path.join(__dirname, 'phase697-no-seed-manifest.md');
const REQUIRED_MANUAL_RANGES = Object.freeze([
  '0x08983D..0x089856',
  '0x08B8F1..0x08B8FD',
  '0x0A169D..0x0A16AF',
  '0x0A57B7..0x0A57C9',
]);

function readReport(name) {
  return fs.readFileSync(path.join(__dirname, INPUTS[name].report), 'utf8');
}

function extractCompactJson(markdown, reportName) {
  const match = markdown.match(/## Compact JSON\s+```json\s+([\s\S]*?)\s+```/);
  if (!match) {
    throw new Error(`missing Compact JSON block in ${reportName}`);
  }
  return JSON.parse(match[1]);
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

function assertTrue(value, label) {
  if (!value) {
    throw new Error(label);
  }
}

function rangeLabel(range) {
  return `${range.start}..${range.end}`;
}

function markdownTable(headers, rows) {
  const escape = (value) => String(value ?? '').replaceAll('|', '\\|').replaceAll('\n', '<br>');
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map(escape).join(' | ')} |`),
  ].join('\n');
}

const reports = Object.fromEntries(
  Object.keys(INPUTS).map((name) => [name, extractCompactJson(readReport(name), INPUTS[name].report)]),
);

assertTrue(reports.phase694.pass, 'phase694 pass flag must be true');
assertTrue(reports.phase695.pass, 'phase695 pass flag must be true');
assertTrue(reports.phase696.pass, 'phase696 pass flag must be true');

assertEqual(reports.phase694.totalCovered, 713656, 'phase694 covered bytes');
assertEqual(reports.phase694.totalUncovered, 31921, 'phase694 uncovered bytes');
assertEqual(reports.phase694.rangeCount, 2946, 'phase694 range count');
assertEqual(reports.phase694.codeCandidateCount, 94, 'phase694 CODE? range count');
assertEqual(reports.phase694.codeCandidateBytes, 1952, 'phase694 CODE? bytes');
assertEqual(reports.phase694.seedCandidateCount, 0, 'phase694 seed candidates');
assertEqual(reports.phase694.manualReviewCount, 4, 'phase694 manual-review count');
assertEqual(reports.phase694.likelyDataCount, 90, 'phase694 likely-data count');
assertEqual(reports.phase694.directControlTotal, 0, 'phase694 direct control refs');

assertEqual(reports.phase695.totalCovered, 713656, 'phase695 covered bytes');
assertEqual(reports.phase695.seedableCount, 0, 'phase695 seedable owners');
assertEqual(reports.phase695.directControlCount, 0, 'phase695 direct control owners');
assertEqual(reports.phase695.dynamicHitCount, 0, 'phase695 dynamic hits');
assertEqual(reports.phase695.raw24NonControlCount, 3, 'phase695 raw24 non-control refs');
assertEqual(reports.phase695.ranges.length, 4, 'phase695 manual-review range records');
for (const range of reports.phase695.ranges) {
  assertTrue(range.seedableOwner === false, `${rangeLabel(range)} must remain non-seedable`);
  assertEqual(range.rawControl.length, 0, `${rangeLabel(range)} raw control refs`);
  assertEqual(range.liftedControl.length, 0, `${rangeLabel(range)} lifted control refs`);
  assertEqual(range.dynamicHits.length, 0, `${rangeLabel(range)} dynamic hits`);
}

assertEqual(reports.phase696.totalCovered, 713656, 'phase696 covered bytes');
assertEqual(reports.phase696.totalUncovered, 31921, 'phase696 uncovered bytes');
assertEqual(reports.phase696.rangeCount, 2946, 'phase696 range count');
assertEqual(reports.phase696.codeCandidateCount, 94, 'phase696 CODE? range count');
assertEqual(reports.phase696.codeCandidateBytes, 1952, 'phase696 CODE? bytes');
assertEqual(reports.phase696.seedCandidateCount, 0, 'phase696 seed candidates');
assertEqual(reports.phase696.manualReview.length, 4, 'phase696 manual-review count');

const buckets = reports.phase696.buckets;
const bucketTotalBytes = Object.values(buckets).reduce((sum, bucket) => sum + bucket.bytes, 0);
const bucketTotalRanges = Object.values(buckets).reduce((sum, bucket) => sum + bucket.ranges, 0);
assertEqual(bucketTotalBytes, reports.phase696.totalUncovered, 'phase696 bucket byte sum');
assertEqual(bucketTotalRanges, reports.phase696.rangeCount, 'phase696 bucket range sum');
assertEqual(buckets['unresolved-manual-review'].ranges, 4, 'unresolved manual-review ranges');
assertEqual(buckets['unresolved-manual-review'].bytes, 77, 'unresolved manual-review bytes');

const observedManualRanges = reports.phase696.manualReview
  .map((range) => `${range.start}..${range.end}`)
  .sort();
assertEqual(JSON.stringify(observedManualRanges), JSON.stringify([...REQUIRED_MANUAL_RANGES].sort()), 'manual-review range set');

const phase694LikelyDataBytes = reports.phase694.buckets['LIKELY-DATA'].bytes;
const phase694ManualBytes = reports.phase694.buckets['MANUAL-REVIEW'].bytes;
assertEqual(phase694LikelyDataBytes + phase694ManualBytes, reports.phase694.codeCandidateBytes, 'phase694 CODE? disposition bytes');

const noSeedDecision = {
  decision: 'NO_SEED_FROM_PHASE693_696_FRONTIER',
  coveredBytes: reports.phase696.totalCovered,
  uncoveredNonErasedBytes: reports.phase696.totalUncovered,
  uncoveredRanges: reports.phase696.rangeCount,
  codeQuestionRanges: reports.phase696.codeCandidateCount,
  codeQuestionBytes: reports.phase696.codeCandidateBytes,
  seedCandidateCount: 0,
  manualReviewRanges: observedManualRanges,
  requiredNewEvidence: [
    'dynamic trace enters the range as a lifted or missing block',
    'covered code has a real indirect dispatch/table owner pointing at the range',
    'new direct control-flow reference is found with a valid caller',
  ],
};

function buildReport() {
  const bucketRows = ['table', 'font-bitmap', 'sparse-data', 'string', 'unresolved-manual-review']
    .map((bucket) => {
      const totals = buckets[bucket];
      const disposition = bucket === 'unresolved-manual-review'
        ? 'hold as unresolved data/debt; do not seed without new owner or dynamic hit'
        : 'closed as data/debt; do not seed as code';
      return [bucket, totals.ranges, totals.bytes.toLocaleString(), disposition];
    });

  const manualRows = reports.phase696.manualReview
    .slice()
    .sort((left, right) => left.start.localeCompare(right.start))
    .map((range) => [
      `${range.start}..${range.end}`,
      range.len,
      range.reason,
      'no raw/lifted control owner; no dynamic hit; no seed',
    ]);

  return [
    '# Phase 697: No-Seed Decision Manifest',
    '',
    'Probe: `probe-phase697-no-seed-manifest.mjs`  ',
    'Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase697-no-seed-manifest.mjs`',
    '',
    '## Decision',
    '',
    '- Decision: **NO SEED** from the phase693-696 coverage frontier.',
    '- Scope: the 31,921 remaining uncovered non-erased ROM bytes and the 94 CODE? candidates identified by phase693.',
    '- Basis: phase694 found 0 seed candidates and 0 direct control refs; phase695 found 0 seedable owners and 0 dynamic hits for the four manual-review ranges; phase696 grouped all remaining bytes as data/debt.',
    '- Allowed future change: a seed edit requires new evidence, not another blind pass over the same ranges.',
    '',
    '## Evidence Inputs',
    '',
    markdownTable(
      ['phase', 'probe', 'report', 'key result'],
      [
        ['694', INPUTS.phase694.probe, INPUTS.phase694.report, '94 CODE? ranges refined to 90 likely-data + 4 manual-review; 0 seed candidates; 0 direct control refs'],
        ['695', INPUTS.phase695.probe, INPUTS.phase695.report, '4 manual-review ranges checked; 0 seedable owners; 0 dynamic hits; only 3 raw24 non-control refs'],
        ['696', INPUTS.phase696.probe, INPUTS.phase696.report, '31,921 uncovered bytes grouped into data/debt buckets; 94 CODE? candidates closed as do-not-seed debt'],
      ],
    ),
    '',
    '## Debt Manifest',
    '',
    markdownTable(['bucket', 'ranges', 'bytes', 'disposition'], bucketRows),
    '',
    '## Manual-Review Hold List',
    '',
    markdownTable(['range', 'len', 'reason', 'current policy'], manualRows),
    '',
    '## Seed Proposal Admission Rules',
    '',
    '- A dynamic trace must enter the proposed range as a lifted block or missing block; or',
    '- A real indirect dispatch/table owner from covered code must point at the proposed range; or',
    '- A newly discovered direct control-flow reference must identify a valid caller.',
    '- Without one of those, the proposal stays no-seed debt. Adjacency, plausible decoded branch targets, and data-like raw24 references are insufficient.',
    '',
    '## Compact JSON',
    '',
    '```json',
    JSON.stringify({ pass: true, ...noSeedDecision }, null, 2),
    '```',
    '',
  ].join('\n');
}

fs.writeFileSync(REPORT_PATH, `${buildReport()}\n`);

console.log('phase697: no-seed manifest');
console.log(`covered=${noSeedDecision.coveredBytes} uncovered=${noSeedDecision.uncoveredNonErasedBytes} ranges=${noSeedDecision.uncoveredRanges}`);
console.log(`codeQuestion=${noSeedDecision.codeQuestionRanges} ranges / ${noSeedDecision.codeQuestionBytes} bytes seedCandidates=${noSeedDecision.seedCandidateCount}`);
console.log(`manualReview=${noSeedDecision.manualReviewRanges.join(',')}`);
console.log(`report=${path.relative(process.cwd(), REPORT_PATH)}`);
console.log('PASS');
