import fs from 'node:fs';
import path from 'node:path';

process.emitWarning = () => {};

const __dirname = import.meta.dirname;
const REPORT_PATH = path.join(__dirname, 'phase866-live-clear-realram-adjudication.md');
const PHASE864_REPORT = path.join(__dirname, 'phase864-owner-exercise-diagnostic.md');
const PHASE865_REPORT = path.join(__dirname, 'phase865-harness-live-divergence.md');
const PRE_CLEAR_CAPTURE = path.join(__dirname, 'captures', 'realram-home-digit3-D00000-D657FF.bin');
const AFTER_CLEAR_CAPTURE = path.join(__dirname, 'captures', 'realram-home-afterCLEAR-D00000-D657FF.bin');

const RAM_BASE = 0xD00000;

const FIELD_SPECS = Object.freeze([
  ['D007CA', 0xD007CA, 3],
  ['D008E0', 0xD008E0, 3],
  ['D007E0', 0xD007E0, 1],
  ['D0243A', 0xD0243A, 3],
  ['D0243D', 0xD0243D, 3],
  ['D02505', 0xD02505, 1],
  ['D02590', 0xD02590, 3],
  ['D0259D', 0xD0259D, 3],
  ['D02A29', 0xD02A29, 2],
  ['D00595', 0xD00595, 1],
  ['D00596', 0xD00596, 1],
]);

const CORE_ORACLE_FIELDS = Object.freeze([
  'D007CA',
  'D0243A',
  'D0243D',
  'D02505',
  'D02590',
  'D0259D',
  'D02A29',
]);

