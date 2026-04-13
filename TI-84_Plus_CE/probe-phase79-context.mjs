#!/usr/bin/env node
// Phase 79 — dump the full block context around 0x05e7d2, 0x05e481, 0x09cb14
// to identify the real function entries.

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const transpiledPath = path.join(__dirname, 'ROM.transpiled.js');

const mod = await import(pathToFileURL(transpiledPath).href);
const blocks = Array.isArray(mod.PRELIFTED_BLOCKS) ? mod.PRELIFTED_BLOCKS : Object.values(mod.PRELIFTED_BLOCKS);

const hex = (v, w = 6) => '0x' + (v >>> 0).toString(16).padStart(w, '0');

function dumpRegion(lo, hi, label) {
  console.log(`\n## ${label}: ${hex(lo)}-${hex(hi)}\n`);
  const inRange = blocks
    .filter((b) => b && b.startPc >= lo && b.startPc <= hi)
    .sort((a, b) => a.startPc - b.startPc);
  for (const b of inRange) {
    for (const inst of (b.instructions || [])) {
      console.log(`  ${hex(inst.pc)}  ${(inst.dasm || '').padEnd(36)}`);
    }
    const exits = (b.exits || []).map((e) => `${e.type}→${hex(e.target || 0)}`).join(', ');
    if (exits) console.log(`           [${exits}]`);
  }
}

// Look at full function range containing each parent
dumpRegion(0x05e7a0, 0x05e820, '0x05e7d2 region');
dumpRegion(0x05e400, 0x05e4c0, '0x05e481 region');
dumpRegion(0x09caf0, 0x09cb80, '0x09cb14 region');

// Also dump 0x05e242 context (the shared helper)
dumpRegion(0x05e1a0, 0x05e290, '0x05e242 shared helper');
