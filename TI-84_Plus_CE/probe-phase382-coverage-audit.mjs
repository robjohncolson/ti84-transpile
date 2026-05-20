#!/usr/bin/env node
// Phase 382: Coverage audit — identify top uncovered gaps and candidate seeds.
// Reads ROM bytes at gap starts, classifies as code vs data, disassembles code gaps.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Load ROM and transpiled blocks ──────────────────────────────────

const rom = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const OS_AREA_END = 0x100000;

// ── Build coverage bitmap ───────────────────────────────────────────

const covered = new Uint8Array(rom.length);
let totalCovered = 0;

for (const [key, block] of Object.entries(BLOCKS)) {
  const startPc = Number.isInteger(block?.startPc)
    ? block.startPc
    : Number.parseInt(key.split(':')[0], 16);
  if (!Number.isFinite(startPc)) continue;

  for (const ins of (block.instructions || [])) {
    const pc = Number.isInteger(ins.pc) ? ins.pc : startPc + (ins.offset || 0);
    const len = Number.isInteger(ins.length) && ins.length > 0
      ? ins.length
      : (typeof ins.bytes === 'string' ? ins.bytes.trim().split(/\s+/).length : 1);
    for (let i = 0; i < len; i++) {
      if (pc + i < covered.length && !covered[pc + i]) {
        covered[pc + i] = 1;
        totalCovered++;
      }
    }
  }
}

// ── Count non-erased bytes in OS area ───────────────────────────────

let osNonErased = 0;
let osCovered = 0;
for (let addr = 0; addr < OS_AREA_END && addr < rom.length; addr++) {
  if (rom[addr] !== 0xff) {
    osNonErased++;
    if (covered[addr]) osCovered++;
  }
}

const trueCoverage = (osCovered / osNonErased * 100).toFixed(2);
console.log(`=== Phase 382 Coverage Audit ===`);
console.log();
console.log(`Total covered bytes (all ROM): ${totalCovered.toLocaleString()}`);
console.log(`OS area (0x000000-0x0FFFFF):`);
console.log(`  Non-erased bytes: ${osNonErased.toLocaleString()}`);
console.log(`  Covered bytes:    ${osCovered.toLocaleString()}`);
console.log(`  True coverage:    ${trueCoverage}%`);
console.log();

// ── Build uncovered non-erased ranges (OS area only) ────────────────

const ranges = [];
let inRun = false;
let runStart = 0;

for (let addr = 0; addr < OS_AREA_END && addr < rom.length; addr++) {
  const uncoveredNonErased = !covered[addr] && rom[addr] !== 0xff;
  if (uncoveredNonErased && !inRun) {
    inRun = true;
    runStart = addr;
  } else if (!uncoveredNonErased && inRun) {
    inRun = false;
    ranges.push({ start: runStart, end: addr, len: addr - runStart });
  }
}
if (inRun) ranges.push({ start: runStart, end: OS_AREA_END, len: OS_AREA_END - runStart });

ranges.sort((a, b) => b.len - a.len);

// ── Classify each range ─────────────────────────────────────────────

function classify(start, len) {
  const sampleEnd = Math.min(start + Math.min(len, 64), rom.length);
  const sample = rom.slice(start, sampleEnd);

  // Try to decode up to 10 instructions
  let pc = start;
  let successfulDecodes = 0;
  let decodedBytes = 0;
  const decoded = [];

  for (let i = 0; i < 10 && pc < start + len - 1; i++) {
    try {
      const ins = decodeInstruction(rom, pc, 'adl');
      if (ins && ins.length > 0) {
        successfulDecodes++;
        decodedBytes += ins.length;
        decoded.push(ins);
        pc += ins.length;
      } else {
        break;
      }
    } catch {
      break;
    }
  }

  // Unique byte count in first 64 bytes
  const counts = new Map();
  for (const b of sample) counts.set(b, (counts.get(b) || 0) + 1);
  const uniq = counts.size;

  // ASCII run detection
  let asciiRun = 0;
  let maxAscii = 0;
  for (const b of sample) {
    if (b >= 0x20 && b < 0x7f) {
      asciiRun++;
      maxAscii = Math.max(maxAscii, asciiRun);
    } else {
      asciiRun = 0;
    }
  }

  // Hex dump of first 16 bytes
  const hex = [...sample.slice(0, 16)].map(x => x.toString(16).padStart(2, '0')).join(' ');

  const verdict =
    maxAscii >= 8 ? 'STRINGS'
    : uniq < 6 ? 'DATA-SPARSE'
    : (successfulDecodes >= 8 && decodedBytes >= 12) ? 'CODE'
    : 'DATA-MIXED';

  return { verdict, hex, uniq, maxAscii, successfulDecodes, decodedBytes, decoded };
}

// ── Report top 50 gaps ──────────────────────────────────────────────

const top = ranges.slice(0, 50);
const codeGaps = [];

console.log(`Uncovered non-erased ranges in OS area: ${ranges.length}`);
console.log(`Total uncovered non-erased bytes (OS): ${ranges.reduce((s, r) => s + r.len, 0).toLocaleString()}`);
console.log();
console.log(`=== Top 50 Uncovered Gaps (OS area, by size) ===`);
console.log('addr-start   length  verdict       uniq ascii  dec-ok  dec-bytes  first-16-bytes');

