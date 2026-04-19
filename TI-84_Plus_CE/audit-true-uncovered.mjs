#!/usr/bin/env node
// Classify the genuinely-uncovered non-erased bytes: are they code or data?

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeInstruction } from './ez80-decoder.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const rom = fs.readFileSync(path.join(here, 'ROM.rom'));
const { PRELIFTED_BLOCKS } = await import('./ROM.transpiled.js');

const covered = new Uint8Array(rom.length);
let totalCovered = 0;
for (const [key, block] of Object.entries(PRELIFTED_BLOCKS)) {
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

// Build uncovered non-erased ranges
const ranges = [];
let inRun = false;
let runStart = 0;
for (let addr = 0; addr < rom.length; addr++) {
  const isErased = rom[addr] === 0xff;
  const isUncoveredNonErased = !covered[addr] && !isErased;
  if (isUncoveredNonErased && !inRun) { inRun = true; runStart = addr; }
  else if (!isUncoveredNonErased && inRun) {
    inRun = false;
    ranges.push({ start: runStart, end: addr, len: addr - runStart });
  }
}
if (inRun) ranges.push({ start: runStart, end: rom.length, len: rom.length - runStart });

const totalUncoveredNonErased = ranges.reduce((s, r) => s + r.len, 0);
console.log(`Total covered bytes: ${totalCovered}`);
console.log(`Total uncovered non-erased ranges: ${ranges.length}`);
console.log(`Total uncovered non-erased bytes: ${totalUncoveredNonErased}`);
console.log();

// Sort by length, take top 40
ranges.sort((a, b) => b.len - a.len);

// Classify: try to disassemble the range start; high entropy + varied bytes = likely data
function classify(start, len) {
  const sample = rom.slice(start, Math.min(start + Math.min(len, 64), rom.length));
  // Try decode 8 instructions
  let pc = start;
  let successfulDecodes = 0;
  let totalDecodes = 0;
  let decodedBytes = 0;
  try {
    for (let i = 0; i < 8 && pc < start + len - 1; i++) {
      totalDecodes++;
      try {
        const ins = decodeInstruction(rom, pc, 'adl');
        if (ins && ins.length > 0) {
          successfulDecodes++;
          decodedBytes += ins.length;
          pc += ins.length;
        } else break;
      } catch { break; }
    }
  } catch {}
  // Entropy-ish: unique byte count in first 64 bytes
  const counts = new Map();
  for (const b of sample) counts.set(b, (counts.get(b) || 0) + 1);
  const uniq = counts.size;
  // Look for printable ASCII strings
  let asciiRun = 0, maxAscii = 0;
  for (const b of sample) {
    if (b >= 0x20 && b < 0x7f) { asciiRun++; maxAscii = Math.max(maxAscii, asciiRun); }
    else asciiRun = 0;
  }
  // Near-start instruction bytes (hex) for quick eyeball
  const hex = [...sample.slice(0, 16)].map(x => x.toString(16).padStart(2, '0')).join(' ');
  const verdict =
    maxAscii >= 8 ? 'STRINGS'
    : uniq < 6 ? 'DATA-SPARSE'
    : (successfulDecodes === 8 && decodedBytes >= 12) ? 'CODE?'
    : 'DATA-MIXED';
  return { verdict, hex, uniq, maxAscii, decodes: `${successfulDecodes}/${totalDecodes}` };
}

console.log('=== Top 40 uncovered non-erased ranges ===');
console.log('addr-start   length    verdict        uniq ascii dec  bytes');
for (const r of ranges.slice(0, 40)) {
  const c = classify(r.start, r.len);
  console.log(
    `0x${r.start.toString(16).padStart(6,'0')}   ${String(r.len).padStart(7)}   ${c.verdict.padEnd(13)} ${String(c.uniq).padStart(3)}  ${String(c.maxAscii).padStart(4)}  ${c.decodes}  ${c.hex}`
  );
}

// Aggregate by verdict
const byVerdict = { 'CODE?': 0, 'DATA-SPARSE': 0, 'DATA-MIXED': 0, 'STRINGS': 0 };
for (const r of ranges) {
  const c = classify(r.start, r.len);
  byVerdict[c.verdict] = (byVerdict[c.verdict] || 0) + r.len;
}
console.log();
console.log('=== Byte totals by verdict (all ranges) ===');
for (const [v, n] of Object.entries(byVerdict)) {
  console.log(`  ${v.padEnd(13)}: ${n.toString().padStart(7)} bytes (${(n/totalUncoveredNonErased*100).toFixed(1)}%)`);
}
