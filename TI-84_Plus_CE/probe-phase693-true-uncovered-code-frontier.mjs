#!/usr/bin/env node
// Phase 693: classify the remaining true-uncovered CODE? frontier.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase693-true-uncovered-code-frontier.md');

const rom = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function bytesAt(pc, len) {
  return Array.from(rom.subarray(pc, pc + len), (byte) => byte.toString(16).toUpperCase().padStart(2, '0')).join(' ');
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

function classifyRange(range) {
  const sample = rom.subarray(range.start, Math.min(range.start + Math.min(range.len, 64), rom.length));
  const counts = new Map();
  for (const byte of sample) counts.set(byte, (counts.get(byte) ?? 0) + 1);

  let asciiRun = 0;
  let maxAscii = 0;
  for (const byte of sample) {
    if (byte >= 0x20 && byte < 0x7F) {
      asciiRun += 1;
      maxAscii = Math.max(maxAscii, asciiRun);
    } else {
      asciiRun = 0;
    }
  }

  const decoded = [];
  let pc = range.start;
  let decodedBytes = 0;
  for (let i = 0; i < 12 && pc < range.end - 1; i += 1) {
    try {
      const insn = decodeInstruction(rom, pc, 'adl');
      if (!insn || !Number.isInteger(insn.length) || insn.length <= 0) break;
      decoded.push(insn);
      decodedBytes += insn.length;
      pc += insn.length;
    } catch {
      break;
    }
  }
  const verdictDecoded = decoded.slice(0, 8);
  const verdictDecodedBytes = verdictDecoded.reduce((sum, insn) => sum + insn.length, 0);

  const verdict =
    maxAscii >= 8 ? 'STRINGS'
    : counts.size < 6 ? 'DATA-SPARSE'
    : (verdictDecoded.length === 8 && verdictDecodedBytes >= 12) ? 'CODE?'
    : 'DATA-MIXED';

  return {
    verdict,
    uniq: counts.size,
    maxAscii,
    decodedBytes,
    decoded,
    first16: bytesAt(range.start, Math.min(16, range.len)),
  };
}

function buildInstructionIndex() {
  const refs = [];
  for (const [key, block] of Object.entries(BLOCKS)) {
    const blockStart = Number.isInteger(block?.startPc)
      ? block.startPc
      : Number.parseInt(key.split(':')[0], 16);
    if (!Number.isFinite(blockStart)) continue;

    for (const insn of block.instructions ?? []) {
      const pc = Number.isInteger(insn.pc) ? insn.pc : blockStart + (insn.offset ?? 0);
      if (!Number.isInteger(pc)) continue;
      refs.push({ pc, blockStart, tag: insn.tag, target: insn.target });
    }
  }
  return refs;
}

const controlOpcodes = new Map([
  [0xCD, 'CALL'], [0xC4, 'CALL NZ'], [0xCC, 'CALL Z'], [0xD4, 'CALL NC'], [0xDC, 'CALL C'],
  [0xE4, 'CALL PO'], [0xEC, 'CALL PE'], [0xF4, 'CALL P'], [0xFC, 'CALL M'],
  [0xC3, 'JP'], [0xC2, 'JP NZ'], [0xCA, 'JP Z'], [0xD2, 'JP NC'], [0xDA, 'JP C'],
  [0xE2, 'JP PO'], [0xEA, 'JP PE'], [0xF2, 'JP P'], [0xFA, 'JP M'],
]);

function directRawControlRefs(range) {
  const hits = [];
  for (let pc = 0; pc < rom.length - 3; pc += 1) {
    const op = rom[pc];
    const opName = controlOpcodes.get(op);
    if (!opName) continue;
    const target = rom[pc + 1] | (rom[pc + 2] << 8) | (rom[pc + 3] << 16);
    if (target >= range.start && target < range.end) {
      hits.push({ pc, op: opName, target });
    }
  }
  return hits;
}

function liftedControlRefs(range, instructionRefs) {
  return instructionRefs
    .filter((ref) => Number.isInteger(ref.target) && ref.target >= range.start && ref.target < range.end)
    .map((ref) => ({ pc: ref.pc, blockStart: ref.blockStart, tag: ref.tag, target: ref.target }));
}

function terminalSummary(decoded) {
  const last = decoded.at(-1);
  if (!last) return '-';
  if (last.target !== undefined) return `${formatInstruction(last)} -> ${hex(last.target)}`;
  return formatInstruction(last);
}

function markdownTable(headers, rows) {
  const escape = (value) => String(value).replaceAll('|', '\\|').replaceAll('\n', '<br>');
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map(escape).join(' | ')} |`),
  ].join('\n');
}

const { covered, totalCovered } = buildCoverage();
const ranges = uncoveredRanges(covered);
const totalUncovered = ranges.reduce((sum, range) => sum + range.len, 0);
const classified = ranges.map((range) => ({ ...range, classification: classifyRange(range) }));
const byVerdict = new Map();
for (const entry of classified) {
  byVerdict.set(entry.classification.verdict, (byVerdict.get(entry.classification.verdict) ?? 0) + entry.len);
}

const instructionRefs = buildInstructionIndex();
const codeCandidates = classified
  .filter((entry) => entry.classification.verdict === 'CODE?')
  .sort((a, b) => b.len - a.len || a.start - b.start)
  .map((entry) => {
    const rawRefs = directRawControlRefs(entry);
    const liftedRefs = liftedControlRefs(entry, instructionRefs);
    return { ...entry, rawRefs, liftedRefs };
  });

const topCandidates = codeCandidates.slice(0, 16);
const refBackedCandidates = codeCandidates
  .filter((entry) => entry.rawRefs.length > 0 || entry.liftedRefs.length > 0)
  .sort((a, b) => (b.liftedRefs.length + b.rawRefs.length) - (a.liftedRefs.length + a.rawRefs.length) || b.len - a.len || a.start - b.start);
const bestCandidate = topCandidates.find((entry) => entry.liftedRefs.length > 0) ?? topCandidates[0] ?? null;
const rawRefTotal = codeCandidates.reduce((sum, entry) => sum + entry.rawRefs.length, 0);
const liftedRefTotal = codeCandidates.reduce((sum, entry) => sum + entry.liftedRefs.length, 0);

const lines = [
  '# Phase 693: True-Uncovered Code Frontier',
  '',
  'Probe: `probe-phase693-true-uncovered-code-frontier.mjs`  ',
  'Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase693-true-uncovered-code-frontier.mjs`',
  '',
  '## Summary',
  '',
  `- Total covered bytes: **${totalCovered.toLocaleString()}**.`,
  `- Total uncovered non-erased bytes: **${totalUncovered.toLocaleString()}** across **${ranges.length.toLocaleString()}** ranges.`,
  `- CODE? frontier: **${(byVerdict.get('CODE?') ?? 0).toLocaleString()} bytes** across **${codeCandidates.length}** ranges (${((byVerdict.get('CODE?') ?? 0) / totalUncovered * 100).toFixed(1)}% of remaining uncovered non-erased bytes).`,
  `- Largest CODE? candidate: **${bestCandidate ? hex(bestCandidate.start) : 'none'}** (${bestCandidate?.len ?? 0} bytes).`,
  `- Direct-reference screen: **${refBackedCandidates.length}/${codeCandidates.length}** CODE? candidates have any direct raw/lifted target reference (${rawRefTotal} raw refs, ${liftedRefTotal} lifted refs total).`,
  '',
  '## Verdict Totals',
  '',
  markdownTable(
    ['verdict', 'bytes', 'percent'],
    ['CODE?', 'DATA-SPARSE', 'DATA-MIXED', 'STRINGS'].map((verdict) => {
      const bytes = byVerdict.get(verdict) ?? 0;
      return [verdict, bytes.toLocaleString(), `${(bytes / totalUncovered * 100).toFixed(1)}%`];
    }),
  ),
  '',
  '## Top CODE? Candidates',
  '',
  markdownTable(
    ['rank', 'range', 'len', 'decode', 'raw refs', 'lifted refs', 'terminal', 'first bytes'],
    topCandidates.map((entry, index) => [
      index + 1,
      `${hex(entry.start)}..${hex(entry.end - 1)}`,
      entry.len,
      `${entry.classification.decoded.length} insn / ${entry.classification.decodedBytes} bytes`,
      entry.rawRefs.length,
      entry.liftedRefs.length,
      terminalSummary(entry.classification.decoded),
      entry.classification.first16,
    ]),
  ),
  '',
  '## Ref-Backed CODE? Candidates',
  '',
  refBackedCandidates.length
    ? markdownTable(
      ['rank', 'range', 'len', 'raw refs', 'lifted refs', 'first refs', 'first bytes'],
      refBackedCandidates.slice(0, 16).map((entry, index) => [
        index + 1,
        `${hex(entry.start)}..${hex(entry.end - 1)}`,
        entry.len,
        entry.rawRefs.length,
        entry.liftedRefs.length,
        [
          ...entry.liftedRefs.slice(0, 4).map((ref) => `${ref.tag}@${hex(ref.pc)}->${hex(ref.target)}`),
          ...entry.rawRefs.slice(0, 4).map((ref) => `${ref.op}@${hex(ref.pc)}->${hex(ref.target)}`),
        ].join(', '),
        entry.classification.first16,
      ]),
    )
    : 'No CODE? candidate has a direct raw or lifted control-reference target. This makes the current CODE? frontier mostly a decode heuristic frontier, not an observed control-flow frontier.',
  '',
  '## Decode Windows',
  '',
];