for (const r of top) {
  const c = classify(r.start, r.len);
  const addrStr = `0x${r.start.toString(16).padStart(6, '0')}`;
  const lenStr = String(r.len).padStart(6);
  const verdStr = c.verdict.padEnd(12);
  const uniqStr = String(c.uniq).padStart(4);
  const ascStr = String(c.maxAscii).padStart(5);
  const decStr = String(c.successfulDecodes).padStart(6);
  const decBStr = String(c.decodedBytes).padStart(9);

  console.log(`${addrStr}   ${lenStr}  ${verdStr} ${uniqStr} ${ascStr}  ${decStr}  ${decBStr}  ${c.hex}`);

  if (c.verdict === 'CODE') {
    codeGaps.push({ ...r, classification: c });
  }
}

// ── Aggregate by verdict ────────────────────────────────────────────

const byVerdict = {};
for (const r of ranges) {
  const c = classify(r.start, r.len);
  byVerdict[c.verdict] = (byVerdict[c.verdict] || 0) + r.len;
}

console.log();
console.log(`=== Byte totals by verdict (OS area) ===`);
const totalUncovered = ranges.reduce((s, r) => s + r.len, 0);
for (const [v, n] of Object.entries(byVerdict)) {
  console.log(`  ${v.padEnd(12)}: ${n.toString().padStart(7)} bytes (${(n / totalUncovered * 100).toFixed(1)}%)`);
}

// ── Disassembly of CODE gaps ────────────────────────────────────────

console.log();
console.log(`=== CODE Gaps — Disassembly (candidate seeds) ===`);
console.log(`Found ${codeGaps.length} CODE-classified gaps in the top 50.`);

if (codeGaps.length === 0) {
  // Expand search: look at ALL ranges for code
  console.log();
  console.log('Scanning ALL uncovered ranges for CODE gaps...');
  for (const r of ranges) {
    const c = classify(r.start, r.len);
    if (c.verdict === 'CODE') {
      codeGaps.push({ ...r, classification: c });
    }
  }
  console.log(`Found ${codeGaps.length} total CODE gaps across all ${ranges.length} ranges.`);
}

for (const gap of codeGaps.slice(0, 20)) {
  const addr = `0x${gap.start.toString(16).padStart(6, '0')}`;
  console.log();
  console.log(`--- ${addr} (${gap.len} bytes) ---`);

  for (const ins of gap.classification.decoded) {
    const pc = `0x${ins.pc.toString(16).padStart(6, '0')}`;
    const bytesHex = rom.slice(ins.pc, ins.pc + ins.length)
      .reduce((s, b) => s + b.toString(16).padStart(2, '0') + ' ', '').trim();

    // Build human-readable disassembly from decoder fields
    const tag = ins.tag || '???';
    const parts = [tag];
    if (ins.op) parts.push(ins.op);
    if (ins.dest) parts.push(`dest=${ins.dest}`);
    if (ins.src) parts.push(`src=${ins.src}`);
    if (ins.register) parts.push(ins.register);
    if (ins.indirectRegister) parts.push(`(${ins.indirectRegister})`);
    if (ins.condition) parts.push(`cond=${ins.condition}`);
    if (ins.target !== undefined) parts.push(`-> 0x${ins.target.toString(16).padStart(6, '0')}`);
    if (ins.value !== undefined) parts.push(`val=${ins.value}`);
    if (ins.immediate !== undefined) parts.push(`imm=0x${ins.immediate.toString(16)}`);
    if (ins.address !== undefined) parts.push(`addr=0x${ins.address.toString(16)}`);

    console.log(`  ${pc}  ${bytesHex.padEnd(20)} ${parts.join(' ')}`);
  }
}

// ── Candidate seed addresses ────────────────────────────────────────

console.log();
console.log(`=== Candidate Seed Addresses ===`);

const seeds = codeGaps.slice(0, 20).map(g => ({
  pc: g.start,
  mode: 'adl',
  len: g.len,
}));

if (seeds.length > 0) {
  console.log('Add these to the transpiler seed list for coverage expansion:');
  for (const s of seeds) {
    console.log(`  { pc: 0x${s.pc.toString(16).padStart(6, '0')}, mode: '${s.mode}' },  // ${s.len} bytes`);
  }
} else {
  console.log('No CODE gaps found — remaining uncovered bytes are data/strings.');
  console.log('Coverage expansion requires finding new entry points via:');
  console.log('  - Call targets in already-covered code');
  console.log('  - Jump table entries');
  console.log('  - Interrupt vectors');
}

// ── Summary ─────────────────────────────────────────────────────────

console.log();
console.log(`=== Summary ===`);
console.log(`True coverage (OS area): ${trueCoverage}%`);
console.log(`Uncovered non-erased (OS): ${totalUncovered.toLocaleString()} bytes in ${ranges.length} ranges`);
console.log(`  CODE gaps:       ${(byVerdict['CODE'] || 0).toLocaleString()} bytes`);
console.log(`  DATA-MIXED gaps: ${(byVerdict['DATA-MIXED'] || 0).toLocaleString()} bytes`);
console.log(`  DATA-SPARSE gaps: ${(byVerdict['DATA-SPARSE'] || 0).toLocaleString()} bytes`);
console.log(`  STRINGS gaps:    ${(byVerdict['STRINGS'] || 0).toLocaleString()} bytes`);
console.log(`Candidate seeds:   ${seeds.length}`);
