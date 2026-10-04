// Run through scripts/run-probe.mjs --max-time 180.
import assert from 'node:assert/strict';
import { PRELIFTED_BLOCKS, decodeEmbeddedRom } from './ROM.transpiled.js';
import { buildBlock } from './ez80-lifter.js';

const rom = decodeEmbeddedRom();
const mismatches = [];
let compared = 0;
for (const [key, existing] of Object.entries(PRELIFTED_BLOCKS)) {
  if (key === '006202:adl' || key === '006202:z80') continue;
  const rebuilt = buildBlock(rom, existing.startPc, existing.mode, { instructionsPerBlock: 64 });
  compared++;
  if (rebuilt.source !== existing.source || JSON.stringify(rebuilt.exits) !== JSON.stringify(existing.exits)) {
    if (mismatches.length < 10) mismatches.push(key);
  }
}
console.log(JSON.stringify({ compared, mismatches }));
assert.deepEqual(mismatches, [], 'shared lifter must preserve the existing generated blocks');
