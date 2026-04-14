#!/usr/bin/env node
// Phase 83 - scan PRELIFTED_BLOCKS for direct callers of 0x09cb14 and
// summarize one-level-up callers for any external matches.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const transpiledPath = path.join(__dirname, 'ROM.transpiled.js');
const reportPath = path.join(__dirname, 'phase83-09cb14-callers-report.md');

const TARGET = 0x09cb14;
const INTERNAL_START = 0x09c000;
const INTERNAL_END = 0x09d000;

const hex = (value, width = 6) => '0x' + (value >>> 0).toString(16).padStart(width, '0');

function getBlockExits(block) {
  return Array.isArray(block?.exits) ? block.exits : [];
}

function getBlockInstructions(block) {
  return Array.isArray(block?.instructions) ? block.instructions : [];
}

function isDirectCaller(block, target) {
  return getBlockExits(block).some((exit) => exit?.type === 'call' && exit?.target === target);
}

function findDirectCallers(blocks, target) {
  return blocks.filter((block) => typeof block?.startPc === 'number' && isDirectCaller(block, target));
}

function isExternalCaller(block) {
  return block.startPc < INTERNAL_START || block.startPc >= INTERNAL_END;
}

function previewDasm(block, count = 4) {
  const parts = getBlockInstructions(block)
    .slice(0, count)
    .map((instruction) => instruction?.dasm || '(no dasm)');

  return parts.length > 0 ? parts.join(' ; ') : '(no instructions)';
}

function formatExit(exit) {
  if (!exit || typeof exit !== 'object') {
    return 'unknown';
  }

  const label = exit.type || 'unknown';
  if (typeof exit.target === 'number') {
    return `${label} ${hex(exit.target)}`;
  }

  return label;
}

function formatExitList(block) {
  const exits = getBlockExits(block).map(formatExit);
  return exits.length > 0 ? `[${exits.join(', ')}]` : '[]';
}

function formatAddressList(addresses) {
  if (addresses.length === 0) {
    return '[]';
  }

  return `[${addresses.map((address) => hex(address)).join(', ')}]`;
}

console.log('Loading PRELIFTED_BLOCKS...');
const mod = await import(pathToFileURL(transpiledPath).href);
const BLOCKS = mod.PRELIFTED_BLOCKS;
const blocks = Object.values(BLOCKS);
console.log(`Loaded ${blocks.length} blocks`);

const allDirectCallers = findDirectCallers(blocks, TARGET).sort((a, b) => a.startPc - b.startPc);
const externalCallers = allDirectCallers.filter(isExternalCaller);
const internalCallers = allDirectCallers.filter((block) => !isExternalCaller(block));

const externalWithGrandparents = externalCallers.map((block) => {
  const grandparents = findDirectCallers(blocks, block.startPc)
    .map((caller) => caller.startPc)
    .sort((a, b) => a - b);

  return { block, grandparents };
});

const summaryCandidates = [...externalWithGrandparents].sort((left, right) => {
  if (left.grandparents.length !== right.grandparents.length) {
    return left.grandparents.length - right.grandparents.length;
  }

  return left.block.startPc - right.block.startPc;
});

const lines = [];
const push = (line = '') => lines.push(line);

push('# Phase 83 - External Callers of 0x09cb14');
push();
push('Scanned `Object.values(PRELIFTED_BLOCKS)` for blocks whose `exits` contain');
push('`{ type: \'call\', target: 0x09cb14 }`.');
push();
push(`## Direct External Callers (${externalCallers.length} found)`);
push();

if (externalWithGrandparents.length === 0) {
  push('_none_');
} else {
  for (const entry of externalWithGrandparents) {
    push(`### ${hex(entry.block.startPc)}`);
    push(`- dasm: \`${previewDasm(entry.block)}\``);
    push(`- exits: ${formatExitList(entry.block)}`);
    push(`- grandparent callers: ${formatAddressList(entry.grandparents)}`);
    push();
  }
}

push();
push('## Internal Callers within 0x09c000-0x09cfff');
push();

if (internalCallers.length === 0) {
  push('_none_');
} else {
  push('| address | dasm preview |');
  push('|---------|--------------|');
  for (const block of internalCallers) {
    push(`| ${hex(block.startPc)} | \`${previewDasm(block)}\` |`);
  }
}

push();
push('## Summary');

if (summaryCandidates.length === 0) {
  push('Best top-level candidates: none. No direct external callers matched the target address.');
} else {
  const ranked = summaryCandidates
    .map((entry) => `${hex(entry.block.startPc)} (${entry.grandparents.length} grandparents)`)
    .join(', ');
  push(`Best top-level candidates: ${ranked}`);
}

push();
fs.writeFileSync(reportPath, lines.join('\n'));

console.log(`Direct callers: ${allDirectCallers.length}`);
console.log(`External callers: ${externalCallers.length}`);
console.log(`Internal callers: ${internalCallers.length}`);
console.log(`Wrote report to ${reportPath}`);
