#!/usr/bin/env node
// Phase 79 — find JT slots and indirect-jump references to 0x05e7d2, 0x05e481, 0x09cb14.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romPath = path.join(__dirname, 'ROM.rom');
const transpiledPath = path.join(__dirname, 'ROM.transpiled.js');
const romBytes = fs.readFileSync(romPath);

const TARGETS = [0x05e7d2, 0x05e481, 0x09cb14];
const hex = (v, w = 6) => '0x' + (v >>> 0).toString(16).padStart(w, '0');

// Scan FULL JT at 0x020104 for matches
console.log('# JT Slot Scan for Phase 78 parents\n');
const JT_BASE = 0x020104;
const JT_COUNT = 980;
for (const target of TARGETS) {
  const hits = [];
  for (let i = 0; i < JT_COUNT; i += 1) {
    const off = JT_BASE + i * 3;
    const val = romBytes[off] | (romBytes[off + 1] << 8) | (romBytes[off + 2] << 16);
    if (val === target) hits.push(i);
  }
  console.log(`${hex(target)} → JT slots: ${hits.length ? hits.join(', ') : '(none)'}`);
}

// Also scan for exact 24-bit address bytes anywhere in ROM (could be function pointer tables)
console.log('\n# Any 24-bit reference to each target (byte-exact scan)\n');
for (const target of TARGETS) {
  const b0 = target & 0xff;
  const b1 = (target >> 8) & 0xff;
  const b2 = (target >> 16) & 0xff;
  const hits = [];
  for (let i = 0; i + 3 <= romBytes.length; i += 1) {
    if (romBytes[i] === b0 && romBytes[i + 1] === b1 && romBytes[i + 2] === b2) {
      hits.push(i);
    }
  }
  console.log(`${hex(target)}: ${hits.length} matches, first 15: ${hits.slice(0, 15).map(hex).join(', ')}`);
}

// Look up what LIFTED BLOCKS are near 0x05e7d2, 0x05e481, 0x09cb14 (what function are they a part of?)
console.log('\n# Lifted block context for each target\n');
const mod = await import(pathToFileURL(transpiledPath).href);
const blocks = Array.isArray(mod.PRELIFTED_BLOCKS) ? mod.PRELIFTED_BLOCKS : Object.values(mod.PRELIFTED_BLOCKS);

for (const target of TARGETS) {
  console.log(`\n## ${hex(target)}\n`);
  // Find the block AT target
  const atTarget = blocks.find(b => b && b.startPc === target);
  if (atTarget) {
    console.log(`Block at ${hex(target)}:`);
    for (const inst of (atTarget.instructions || []).slice(0, 10)) {
      console.log(`  ${hex(inst.pc)}  ${inst.dasm || ''}`);
    }
    console.log(`exits: ${(atTarget.exits || []).map(e => `${e.type}→${hex(e.target || 0)}`).join(', ')}`);
  } else {
    console.log(`No block at ${hex(target)}`);
  }

  // Find blocks within ±32 bytes
  const nearby = blocks
    .filter(b => b && Math.abs(b.startPc - target) <= 32)
    .sort((a, b) => a.startPc - b.startPc);
  console.log(`\nNearby blocks (±32 bytes): ${nearby.length}`);
  for (const b of nearby.slice(0, 8)) {
    const firstInst = (b.instructions || [])[0];
    console.log(`  ${hex(b.startPc)}  ${firstInst ? firstInst.dasm : '?'}`);
  }
}
