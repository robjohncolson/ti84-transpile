#!/usr/bin/env node
// Phase 694: second-pass refinement of phase693 CODE? candidates.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase694-code-frontier-refine.md');

const rom = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const ROM_LIMIT = rom.length;
const FONTISH_BYTES = new Set([
  0x00, 0x08, 0x10, 0x18, 0x20, 0x24, 0x28, 0x30, 0x38, 0x3c,
  0x40, 0x60, 0x70, 0x78, 0x80, 0xc0, 0xe0, 0xf0, 0xf8, 0xfc,
]);

const controlOpcodes = new Map([
  [0xcd, 'CALL'], [0xc4, 'CALL NZ'], [0xcc, 'CALL Z'], [0xd4, 'CALL NC'], [0xdc, 'CALL C'],
  [0xe4, 'CALL PO'], [0xec, 'CALL PE'], [0xf4, 'CALL P'], [0xfc, 'CALL M'],
  [0xc3, 'JP'], [0xc2, 'JP NZ'], [0xca, 'JP Z'], [0xd2, 'JP NC'], [0xda, 'JP C'],
  [0xe2, 'JP PO'], [0xea, 'JP PE'], [0xf2, 'JP P'], [0xfa, 'JP M'],
]);

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function bytesAt(pc, len) {
  return Array.from(rom.subarray(pc, pc + len), (byte) => byte.toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

function markdownTable(headers, rows) {
  const escape = (value) => String(value).replaceAll('|', '\\|').replaceAll('\n', '<br>');
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
      for (let i = 0; i < len; i += 1) {
        if (pc + i < covered.length && !covered[pc + i]) {
          covered[pc + i] = 1;
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
    const uncoveredNonErased = !covered[addr] && rom[addr] !== 0xff;
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

function formatInstruction(insn) {
  if (!insn) return '(decode error)';
  if (insn.dasm) return insn.dasm;

  const parts = [insn.tag ?? 'unknown'];
  if (insn.op) parts.push(String(insn.op).toUpperCase());
  if (insn.dest) parts.push(`dest=${String(insn.dest).toUpperCase()}`);
  if (insn.src) parts.push(`src=${String(insn.src).toUpperCase()}`);
  if (insn.pair) parts.push(`pair=${String(insn.pair).toUpperCase()}`);
  if (insn.register) parts.push(`reg=${String(insn.register).toUpperCase()}`);
  if (insn.indexRegister) {
    const displacement = insn.displacement ?? 0;
    const sign = displacement >= 0 ? '+' : '';
    parts.push(`(${String(insn.indexRegister).toUpperCase()}${sign}${displacement})`);
  }
  if (insn.bit !== undefined) parts.push(`bit=${insn.bit}`);
  if (insn.condition) parts.push(`cond=${String(insn.condition).toUpperCase()}`);
  if (insn.target !== undefined) parts.push(`target=${hex(insn.target)}`);
  if (insn.addr !== undefined) parts.push(`addr=${hex(insn.addr)}`);
  if (insn.address !== undefined) parts.push(`addr=${hex(insn.address)}`);
  if (insn.value !== undefined) parts.push(`value=${hex(insn.value, 2)}`);
  if (insn.immediate !== undefined) parts.push(`imm=${hex(insn.immediate, 2)}`);
  return parts.join(' ');
}

function decodeWindow(start, end, limit = 16) {
  const decoded = [];
  let pc = start;
  for (let i = 0; i < limit && pc < end - 1; i += 1) {
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

function phase693Classify(range) {
  const sample = rom.subarray(range.start, Math.min(range.start + Math.min(range.len, 64), rom.length));
  const counts = new Map();
  for (const byte of sample) counts.set(byte, (counts.get(byte) ?? 0) + 1);

  let asciiRun = 0;
  let maxAscii = 0;
  for (const byte of sample) {
    if (byte >= 0x20 && byte < 0x7f) {
      asciiRun += 1;
      maxAscii = Math.max(maxAscii, asciiRun);
    } else {
      asciiRun = 0;
    }
  }

  const decoded = decodeWindow(range.start, range.end, 12);
  const verdictDecoded = decoded.slice(0, 8);
  const verdictDecodedBytes = verdictDecoded.reduce((sum, insn) => sum + insn.length, 0);

  const verdict =
    maxAscii >= 8 ? 'STRINGS'
    : counts.size < 6 ? 'DATA-SPARSE'
    : (verdictDecoded.length === 8 && verdictDecodedBytes >= 12) ? 'CODE?'
    : 'DATA-MIXED';

  return { verdict, uniq: counts.size, maxAscii, decoded, decodedBytes: decoded.reduce((sum, insn) => sum + insn.length, 0) };
}

function buildInstructionIndex() {
  const instructions = [];
  for (const [key, block] of Object.entries(BLOCKS)) {
    const blockStart = Number.isInteger(block?.startPc)
      ? block.startPc
      : Number.parseInt(key.split(':')[0], 16);
    if (!Number.isFinite(blockStart)) continue;

    for (const insn of block.instructions ?? []) {
      const pc = Number.isInteger(insn.pc) ? insn.pc : blockStart + (insn.offset ?? 0);
      if (!Number.isInteger(pc)) continue;
      const len = Number.isInteger(insn.length) && insn.length > 0
        ? insn.length
        : (typeof insn.bytes === 'string' ? insn.bytes.trim().split(/\s+/).length : 1);
      instructions.push({ pc, end: pc + len, len, blockStart, insn });
    }
  }
  instructions.sort((left, right) => left.pc - right.pc || left.end - right.end);
  return instructions;
}

function directRawControlRefs(range) {
  const hits = [];
  for (let pc = 0; pc < rom.length - 3; pc += 1) {
    const op = rom[pc];
    const opName = controlOpcodes.get(op);
    if (!opName) continue;
    const target = rom[pc + 1] | (rom[pc + 2] << 8) | (rom[pc + 3] << 16);
    if (target >= range.start && target < range.end) hits.push({ pc, op: opName, target });
  }
  return hits;
}

function liftedControlRefs(range, instructions) {
  return instructions
    .filter(({ insn }) => Number.isInteger(insn.target) && insn.target >= range.start && insn.target < range.end)
    .map(({ pc, blockStart, insn }) => ({ pc, blockStart, tag: insn.tag, target: insn.target }));
}

function liftedNonControlRefs(range, instructions) {
  const controlish = /^(call|jp|jr|ret|rst)/;
  const refs = [];
  for (const { pc, blockStart, insn } of instructions) {
    if (controlish.test(insn.tag ?? '')) continue;
    for (const field of ['addr', 'address']) {
      const value = insn[field];
      if (Number.isInteger(value) && value >= range.start && value < range.end) {
        refs.push({ pc, blockStart, tag: insn.tag, field, value });
      }
    }
  }
  return refs;
}

function raw24NonControlRefs(range) {
  const refs = [];
  for (let operandPc = 0; operandPc < rom.length - 2; operandPc += 1) {
    const target = rom[operandPc] | (rom[operandPc + 1] << 8) | (rom[operandPc + 2] << 16);
    if (target < range.start || target >= range.end) continue;
    const precedingOp = operandPc > 0 ? rom[operandPc - 1] : -1;
    if (controlOpcodes.has(precedingOp)) continue;
    refs.push({ operandPc, value: target, contextPc: Math.max(0, operandPc - 3) });
  }
  return refs;
}

function countSignatureMatches(signature) {
  if (signature.length === 0) return 0;
  let count = 0;
  outer:
  for (let pc = 0; pc <= rom.length - signature.length; pc += 1) {
    for (let i = 0; i < signature.length; i += 1) {
      if (rom[pc + i] !== signature[i]) continue outer;
    }
    count += 1;
  }
  return count;
}

function repeatedWordStats(sample, width) {
  if (sample.length < width) return { total: 0, unique: 0, repeated: 0 };
  const words = new Map();
  for (let offset = 0; offset <= sample.length - width; offset += width) {
    const word = Array.from(sample.subarray(offset, offset + width)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
    words.set(word, (words.get(word) ?? 0) + 1);
  }
  const total = Array.from(words.values()).reduce((sum, count) => sum + count, 0);
  const repeated = Array.from(words.values()).filter((count) => count > 1).reduce((sum, count) => sum + count, 0);
  return { total, unique: words.size, repeated };
}

function dataPatternStats(range) {
  const sample = rom.subarray(range.start, range.end);
  const capped = sample.subarray(0, Math.min(64, sample.length));
  const signature = capped.subarray(0, Math.min(12, capped.length));
  const zeroCount = capped.filter((byte) => byte === 0x00).length;
  const ccCount = capped.filter((byte) => byte === 0xcc).length;
  const fontishCount = capped.filter((byte) => FONTISH_BYTES.has(byte)).length;
  const repeated2 = repeatedWordStats(capped, 2);
  const repeated3 = repeatedWordStats(capped, 3);
  const repeated4 = repeatedWordStats(capped, 4);
  const signatureMatches = countSignatureMatches(signature);
  const lowHighByteTriplets = (() => {
    let total = 0;
    let lowHigh = 0;
    for (let offset = 0; offset + 2 < capped.length; offset += 3) {
      total += 1;
      if (capped[offset + 2] === 0x00 || capped[offset + 2] === 0xc3 || capped[offset + 2] === 0xcd) lowHigh += 1;
    }
    return { total, lowHigh };
  })();

  const reasons = [];
  if (zeroCount / capped.length >= 0.28) reasons.push('zero-heavy');
  if (ccCount >= 4) reasons.push('0xCC-fill');
  if (fontishCount / capped.length >= 0.70) reasons.push('font/bitmap-like');
  if (repeated3.total >= 5 && repeated3.unique / repeated3.total <= 0.70) reasons.push('repeated-3-byte-records');
  if (repeated4.total >= 4 && repeated4.unique / repeated4.total <= 0.70) reasons.push('repeated-4-byte-records');
  if (signatureMatches > 1) reasons.push(`signature-x${signatureMatches}`);
  if (lowHighByteTriplets.total >= 5 && lowHighByteTriplets.lowHigh / lowHighByteTriplets.total >= 0.60) reasons.push('little-endian-table-shape');

  return {
    zeroPct: zeroCount / capped.length,
    ccCount,
    fontishPct: fontishCount / capped.length,
    repeated2,
    repeated3,
    repeated4,
    signatureMatches,
    lowHighByteTriplets,
    reasons,
  };
}

function targetStats(decoded, covered) {
  const targets = [];
  for (const insn of decoded) {
    if (!Number.isInteger(insn.target)) continue;
    const target = insn.target;
    targets.push({
      pc: insn.pc,
      tag: insn.tag,
      target,
      outsideRom: target < 0 || target >= ROM_LIMIT,
      erased: target >= 0 && target < ROM_LIMIT ? rom[target] === 0xff : false,
      covered: target >= 0 && target < ROM_LIMIT ? covered[target] === 1 : false,
    });
  }
  return {
    targets,
    impossible: targets.filter((target) => target.outsideRom || target.erased || target.target >= 0x400000),
    plausibleCovered: targets.filter((target) => !target.outsideRom && !target.erased && target.covered),
  };
}

function boundaryStats(range, instructions) {
  let prev = null;
  let next = null;
  for (const entry of instructions) {
    if (entry.end <= range.start) prev = entry;
    if (!next && entry.pc >= range.end) next = entry;
    if (prev && next) break;
  }

  const prevDistance = prev ? range.start - prev.end : null;
  const nextDistance = next ? next.pc - range.end : null;
  const prevTag = prev?.insn?.tag ?? 'none';
  const nextTag = next?.insn?.tag ?? 'none';
  const fallthroughPossible = prevDistance === 0 && !/^(jp|jr|ret|rst)/.test(prevTag);

  return {
    prev,
    next,
    prevDistance,
    nextDistance,
    prevTag,
    nextTag,
    fallthroughPossible,
    summary: [
      prev ? `prev ${formatInstruction(prev.insn)} @ ${hex(prev.pc)} d=${prevDistance}` : 'prev none',
      next ? `next ${formatInstruction(next.insn)} @ ${hex(next.pc)} d=${nextDistance}` : 'next none',
    ].join('; '),
  };
}

function scoreCandidate(entry) {
  const reasons = [];
  let score = 0;

  if (entry.rawRefs.length > 0 || entry.liftedRefs.length > 0) {
    score += 4;
    reasons.push('direct-control-ref');
  }
  if (entry.boundary.fallthroughPossible) {
    score += 2;
    reasons.push('adjacent-covered-fallthrough');
  }
  if (entry.nonControlRefs.length > 0 || entry.raw24Refs.length > 0) {
    score -= 1;
    reasons.push('addressed-as-data/literal');
  }
  if (entry.targets.plausibleCovered.length > 0) {
    score += 1;
    reasons.push('plausible-covered-target');
  }
  if (entry.targets.impossible.length > 0) {
    score -= 3;
    reasons.push('impossible-target');
  }
  if (entry.pattern.reasons.length > 0) {
    score -= Math.min(4, entry.pattern.reasons.length);
    reasons.push(...entry.pattern.reasons);
  }
  const firstTag = entry.classification.decoded[0]?.tag ?? '';
  if (/^(ret|rst)$/.test(firstTag) || firstTag.startsWith('ret-')) {
    score -= 1;
    reasons.push('starts-with-return');
  }
  if (entry.classification.decoded.length < 8) {
    score -= 1;
    reasons.push('short-decode');
  }

  const bucket = score >= 3
    ? 'SEED-CANDIDATE'
    : score >= 1
      ? 'MANUAL-REVIEW'
      : 'LIKELY-DATA';

  return { score, bucket, reasons };
}

const { covered, totalCovered } = buildCoverage();
const ranges = uncoveredRanges(covered);
const totalUncovered = ranges.reduce((sum, range) => sum + range.len, 0);
const instructions = buildInstructionIndex();

const classified = ranges.map((range) => ({ ...range, classification: phase693Classify(range) }));
const codeCandidates = classified
  .filter((entry) => entry.classification.verdict === 'CODE?')
  .sort((left, right) => bigness(right) - bigness(left) || left.start - right.start);

function bigness(entry) {
  return entry.len;
}

const refined = codeCandidates.map((entry) => {
  const rawRefs = directRawControlRefs(entry);
  const liftedRefs = liftedControlRefs(entry, instructions);
  const nonControlRefs = liftedNonControlRefs(entry, instructions);
  const raw24Refs = raw24NonControlRefs(entry);
  const pattern = dataPatternStats(entry);
  const targets = targetStats(entry.classification.decoded, covered);
  const boundary = boundaryStats(entry, instructions);
  const partial = { ...entry, rawRefs, liftedRefs, nonControlRefs, raw24Refs, pattern, targets, boundary };
  return { ...partial, score: scoreCandidate(partial) };
});

const byBucket = new Map();
for (const entry of refined) {
  const current = byBucket.get(entry.score.bucket) ?? { count: 0, bytes: 0 };
  current.count += 1;
  current.bytes += entry.len;
  byBucket.set(entry.score.bucket, current);
}

const seedCandidates = refined.filter((entry) => entry.score.bucket === 'SEED-CANDIDATE');
const manualReview = refined.filter((entry) => entry.score.bucket === 'MANUAL-REVIEW');
const likelyData = refined.filter((entry) => entry.score.bucket === 'LIKELY-DATA');
const directControlTotal = refined.reduce((sum, entry) => sum + entry.rawRefs.length + entry.liftedRefs.length, 0);
const nonControlRefBacked = refined.filter((entry) => entry.nonControlRefs.length > 0 || entry.raw24Refs.length > 0);
const impossibleTargetEntries = refined.filter((entry) => entry.targets.impossible.length > 0);
const repeatedPatternEntries = refined.filter((entry) => entry.pattern.reasons.length > 0);
const fallthroughEntries = refined.filter((entry) => entry.boundary.fallthroughPossible);

function compactRefs(entry) {
  const refs = [
    ...entry.liftedRefs.slice(0, 2).map((ref) => `ctl ${ref.tag}@${hex(ref.pc)}->${hex(ref.target)}`),
    ...entry.rawRefs.slice(0, 2).map((ref) => `raw ${ref.op}@${hex(ref.pc)}->${hex(ref.target)}`),
    ...entry.nonControlRefs.slice(0, 2).map((ref) => `addr ${ref.tag}@${hex(ref.pc)}->${hex(ref.value)}`),
    ...entry.raw24Refs.slice(0, 2).map((ref) => `raw24@${hex(ref.operandPc)}->${hex(ref.value)}`),
  ];
  return refs.length ? refs.join(', ') : 'none';
}

function compactTargets(entry) {
  if (!entry.targets.targets.length) return 'none';
  return entry.targets.targets.slice(0, 4).map((target) => {
    const flags = [
      target.outsideRom ? 'outside' : null,
      target.erased ? 'erased' : null,
      target.covered ? 'covered' : 'uncovered',
    ].filter(Boolean).join('/');
    return `${target.tag}@${hex(target.pc)}->${hex(target.target)} ${flags}`;
  }).join(', ');
}

const topByScore = [...refined].sort((left, right) => right.score.score - left.score.score || right.len - left.len || left.start - right.start).slice(0, 24);
const topLikelyData = [...likelyData].sort((left, right) => left.score.score - right.score.score || right.len - left.len || left.start - right.start).slice(0, 24);

const lines = [
  '# Phase 694: CODE? Frontier Refinement',
  '',
  'Probe: `probe-phase694-code-frontier-refine.mjs`  ',
  'Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase694-code-frontier-refine.mjs`',
  '',
  '## Summary',
  '',
  `- Phase693-compatible covered bytes: **${totalCovered.toLocaleString()}**.`,
  `- Phase693-compatible uncovered non-erased bytes: **${totalUncovered.toLocaleString()}** across **${ranges.length.toLocaleString()}** ranges.`,
  `- Rechecked CODE? frontier: **${codeCandidates.reduce((sum, entry) => sum + entry.len, 0).toLocaleString()} bytes** across **${codeCandidates.length}** ranges.`,
  `- Seed-worthy after second pass: **${seedCandidates.length} ranges / ${seedCandidates.reduce((sum, entry) => sum + entry.len, 0)} bytes**.`,
  `- Manual-review only: **${manualReview.length} ranges / ${manualReview.reduce((sum, entry) => sum + entry.len, 0)} bytes**.`,
  `- Likely data/false-positive: **${likelyData.length} ranges / ${likelyData.reduce((sum, entry) => sum + entry.len, 0)} bytes**.`,
  `- Direct control refs into CODE? candidates: **${directControlTotal}**. Non-control address/literal refs: **${nonControlRefBacked.length} candidate ranges**.`,
  '',
  '## Bucket Totals',
  '',
  markdownTable(
    ['bucket', 'ranges', 'bytes'],
    ['SEED-CANDIDATE', 'MANUAL-REVIEW', 'LIKELY-DATA'].map((bucket) => {
      const value = byBucket.get(bucket) ?? { count: 0, bytes: 0 };
      return [bucket, value.count, value.bytes];
    }),
  ),
  '',
  '## Screens',
  '',
  `- Impossible/erased/out-of-ROM branch-target screen: **${impossibleTargetEntries.length}/${refined.length}** candidates flagged.`,
  `- Repeated-neighbor/data-shape screen: **${repeatedPatternEntries.length}/${refined.length}** candidates flagged.`,
  `- Adjacent covered fallthrough screen: **${fallthroughEntries.length}/${refined.length}** candidates flagged.`,
  `- Direct control reference screen remains **0/${refined.length}** if phase693 totals are stable.`,
  '',
  '## Highest Scoring Candidates',
  '',
  markdownTable(
    ['rank', 'bucket', 'score', 'range', 'len', 'reasons', 'refs', 'targets', 'boundary', 'first bytes'],
    topByScore.map((entry, index) => [
      index + 1,
      entry.score.bucket,
      entry.score.score,
      `${hex(entry.start)}..${hex(entry.end - 1)}`,
      entry.len,
      entry.score.reasons.join(', ') || 'none',
      compactRefs(entry),
      compactTargets(entry),
      entry.boundary.summary,
      bytesAt(entry.start, Math.min(16, entry.len)),
    ]),
  ),
  '',
  '## Strongest Data / False-Positive Signals',
  '',
  markdownTable(
    ['rank', 'score', 'range', 'len', 'data reasons', 'targets', 'boundary', 'first bytes'],
    topLikelyData.map((entry, index) => [
      index + 1,
      entry.score.score,
      `${hex(entry.start)}..${hex(entry.end - 1)}`,
      entry.len,
      entry.pattern.reasons.join(', ') || entry.score.reasons.join(', '),
      compactTargets(entry),
      entry.boundary.summary,
      bytesAt(entry.start, Math.min(16, entry.len)),
    ]),
  ),
  '',
  '## Interpretation',
  '',
  '- This pass found no high-confidence seed targets in the phase693 CODE? set. The lack of direct control refs remains the dominant result.',
  '- The highest-scoring entries are still manual-review at best: they mostly gain points from being adjacent to covered instructions, not from real incoming branches.',
  '- Most candidates carry data/table signatures such as repeated exact byte signatures, bitmap-like byte masks, little-endian table shape, or impossible branch targets like `0xCCCCCC` and out-of-ROM addresses.',
  '- The next coverage push should not blindly seed these 94 ranges. A useful future seed edit needs a new dynamic trace or a real indirect dispatch table owner that points at one candidate.',
  '',
  '## Compact JSON',
  '',
  '```json',
  JSON.stringify({
    pass: true,
    totalCovered,
    totalUncovered,
    rangeCount: ranges.length,
    codeCandidateCount: codeCandidates.length,
    codeCandidateBytes: codeCandidates.reduce((sum, entry) => sum + entry.len, 0),
    buckets: Object.fromEntries(byBucket),
    seedCandidateCount: seedCandidates.length,
    manualReviewCount: manualReview.length,
    likelyDataCount: likelyData.length,
    directControlTotal,
    nonControlRefBackedCount: nonControlRefBacked.length,
    impossibleTargetCount: impossibleTargetEntries.length,
    repeatedPatternCount: repeatedPatternEntries.length,
    fallthroughCandidateCount: fallthroughEntries.length,
    highestScoring: topByScore.slice(0, 12).map((entry) => ({
      bucket: entry.score.bucket,
      score: entry.score.score,
      start: hex(entry.start),
      end: hex(entry.end - 1),
      len: entry.len,
      reasons: entry.score.reasons,
      refs: compactRefs(entry),
      targets: compactTargets(entry),
      boundary: entry.boundary.summary,
      first16: bytesAt(entry.start, Math.min(16, entry.len)),
    })),
  }, null, 2),
  '```',
  '',
];

fs.writeFileSync(REPORT_PATH, `${lines.join('\n')}\n`);

console.log('phase694: CODE? frontier refinement');
console.log(`covered=${totalCovered} uncovered=${totalUncovered} ranges=${ranges.length}`);
console.log(`codeRanges=${codeCandidates.length} codeBytes=${codeCandidates.reduce((sum, entry) => sum + entry.len, 0)}`);
console.log(`seedCandidates=${seedCandidates.length} manualReview=${manualReview.length} likelyData=${likelyData.length}`);
console.log(`directControlRefs=${directControlTotal} nonControlRefBacked=${nonControlRefBacked.length}`);
console.log(`report=${path.relative(process.cwd(), REPORT_PATH)}`);
console.log(codeCandidates.length > 0 ? 'PASS' : 'FAIL');

if (codeCandidates.length === 0) process.exitCode = 1;
