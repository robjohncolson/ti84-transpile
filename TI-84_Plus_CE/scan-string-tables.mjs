#!/usr/bin/env node
// Scan ROM for printable ASCII string runs (length >= 5) terminated by null
// or 0xCE (TI-OS control byte). Group by region, report adjacent string tables.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rom = fs.readFileSync(path.join(__dirname, 'ROM.rom'));

const hex = (v, w = 6) => `0x${(v >>> 0).toString(16).padStart(w, '0')}`;

function isPrintable(b) {
  return b >= 0x20 && b <= 0x7e;
}

const minLen = 5;
const strings = [];

let runStart = -1;
for (let i = 0; i < rom.length; i++) {
  const b = rom[i];
  if (isPrintable(b)) {
    if (runStart === -1) runStart = i;
  } else {
    if (runStart !== -1) {
      const len = i - runStart;
      if (len >= minLen) {
        // Capture and check the terminator
        const terminator = b;
        let str = '';
        for (let k = runStart; k < i; k++) str += String.fromCharCode(rom[k]);
        strings.push({ addr: runStart, len, terminator, str });
      }
      runStart = -1;
    }
  }
}

console.log(`Found ${strings.length} ASCII strings of length >= ${minLen}`);

// Group strings into clusters (within 32 bytes of next string = same table)
const clusters = [];
let current = [];
for (let i = 0; i < strings.length; i++) {
  const s = strings[i];
  if (current.length === 0) {
    current.push(s);
  } else {
    const prev = current[current.length - 1];
    const gap = s.addr - (prev.addr + prev.len);
    if (gap < 32) {
      current.push(s);
    } else {
      if (current.length >= 2) clusters.push(current);
      current = [s];
    }
  }
}
if (current.length >= 2) clusters.push(current);

console.log(`Found ${clusters.length} clusters of 2+ adjacent strings\n`);

// Print top clusters by string count, sorted by location
clusters.sort((a, b) => a[0].addr - b[0].addr);
const interesting = clusters.filter(c => c.length >= 3);
console.log(`Clusters with 3+ strings: ${interesting.length}\n`);

for (const cluster of interesting.slice(0, 50)) {
  const start = cluster[0].addr;
  const end = cluster[cluster.length - 1].addr + cluster[cluster.length - 1].len;
  const region = (start >> 12) << 12;
  console.log(`=== ${hex(start)}-${hex(end)} (${cluster.length} strings, ~${end - start} bytes) ===`);
  for (const s of cluster.slice(0, 20)) {
    const term = s.terminator === 0x00 ? '\\0' : s.terminator === 0xce ? '\\xce' : `\\x${s.terminator.toString(16).padStart(2, '0')}`;
    console.log(`  ${hex(s.addr)} (${s.len.toString().padStart(2)}): "${s.str}"${term}`);
  }
  if (cluster.length > 20) console.log(`  ... ${cluster.length - 20} more`);
  console.log();
}
