#!/usr/bin/env node
// Quick diagnostic: figure out PRELIFTED_BLOCKS block shape and dasm format.

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const transpiledPath = path.join(__dirname, 'ROM.transpiled.js');

const mod = await import(pathToFileURL(transpiledPath).href);
const blocksRaw = mod.PRELIFTED_BLOCKS;
const blocks = Array.isArray(blocksRaw) ? blocksRaw : Object.values(blocksRaw);

console.log(`Total blocks: ${blocks.length}`);
console.log(`First block keys: ${Object.keys(blocks[0] || {}).join(', ')}`);
console.log('---');

// Check blocks near 0x005a38 and 0x013d1d (known print-loop pairs from Phase 76)
const targets = [0x005a35, 0x005a38, 0x013d19, 0x013d1d, 0x0059c6];
for (const t of targets) {
  const match = blocks.find((b) => b && b.startPc === t);
  if (!match) {
    console.log(`No block at ${t.toString(16)}`);
    continue;
  }
  console.log(`Block ${t.toString(16)} (mode=${match.mode}) keys: ${Object.keys(match).join(', ')}`);
  console.log(`  instructionCount=${match.instructionCount}`);
  if (match.instructions && match.instructions.length) {
    console.log(`  First 4 instruction keys: ${Object.keys(match.instructions[0] || {}).join(', ')}`);
    for (const inst of match.instructions.slice(0, 6)) {
      console.log(`    pc=${(inst.pc || 0).toString(16)} kind=${inst.kind} length=${inst.length} dasm=${JSON.stringify(inst.dasm)} target=${inst.target && inst.target.toString(16)}`);
    }
  }
  if (match.exits && match.exits.length) {
    console.log(`  Exits:`);
    for (const exit of match.exits.slice(0, 4)) {
      console.log(`    type=${exit.type} target=${exit.target && exit.target.toString(16)} targetMode=${exit.targetMode}`);
    }
  }
  console.log('---');
}

// Scan a sample of blocks for 0x59c6 in any form
const sample = blocks.slice(0, 20000);
const re = /59c6/i;
let hits = 0;
const hitSamples = [];
for (const b of sample) {
  const d = b && b.dasm;
  if (d && re.test(d)) {
    hits += 1;
    if (hitSamples.length < 5) hitSamples.push({ pc: b.startPc, dasm: d.split('\n').slice(0, 4).join(' | ') });
  }
}
console.log(`Blocks with '59c6' in dasm (of first 20000): ${hits}`);
for (const s of hitSamples) {
  console.log(`  ${s.pc.toString(16)}: ${s.dasm}`);
}
