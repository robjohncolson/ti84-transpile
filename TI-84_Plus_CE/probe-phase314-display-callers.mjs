#!/usr/bin/env node
// Phase 314 - census of all CALL sites for SetTextSpan and SetDisplayRegion
// Run: node TI-84_Plus_CE/probe-phase314-display-callers.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rom = fs.readFileSync(path.join(__dirname, 'ROM.rom'));

function hex(value, width = 6) {
  return '0x' + value.toString(16).toUpperCase().padStart(width, '0');
}

function read24(offset) {
  return rom[offset] | (rom[offset + 1] << 8) | (rom[offset + 2] << 16);
}

function regionKey(addr) {
  return hex(addr >>> 16, 2) + 'xxxx';
}

function findCallSites(targets) {
  const sites = [];
  for (let pc = 0; pc < rom.length - 3; pc++) {
    if (rom[pc] !== 0xCD) continue;
    const target = read24(pc + 1);
    if (!targets.has(target)) continue;
    sites.push({ addr: pc, target });
  }
  return sites;
}

function groupByRegion(sites) {
  const counts = new Map();
  for (const site of sites) {
    const key = regionKey(site.addr);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

function printFamily(label, vector, impl) {
  const sites = findCallSites(new Set([vector, impl]));
  const vectorSites = sites.filter((site) => site.target === vector);
  const directSites = sites.filter((site) => site.target === impl);
  const first20 = sites.slice(0, 20).map((site) => hex(site.addr));

  console.log(label);
  console.log(`  vector: ${hex(vector)} -> ${hex(read24(vector + 1))}`);
  console.log(`  impl:   ${hex(impl)}`);
  console.log(`  total call sites: ${sites.length}`);
  console.log(`  via vector ${hex(vector)}: ${vectorSites.length}`);
  console.log(`  direct to ${hex(impl)}: ${directSites.length}`);
  console.log(`  first 20 callers: ${first20.join(', ')}`);
  console.log('  by region:');
  for (const [region, count] of groupByRegion(sites)) {
    console.log(`    ${region}: ${count}`);
  }
  console.log();
}

console.log('Phase 314: SetTextSpan / SetDisplayRegion CALL census');
console.log();
printFamily('SetTextSpan', 0x0003EC, 0x0152D8);
printFamily('SetDisplayRegion', 0x0003F0, 0x015349);