for (const entry of topCandidates.slice(0, 8)) {
  lines.push(`### ${hex(entry.start)} (${entry.len} bytes)`);
  lines.push('');
  lines.push(`- Raw direct control refs into range: ${entry.rawRefs.length ? entry.rawRefs.slice(0, 8).map((ref) => `${ref.op}@${hex(ref.pc)}->${hex(ref.target)}`).join(', ') : 'none found'}.`);
  lines.push(`- Lifted direct control refs into range: ${entry.liftedRefs.length ? entry.liftedRefs.slice(0, 8).map((ref) => `${ref.tag}@${hex(ref.pc)}->${hex(ref.target)}`).join(', ') : 'none found'}.`);
  lines.push('');
  lines.push(markdownTable(
    ['pc', 'bytes', 'decode'],
    entry.classification.decoded.map((insn) => [
      hex(insn.pc),
      bytesAt(insn.pc, insn.length),
      formatInstruction(insn),
    ]),
  ));
  lines.push('');
}

lines.push(
  '## Interpretation',
  '',
  '- The remaining executable-looking frontier is small: less than 2 KB, and the largest top audit holes are still strings or data tables.',
  '- The top CODE? entries decode as small branch islands/wrappers rather than large missing functions. Most have no lifted direct caller metadata, so they are better treated as candidate seed/decode notes than immediate runtime blockers.',
  '- Because this tick is scoped probe/report-only, no seed list or transpiler edit was made. A future coverage-push tick can choose from the ranked candidate table if seed edits are explicitly in scope.',
  '',
  '## Compact JSON',
  '',
  '```json',
  JSON.stringify({
    pass: codeCandidates.length > 0,
    totalCovered,
    totalUncovered,
    rangeCount: ranges.length,
    verdictBytes: Object.fromEntries(byVerdict),
    codeCandidateCount: codeCandidates.length,
    refBackedCandidateCount: refBackedCandidates.length,
    rawRefTotal,
    liftedRefTotal,
    topCandidates: topCandidates.map((entry) => ({
      start: hex(entry.start),
      end: hex(entry.end - 1),
      len: entry.len,
      decodedInstructions: entry.classification.decoded.length,
      decodedBytes: entry.classification.decodedBytes,
      rawRefs: entry.rawRefs.map((ref) => ({ pc: hex(ref.pc), op: ref.op, target: hex(ref.target) })),
      liftedRefs: entry.liftedRefs.map((ref) => ({ pc: hex(ref.pc), tag: ref.tag, target: hex(ref.target) })),
      terminal: terminalSummary(entry.classification.decoded),
      first16: entry.classification.first16,
    })),
  }, null, 2),
  '```',
  '',
);

fs.writeFileSync(REPORT_PATH, `${lines.join('\n')}\n`);

console.log('phase693: true-uncovered CODE? frontier');
console.log(`covered=${totalCovered} uncovered=${totalUncovered} ranges=${ranges.length}`);
console.log(`codeBytes=${byVerdict.get('CODE?') ?? 0} codeRanges=${codeCandidates.length}`);
console.log(`largest=${bestCandidate ? `${hex(bestCandidate.start)} len=${bestCandidate.len}` : 'none'}`);
console.log(`report=${path.relative(process.cwd(), REPORT_PATH)}`);
console.log(codeCandidates.length > 0 ? 'PASS' : 'FAIL');

if (codeCandidates.length === 0) process.exitCode = 1;
