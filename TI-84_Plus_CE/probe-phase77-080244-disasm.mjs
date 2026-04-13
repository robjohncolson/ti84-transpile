#!/usr/bin/env node
// Quick static dump of 0x080244 (the real TEST mode label helper behind the
// 0x028f02 trampoline). Walks exits to produce a control-flow outline.

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const transpiledPath = path.join(__dirname, 'ROM.transpiled.js');

const mod = await import(pathToFileURL(transpiledPath).href);
const blocks = Array.isArray(mod.PRELIFTED_BLOCKS) ? mod.PRELIFTED_BLOCKS : Object.values(mod.PRELIFTED_BLOCKS);
const byPc = new Map();
for (const b of blocks) {
  if (b && typeof b.startPc === 'number') {
    byPc.set(`${b.startPc}_${b.mode}`, b);
  }
}
function getBlock(pc, mode = 'adl') {
  return byPc.get(`${pc}_${mode}`) || byPc.get(`${pc}_adl`) || byPc.get(`${pc}_z80`);
}

const hex = (v, w = 6) => '0x' + (v >>> 0).toString(16).padStart(w, '0');

const START_PC = Number(process.argv[2] || 0x028f02);
console.error(`# Walking from ${'0x' + START_PC.toString(16).padStart(6, '0')}`);

const visited = new Set();
const queue = [{ pc: START_PC, mode: 'adl' }];
const ordered = [];

while (queue.length && ordered.length < 80) {
  const { pc, mode } = queue.shift();
  const key = `${pc}_${mode}`;
  if (visited.has(key)) continue;
  visited.add(key);
  const b = getBlock(pc, mode);
  if (!b) { ordered.push({ pc, missing: true }); continue; }
  ordered.push({ pc, block: b });
  for (const exit of b.exits || []) {
    if (exit.type === 'fallthrough' || exit.type === 'branch' || exit.type === 'call-return') {
      queue.push({ pc: exit.target, mode: exit.targetMode || 'adl' });
    }
  }
}

ordered.sort((a, b) => a.pc - b.pc);
console.log('# 0x080244 control-flow walk (sorted by PC)\n');
for (const item of ordered) {
  if (item.missing) {
    console.log(`${hex(item.pc)}  <missing block>`);
    continue;
  }
  for (const inst of item.block.instructions || []) {
    console.log(`${hex(inst.pc)}  ${(inst.dasm || '').padEnd(36)}`);
  }
  const exitSummary = (item.block.exits || []).map((e) => `${e.type}→${hex(e.target || 0)}`).join(', ');
  if (exitSummary) console.log(`           (exits: ${exitSummary})`);
}
