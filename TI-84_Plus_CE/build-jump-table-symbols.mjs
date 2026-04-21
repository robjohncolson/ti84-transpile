#!/usr/bin/env node
// Phase 25H-a: Build jump-table symbol cross-reference.
//
// Walks the TI-84 Plus CE OS jump table at ROM 0x020104 (980 entries * 4 bytes each,
// format `C3 xx yy zz` = `JP 0xzzyyxx`), and cross-references every slot address
// against the CE toolchain's ti84pceg.inc name equates.
//
// Source: https://raw.githubusercontent.com/CE-Programming/toolchain/master/src/include/ti84pceg.inc
// Saved locally at TI-84_Plus_CE/references/ti84pceg.inc.
//
// Emits:
//   phase25h-a-jump-table.json — [{slot, slotAddr, name, target, isJP}]
//   phase25h-a-jump-table-report.md — readable table + summary counts

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROM_PATH = join(__dirname, 'ROM.rom');
const INC_PATH = join(__dirname, 'references', 'ti84pceg.inc');
const JSON_PATH = join(__dirname, 'phase25h-a-jump-table.json');
const MD_PATH = join(__dirname, 'phase25h-a-jump-table-report.md');

const JUMP_TABLE_BASE = 0x020104;
const ENTRY_COUNT = 980;
const ENTRY_SIZE = 4;

const rom = readFileSync(ROM_PATH);
const inc = readFileSync(INC_PATH, 'utf8');

// Parse the include file for lines like `?Name := 0020104h`.
// Keep only entries whose address is inside the jump-table range.
const nameByAddr = new Map();
const re = /^\?([A-Za-z_][A-Za-z0-9_]*)\s*:=\s*0([0-9A-Fa-f]+)h/gm;
let m;
while ((m = re.exec(inc)) !== null) {
  const name = m[1];
  const addr = parseInt(m[2], 16);
  if (addr >= JUMP_TABLE_BASE && addr < JUMP_TABLE_BASE + ENTRY_COUNT * ENTRY_SIZE) {
    // Collision check — first wins, log subsequent aliases.
    if (!nameByAddr.has(addr)) {
      nameByAddr.set(addr, name);
    } else {
      const existing = nameByAddr.get(addr);
      if (!existing.includes('/' + name)) nameByAddr.set(addr, existing + '/' + name);
    }
  }
}

// Walk the jump table.
const entries = [];
let jpCount = 0;
let namedCount = 0;
for (let i = 0; i < ENTRY_COUNT; i++) {
  const slotAddr = JUMP_TABLE_BASE + i * ENTRY_SIZE;
  const b0 = rom[slotAddr];
  const b1 = rom[slotAddr + 1];
  const b2 = rom[slotAddr + 2];
  const b3 = rom[slotAddr + 3];
  const isJP = (b0 === 0xC3);
  const target = b1 | (b2 << 8) | (b3 << 16);
  const name = nameByAddr.get(slotAddr) || null;
  if (isJP) jpCount++;
  if (name) namedCount++;
  entries.push({
    slot: i,
    slotAddr: '0x' + slotAddr.toString(16).padStart(6, '0').toUpperCase(),
    slotAddrNum: slotAddr,
    opcode: '0x' + b0.toString(16).padStart(2, '0').toUpperCase(),
    isJP,
    target: '0x' + target.toString(16).padStart(6, '0').toUpperCase(),
    targetNum: target,
    name,
  });
}

writeFileSync(JSON_PATH, JSON.stringify(entries, null, 2));

// Markdown report.
const lines = [];
lines.push('# Phase 25H-a: OS Jump Table Symbol Cross-Reference');
lines.push('');
lines.push(`Generated: ${new Date().toISOString().slice(0, 10)}`);
lines.push(`Jump table base: 0x${JUMP_TABLE_BASE.toString(16).toUpperCase()}`);
lines.push(`Entries: ${ENTRY_COUNT} × 4 bytes (JP instruction format)`);
lines.push(`Source: CE-Programming/toolchain \`src/include/ti84pceg.inc\` (master)`);
lines.push('');
lines.push('## Summary');
lines.push('');
lines.push(`- Total slots: **${ENTRY_COUNT}**`);
lines.push(`- JP-format slots (0xC3 opcode): **${jpCount}**`);
lines.push(`- Named slots (matched in ti84pceg.inc): **${namedCount}**`);
lines.push(`- Unnamed slots: **${ENTRY_COUNT - namedCount}**`);
lines.push(`- Coverage: **${(namedCount / ENTRY_COUNT * 100).toFixed(2)}%**`);
lines.push('');
lines.push('## Full mapping');
lines.push('');
lines.push('| # | Slot | JP? | Target | Name |');
lines.push('|--:|:---|:---:|:---|:---|');
for (const e of entries) {
  const jp = e.isJP ? '✓' : `**${e.opcode}**`;
  const name = e.name ?? '_(unnamed)_';
  lines.push(`| ${e.slot} | \`${e.slotAddr}\` | ${jp} | \`${e.target}\` | ${name} |`);
}

writeFileSync(MD_PATH, lines.join('\n') + '\n');

console.log(`Jump table: ${ENTRY_COUNT} entries, ${jpCount} JPs, ${namedCount} named (${(namedCount/ENTRY_COUNT*100).toFixed(1)}%).`);
console.log(`JSON → ${JSON_PATH}`);
console.log(`MD   → ${MD_PATH}`);