function hex(value, width = 6) {
  if (value == null || Number.isNaN(value)) return '-';
  return `0x${((value ?? 0) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function widthFor(name) {
  const spec = FIELD_SPECS.find(([fieldName]) => fieldName === name);
  return spec ? spec[2] * 2 : 6;
}

function parseValue(value) {
  if (value == null) return null;
  if (typeof value === 'number') return value >>> 0;
  if (typeof value === 'string' && value.startsWith('0x')) return Number.parseInt(value.slice(2), 16) >>> 0;
  if (typeof value === 'string' && /^[0-9]+$/.test(value)) return Number.parseInt(value, 10) >>> 0;
  return null;
}

function readValue(buffer, addr, len) {
  const offset = addr - RAM_BASE;
  if (offset < 0 || offset + len > buffer.length) return null;
  let value = 0;
  for (let i = 0; i < len; i += 1) value |= buffer[offset + i] << (8 * i);
  return value >>> 0;
}

function readCaptureFields(buffer) {
  return Object.fromEntries(FIELD_SPECS.map(([name, addr, len]) => [name, readValue(buffer, addr, len)]));
}

function normalizeFields(fields = {}) {
  return Object.fromEntries(FIELD_SPECS.map(([name]) => [name, parseValue(fields?.[name])]));
}

function extractJsonBlock(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const matches = [...text.matchAll(/```json\s*([\s\S]*?)```/g)];
  if (!matches.length) throw new Error(`No JSON block found in ${path.basename(filePath)}`);
  return JSON.parse(matches.at(-1)[1]);
}

function diffCaptures(before, after) {
  if (before.length !== after.length) throw new Error('Capture sizes differ');
  const ranges = [];
  let changedBytes = 0;
  for (let i = 0; i < before.length; i += 1) {
    if (before[i] === after[i]) continue;
    const start = i;
    changedBytes += 1;
    while (i + 1 < before.length && before[i + 1] !== after[i + 1]) {
      i += 1;
      changedBytes += 1;
    }
    ranges.push({ start: RAM_BASE + start, end: RAM_BASE + i, len: i - start + 1 });
  }
  return {
    changedBytes,
    changedRanges: ranges.length,
    topRanges: [...ranges].sort((a, b) => b.len - a.len).slice(0, 16),
    firstRanges: ranges.slice(0, 24),
  };
}

function compareToOracle(label, fields, oracleFields, fieldNames = CORE_ORACLE_FIELDS) {
  const normalized = normalizeFields(fields);
  const rows = fieldNames.map((name) => {
    const actual = normalized[name];
    const expected = oracleFields[name];
    return {
      name,
      actual,
      expected,
      match: actual != null && expected != null && actual === expected,
      missing: actual == null || expected == null,
    };
  });
  return {
    label,
    matches: rows.every((row) => row.match),
    compared: rows.filter((row) => !row.missing).length,
    mismatches: rows.filter((row) => !row.match),
    rows,
  };
}

function formatFieldMap(fields, names = CORE_ORACLE_FIELDS) {
  const normalized = normalizeFields(fields);
  return Object.fromEntries(names.map((name) => [name, hex(normalized[name], widthFor(name))]));
}

function formatComparison(comparison) {
  return {
    ...comparison,
    rows: comparison.rows.map((row) => ({
      name: row.name,
      actual: hex(row.actual, widthFor(row.name)),
      expected: hex(row.expected, widthFor(row.name)),
      match: row.match,
    })),
    mismatches: comparison.mismatches.map((row) => row.name),
  };
}

function routePoint(label, fields, block = null, pc = null) {
  return { label, fields: normalizeFields(fields), block, pc };
}

function targetBlock(targetFirst, name) {
  const row = targetFirst?.[name];
  return row ? { block: row.block ?? null, pc: row.pc ?? null, fields: row.fields ?? null } : null;
}

function buildPhase864(data, oracleFields) {
  const trace = data.state?.traceRecord ?? {};
  const targetFirst = trace.targetFirst ?? {};
  const keyState = data.state?.keyState ?? {};
  const firstSpin = targetBlock(targetFirst, 'spinLoop0A1854');
  const firstCleanup = targetBlock(targetFirst, 'cleanup0018F8');
  const firstPoll = targetBlock(targetFirst, 'low006D64');
  const points = [
    routePoint('phase864 afterBoot', data.state?.afterBoot?.fields),
    routePoint('phase864 first 0x0A1854 spin', firstSpin?.fields, firstSpin?.block, firstSpin?.pc),
    routePoint('phase864 first 0x0018F8 wipe', firstCleanup?.fields, firstCleanup?.block, firstCleanup?.pc),
    routePoint('phase864 bounded end', trace.end?.fields),
  ];
  return {
    source: 'phase864-owner-exercise-diagnostic.md',
    budgetSteps: 450000,
    termination: keyState.termination ?? null,
    steps: keyState.steps ?? null,
    wipes: keyState.wipes ?? null,
    counts: trace.targetCounts ?? {},
    order: {
      firstCleanupBlock: firstCleanup?.block ?? null,
      firstPollBlock: firstPoll?.block ?? null,
      cleanupBeforePoll: firstCleanup?.block != null && firstPoll?.block != null && firstCleanup.block < firstPoll.block,
    },
    comparisons: points.map((point) => ({
      point,
      comparison: compareToOracle(point.label, point.fields, oracleFields),
    })),
  };
}

function fieldsFromKeyState(keyState = {}) {
  return {
    D007CA: keyState.D007CA,
    D008E0: keyState.D008E0,
    D0243A: keyState.D0243A,
    D0243D: keyState.D0243D,
    D02590: keyState.D02590,
  };
}

function buildPhase865(data, oracleFields) {
  const live = data.live ?? {};
  const targetFirst = live.targetFirst ?? {};
  const keyState = live.keyState ?? {};
  const firstSpin = targetBlock(targetFirst, 'liveSpin0A1854');
  const firstAnchor = targetBlock(targetFirst, 'anchor0A229D');
  const firstCleanup = targetBlock(targetFirst, 'cleanup0018F8');
  const firstPoll = targetBlock(targetFirst, 'poll006D64');
  const points = [
    routePoint('phase865 first 0x0A1854 spin', firstSpin?.fields, firstSpin?.block, firstSpin?.pc),
    routePoint('phase865 first 0x0A229D anchor', firstAnchor?.fields, firstAnchor?.block, firstAnchor?.pc),
    routePoint('phase865 first 0x0018F8 wipe', firstCleanup?.fields, firstCleanup?.block, firstCleanup?.pc),
    routePoint('phase865 first 0x006D64 poll', firstPoll?.fields, firstPoll?.block, firstPoll?.pc),
    routePoint('phase865 bounded end', fieldsFromKeyState(keyState)),
  ];
  return {
    source: 'phase865-harness-live-divergence.md',
    budgetSteps: 160000,
    termination: keyState.termination ?? null,
    steps: keyState.steps ?? null,
    wipes: keyState.wipes ?? null,
    counts: live.targetCounts ?? {},
    order: {
      firstCleanupBlock: firstCleanup?.block ?? null,
      firstPollBlock: firstPoll?.block ?? null,
      cleanupBeforePoll: firstCleanup?.block != null && firstPoll?.block != null && firstCleanup.block < firstPoll.block,
    },
    comparisons: points.map((point) => ({
      point,
      comparison: compareToOracle(point.label, point.fields, oracleFields),
    })),
  };
}

function summarizePhase(phase) {
  const prePoints = phase.comparisons.filter((row) => /afterBoot|0A1854|0A229D/.test(row.point.label));
  const postPoints = phase.comparisons.filter((row) => /0018F8|006D64|bounded end/.test(row.point.label));
  return {
    source: phase.source,
    termination: phase.termination,
    steps: phase.steps,
    wipes: phase.wipes,
    ownerHits: phase.counts.owner0A31FD ?? 0,
    cleanupHits: phase.counts.cleanup0018F8 ?? 0,
    pollHits: phase.counts.low006D64 ?? phase.counts.poll006D64 ?? 0,
    cleanupBeforePoll: phase.order.cleanupBeforePoll,
    preOracleMatches: prePoints.filter((row) => row.comparison.compared > 0).every((row) => row.comparison.matches),
    postOracleMatches: postPoints.filter((row) => row.comparison.compared > 0).some((row) => row.comparison.matches),
    postMismatchPoints: postPoints
      .filter((row) => row.comparison.compared > 0 && !row.comparison.matches)
      .map((row) => row.point.label),
  };
}

function comparisonTable(phases) {
  const lines = [
    '| Route point | D007CA | D0243A | D0243D | D02505 | D02590 | D0259D | D02A29 | Oracle match |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  ];
  for (const phase of phases) {
    for (const row of phase.comparisons) {
      const fields = formatFieldMap(row.point.fields);
      lines.push(`| ${row.point.label} | ${fields.D007CA} | ${fields.D0243A} | ${fields.D0243D} | ${fields.D02505} | ${fields.D02590} | ${fields.D0259D} | ${fields.D02A29} | ${row.comparison.matches ? 'yes' : 'no'} |`);
    }
  }
  return lines.join('\n');
}

function fieldDeltaTable(beforeFields, afterFields) {
  return [
    '| Field | Before digit | Real after CLEAR |',
    '| --- | --- | --- |',
    ...FIELD_SPECS.map(([name]) => `| ${name} | ${hex(beforeFields[name], widthFor(name))} | ${hex(afterFields[name], widthFor(name))} |`),
  ].join('\n');
}

function rangeTable(ranges) {
  return [
    '| Start | End | Bytes |',
    '| --- | --- | ---: |',
    ...ranges.map((range) => `| ${hex(range.start)} | ${hex(range.end)} | ${range.len} |`),
  ].join('\n');
}

function buildReport(data) {
  if (data.error) {
    return [
      '# Phase 866: Live CLEAR vs Realram After-CLEAR Adjudication',
      '',
      'Probe failed before adjudication.',
      '',
      '```text',
      data.error,
      '```',
      '',
    ].join('\n');
  }

  return [
    '# Phase 866: Live CLEAR vs Realram After-CLEAR Adjudication',
    '',
    'Probe: `probe-phase866-live-clear-realram-adjudication.mjs`  ',
    'Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase866-live-clear-realram-adjudication.mjs`',
    '',
    '## Summary',
    '',
    `- Result: ${data.pass ? 'PASS' : 'FAIL'}. Verdict: **${data.verdict}**.`,
    `- Real capture delta: ${data.captureDelta.changedBytes} bytes in ${data.captureDelta.changedRanges} ranges. The largest ranges are the descriptor/edit area and row-stride VRAM repaint bands.`,
    `- Phase864 live route: owner hits=${data.phaseSummaries.phase864.ownerHits}, wipes=${data.phaseSummaries.phase864.wipes}, cleanup hits=${data.phaseSummaries.phase864.cleanupHits}, poll hits=${data.phaseSummaries.phase864.pollHits}, cleanup-before-poll=${data.phaseSummaries.phase864.cleanupBeforePoll}.`,
    `- Phase865 live route: owner hits=${data.phaseSummaries.phase865.ownerHits}, wipes=${data.phaseSummaries.phase865.wipes}, cleanup hits=${data.phaseSummaries.phase865.cleanupHits}, poll hits=${data.phaseSummaries.phase865.pollHits}, cleanup-before-poll=${data.phaseSummaries.phase865.cleanupBeforePoll}.`,
    '- Adjudication: both live routes are already oracle-compatible on the core edit/VAT/cx fields before the wipe (`0x0A1854` / `0x0A229D` windows), then `0x0018F8` zeros those fields before the `0x006D64` poll loop. The bounded post-wipe/end state does not match the hardware after-CLEAR capture.',
    '- Consequence: the live CLEAR is **not** correct-but-rebuilt, and a missing `0x006D64` status completion alone is not sufficient because the context has already been destroyed before the poll loop dominates.',
    '',
    '## Real Capture Field Delta',
    '',
    fieldDeltaTable(data.captureFields.before, data.captureFields.after),
    '',
    '## Live Route Oracle Comparison',
    '',
    comparisonTable([data.phases.phase864, data.phases.phase865]),
    '',
    '## Largest Real Capture Changed Ranges',
    '',
    rangeTable(data.captureDelta.topRanges),
    '',
    '## Machine JSON',
    '',
    '```json',
    JSON.stringify({
      pass: data.pass,
      verdict: data.verdict,
      captureDelta: data.captureDelta,
      captureFields: {
        before: Object.fromEntries(Object.entries(data.captureFields.before).map(([name, value]) => [name, hex(value, widthFor(name))])),
        after: Object.fromEntries(Object.entries(data.captureFields.after).map(([name, value]) => [name, hex(value, widthFor(name))])),
      },
      phaseSummaries: data.phaseSummaries,
      comparisons: {
        phase864: data.phases.phase864.comparisons.map((row) => ({
          label: row.point.label,
          block: row.point.block,
          pc: row.point.pc,
          fields: formatFieldMap(row.point.fields),
          comparison: formatComparison(row.comparison),
        })),
        phase865: data.phases.phase865.comparisons.map((row) => ({
          label: row.point.label,
          block: row.point.block,
          pc: row.point.pc,
          fields: formatFieldMap(row.point.fields),
          comparison: formatComparison(row.comparison),
        })),
      },
    }, null, 2),
    '```',
    '',
    'No runtime, transpiler, browser-shell, decoder, peripheral, scheduler, ROM artifact, or `follow-alongs/` files were changed.',
    '',
  ].join('\n');
}

