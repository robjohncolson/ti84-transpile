#!/usr/bin/env node
// Phase 80-3: Find REAL function entries in the 0x05e4xx text-rendering family
// by scanning PRELIFTED_BLOCKS for callers.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const transpiledPath = path.join(__dirname, 'ROM.transpiled.js');
const reportPath = path.join(__dirname, 'phase80-3-05e4xx-callers-report.md');

const TARGETS = [
  0x05e242, // per-char printer
  0x05e402, // string printer with special char handling
  0x05e448, // string printer with register save/restore
  0x05e7cd, // iterative loop
  0x05e7a4, // cursor setup wrapper
  0x05e381, // unknown helper
  0x05e3e8, // unknown helper (called by 0x05e402)
  0x05e7e3, // cursor helper (called by 0x05e7a4)
  0x05e27e, // unknown helper
  0x05e490, // unknown helper
];

const hex = (v, w = 6) => '0x' + (v >>> 0).toString(16).padStart(w, '0');

console.log('Loading blocks...');
const mod = await import(pathToFileURL(transpiledPath).href);
const blocks = Array.isArray(mod.PRELIFTED_BLOCKS) ? mod.PRELIFTED_BLOCKS : Object.values(mod.PRELIFTED_BLOCKS);
console.log(`Loaded ${blocks.length} blocks`);

function findCallers(target) {
  const callers = [];
  for (const b of blocks) {
    for (const exit of b.exits || []) {
      if (exit.type === 'call' && exit.target === target) {
        callers.push(b);
        break;
      }
    }
  }
  return callers;
}

const out = [];
const log = (s) => out.push(s);

log('# Phase 80-3 — Callers of 0x05e4xx text-rendering family\n');
log('## Per-target caller scan\n');

const allCallers = new Set();
const externalCallers = new Set();
const targetSet = new Set(TARGETS);

for (const target of TARGETS) {
  const callers = findCallers(target);
  log(`\n### Callers of ${hex(target)} (${callers.length} total)\n`);
  if (callers.length === 0) {
    log('_no callers_');
    continue;
  }
  log('| caller | dasm | region |');
  log('|--------|------|--------|');
  for (const b of callers.slice(0, 20)) {
    const dasm = (b.instructions || []).map((i) => i.dasm || '').join(' ; ');
    const isExternal = b.startPc < 0x05e000 || b.startPc >= 0x05f000;
    const region = isExternal ? 'EXTERNAL' : 'internal';
    log(`| ${hex(b.startPc)} | \`${dasm.slice(0, 140)}\` | ${region} |`);
    allCallers.add(b.startPc);
    if (isExternal) externalCallers.add(b.startPc);
  }
  if (callers.length > 20) {
    log(`\n(showing first 20 of ${callers.length})`);
  }
}

// Section 2: external callers summary
log(`\n## External callers (outside 0x05e000-0x05f000) — top-level screen candidates\n`);
log(`Total unique external callers: **${externalCallers.size}**\n`);

const externalList = Array.from(externalCallers).sort((a, b) => a - b);

log('| caller | dasm preview (first 3 insts) | context — previous block ended |');
log('|--------|------------------------------|--------------------------------|');
for (const callerPc of externalList.slice(0, 30)) {
  const block = blocks.find((b) => b && b.startPc === callerPc);
  if (!block) {
    log(`| ${hex(callerPc)} | _no block_ | - |`);
    continue;
  }
  const dasmPreview = (block.instructions || []).slice(0, 3).map((i) => i.dasm || '').join(' ; ');
  log(`| ${hex(callerPc)} | \`${dasmPreview.slice(0, 140)}\` | - |`);
}
if (externalList.length > 30) {
  log(`\n(showing first 30 of ${externalList.length})`);
}

// Section 3: group external callers by ROM region (100-byte buckets)
log('\n## External callers grouped by ROM page\n');
const pageMap = new Map();
for (const c of externalList) {
  const page = Math.floor(c / 0x1000) * 0x1000;
  if (!pageMap.has(page)) pageMap.set(page, []);
  pageMap.get(page).push(c);
}
const sortedPages = Array.from(pageMap.keys()).sort((a, b) => a - b);
log('| page | count | addresses |');
log('|------|------:|-----------|');
for (const page of sortedPages) {
  const list = pageMap.get(page);
  const addrs = list.slice(0, 8).map(hex).join(', ');
  const more = list.length > 8 ? `, ... (+${list.length - 8})` : '';
  log(`| ${hex(page)} | ${list.length} | ${addrs}${more} |`);
}

// Section 4: also scan what the internal 0x05e4xx functions call (forward dependencies)
log('\n## Forward dependencies — what the 0x05e4xx family calls\n');
const externalCallees = new Set();
for (const b of blocks) {
  if (b.startPc < 0x05e000 || b.startPc >= 0x05f000) continue;
  for (const exit of b.exits || []) {
    if (exit.type === 'call' && (exit.target < 0x05e000 || exit.target >= 0x05f000)) {
      externalCallees.add(exit.target);
    }
  }
}
const calleeList = Array.from(externalCallees).sort((a, b) => a - b);
log(`Total external callees: **${calleeList.length}**\n`);
log('Addresses: ' + calleeList.slice(0, 40).map(hex).join(', ') + (calleeList.length > 40 ? ', ...' : ''));

fs.writeFileSync(reportPath, out.join('\n'));
console.log(`Wrote ${out.length} lines to ${reportPath}`);
