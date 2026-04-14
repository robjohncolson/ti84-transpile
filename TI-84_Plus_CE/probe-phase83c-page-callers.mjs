#!/usr/bin/env node
// Phase 83c: Find external callers of all 0x09cxxx blocks, and look at page jump table
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const transpiledPath = path.join(__dirname, 'ROM.transpiled.js');

console.log('Loading ROM...');
const mod = await import(pathToFileURL(transpiledPath).href);
const BLOCKS = mod.PRELIFTED_BLOCKS;
const blocks = Object.values(BLOCKS);
console.log(`Loaded ${blocks.length} blocks`);

const hex = (n) => '0x' + (n >>> 0).toString(16).padStart(6, '0');

// 1. First 0x40 blocks in 0x09c000 page (jump table area)
const pageStart = 0x09c000;
const pageBlocks = blocks.filter(b => b.startPc >= pageStart && b.startPc < pageStart + 0x100)
  .sort((a, b) => a.startPc - b.startPc);

console.log('\nFirst 20 blocks in 0x09c000 page:');
for (const b of pageBlocks.slice(0, 20)) {
  const exits = (b.exits || []).map(e => `${e.type}@${hex(e.target || 0)}`).join(' ');
  const dasm = (b.instructions || []).slice(0, 2).map(i => i.dasm || '').join('; ');
  console.log(`  ${hex(b.startPc)}: [${exits}] -- ${dasm}`);
}

// 2. All external callers into 0x09cxxx
const targets09c = new Set(blocks.filter(b => b.startPc >= 0x09c000 && b.startPc < 0x09d000).map(b => b.startPc));
console.log('\nTotal 0x09cxxx blocks:', targets09c.size);

const externalCallerMap = new Map();
for (const b of blocks) {
  if (b.startPc >= 0x09c000 && b.startPc < 0x09d000) continue;
  for (const e of (b.exits || [])) {
    if (e.target !== undefined && targets09c.has(e.target)) {
      if (!externalCallerMap.has(e.target)) externalCallerMap.set(e.target, []);
      externalCallerMap.get(e.target).push(b.startPc);
    }
  }
}

const totalExternal = Array.from(externalCallerMap.values()).reduce((s, v) => s + v.length, 0);
console.log('Total external calls into 0x09cxxx:', totalExternal);

const sorted = Array.from(externalCallerMap.entries()).sort((a, b) => b[1].length - a[1].length);
console.log('Top 10 most-called 0x09cxxx addresses:');
for (const [target, callers] of sorted.slice(0, 10)) {
  console.log(`  ${hex(target)}: ${callers.length} callers: ${callers.slice(0, 5).map(c => hex(c)).join(', ')}`);
}

// 3. Also scan for jump-indirect exits and what they might target
const indirects = blocks.filter(b => (b.exits || []).some(e => e.type === 'jump-indirect'));
console.log('\njump-indirect blocks total:', indirects.length);
// Show first 10
for (const b of indirects.slice(0, 10)) {
  const dasm = (b.instructions || []).slice(0, 3).map(i => i.dasm || '').join('; ');
  const exits = (b.exits || []).map(e => `${e.type}`).join(' ');
  console.log(`  ${hex(b.startPc)}: ${exits} -- ${dasm}`);
}

// 4. Report
const lines = ['# Phase 83c — External Callers into 0x09cxxx Page\n'];
lines.push('## Page Jump Table (first 0x100 bytes)\n');
lines.push('| addr | exits | dasm |');
lines.push('|------|-------|------|');
for (const b of pageBlocks.slice(0, 20)) {
  const exits = (b.exits || []).map(e => `${e.type}:${hex(e.target||0)}`).join(', ');
  const dasm = (b.instructions || []).slice(0, 2).map(i => i.dasm || '').join(' ; ');
  lines.push(`| ${hex(b.startPc)} | ${exits} | \`${dasm}\` |`);
}

lines.push('\n## External Callers (by target frequency)\n');
lines.push('| target | callers | caller addresses (first 8) |');
lines.push('|--------|---------|---------------------------|');
for (const [target, callers] of sorted) {
  const addrs = callers.slice(0, 8).map(c => hex(c)).join(', ');
  const more = callers.length > 8 ? ` +${callers.length - 8}` : '';
  lines.push(`| ${hex(target)} | ${callers.length} | ${addrs}${more} |`);
}

const reportPath = path.join(__dirname, 'phase83c-page-callers-report.md');
fs.writeFileSync(reportPath, lines.join('\n'));
console.log('\nReport written to', reportPath);