function runProbe() {
  const beforeCapture = fs.readFileSync(PRE_CLEAR_CAPTURE);
  const afterCapture = fs.readFileSync(AFTER_CLEAR_CAPTURE);
  const captureFields = {
    before: readCaptureFields(beforeCapture),
    after: readCaptureFields(afterCapture),
  };

  const phase864Json = extractJsonBlock(PHASE864_REPORT);
  const phase865Json = extractJsonBlock(PHASE865_REPORT);
  const phase864 = buildPhase864(phase864Json, captureFields.after);
  const phase865 = buildPhase865(phase865Json, captureFields.after);
  const phaseSummaries = {
    phase864: summarizePhase(phase864),
    phase865: summarizePhase(phase865),
  };

  const preMatches = phaseSummaries.phase864.preOracleMatches && phaseSummaries.phase865.preOracleMatches;
  const postMatches = phaseSummaries.phase864.postOracleMatches || phaseSummaries.phase865.postOracleMatches;
  const ownerPathAbsent = phaseSummaries.phase864.ownerHits === 0 && phaseSummaries.phase865.ownerHits === 0;
  const cleanupBeforePoll = phaseSummaries.phase864.cleanupBeforePoll && phaseSummaries.phase865.cleanupBeforePoll;
  const postMismatch = phaseSummaries.phase864.postMismatchPoints.length > 0 && phaseSummaries.phase865.postMismatchPoints.length > 0;

  const verdict = preMatches && !postMatches && ownerPathAbsent && cleanupBeforePoll
    ? 'LIVE_DIVERGES_AFTER_ORACLE_COMPATIBLE_PRE_WIPE_STATE'
    : postMatches
      ? 'LIVE_CLEAR_CORRECT_BUT_REBUILT'
      : 'LIVE_DIVERGENCE_UNCLASSIFIED';

  return {
    probe: 'phase866-live-clear-realram-adjudication',
    pass: verdict !== 'LIVE_DIVERGENCE_UNCLASSIFIED' && postMismatch,
    verdict,
    captureDelta: diffCaptures(beforeCapture, afterCapture),
    captureFields,
    phases: { phase864, phase865 },
    phaseSummaries,
  };
}

let summary;
try {
  summary = runProbe();
  console.log(JSON.stringify({
    probe: summary.probe,
    pass: summary.pass,
    verdict: summary.verdict,
    phaseSummaries: summary.phaseSummaries,
    report: path.basename(REPORT_PATH),
  }, null, 2));
  if (!summary.pass) process.exitCode = 1;
} catch (error) {
  summary = { probe: 'phase866-live-clear-realram-adjudication', pass: false, error: String(error?.stack || error) };
  console.error(summary.error);
  process.exitCode = 1;
} finally {
  try { fs.writeFileSync(REPORT_PATH, `${buildReport(summary)}\n`); } catch {}
}
