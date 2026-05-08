#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');

const ROM = fs.readFileSync(ROM_PATH);
const ROM_SIZE = ROM.length;

const TARGET_ADDR = 0xD007D0;
const TARGET_LE = [0xD0, 0x07, 0xD0]; // little-endian bytes

// Exact store patterns for D007D0
const DIRECT_A_PATTERN = [0x32, ...TARGET_LE];             // LD (D007D0),A
const DIRECT_HL_PATTERN = [0x22, ...TARGET_LE];            // LD (D007D0),HL
const PAIR_WRITE_PATTERNS = [
  { pair: 'bc', bytes: [0xED, 0x43, ...TARGET_LE] },
  { pair: 'de', bytes: [0xED, 0x53, ...TARGET_LE] },
  { pair: 'hl', bytes: [0xED, 0x63, ...TARGET_LE] },
  { pair: 'sp', bytes: [0xED, 0x73, ...TARGET_LE] },
];

// IX/IY store patterns
const IX_HL_PATTERN = [0xDD, 0x22, ...TARGET_LE];          // LD (D007D0),IX
const IY_HL_PATTERN = [0xFD, 0x22, ...TARGET_LE];          // LD (D007D0),IY

// Nearby addresses (D007CE..D007D5) — the pointer may be part of a struct
const NEARBY_ADDRS = [];
for (let a = 0xD007CE; a <= 0xD007D5; a++) {
  if (a === TARGET_ADDR) continue;
  NEARBY_ADDRS.push(a);
}

// Store opcodes for the broader sweep
const STORE_OPCODES = new Map([
  [0x32, 'LD (imm24),A'],
  [0x22, 'LD (imm24),HL'],
]);
const ED_STORE_OPCODES = new Map([
  [0x43, 'LD (imm24),BC'],
  [0x53, 'LD (imm24),DE'],
  [0x63, 'LD (imm24),HL'],
  [0x73, 'LD (imm24),SP'],
]);

function hex(value, width = 6) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function regionLabel(addr) {
  const page = (addr >>> 16) & 0xFF;
  if (page === 0x09) return 'STAT';
  if (page === 0x08) return 'UI/menu';
  if (page >= 0x06 && page <= 0x07) return 'Editor';
  if (page >= 0x04 && page <= 0x05) return 'OS-core';
  if (page <= 0x03) return 'OS-low';
  return `${hex(page, 2)}xxxx`;
}

function scanPattern(bytes) {
  const hits = [];
  for (let i = 0; i <= ROM_SIZE - bytes.length; i++) {
    let matched = true;
    for (let j = 0; j < bytes.length; j++) {
      if (ROM[i + j] !== bytes[j]) {
        matched = false;
        break;
      }
    }
    if (matched) {
      hits.push(i);
    }
  }
  return hits;
}

function formatGenericProps(inst) {
  const ignored = new Set([
    'pc', 'length', 'nextPc', 'tag', 'mode', 'modePrefix', 'fallthrough', 'terminates',
  ]);
  const parts = [];

  for (const [key, value] of Object.entries(inst ?? {})) {
    if (ignored.has(key) || value === undefined || value === null) {
      continue;
    }

    if (typeof value === 'number') {
      if (key === 'addr' || key === 'target') {
        parts.push(`${key}=${hex(value)}`);
      } else if (key === 'value') {
        parts.push(`${key}=${hexByte(value)}`);
      } else {
        parts.push(`${key}=${value}`);
      }
      continue;
    }

    parts.push(`${key}=${value}`);
  }

  return parts.join(' ');
}

function formatInstruction(inst) {
  switch (inst?.tag) {
    case 'ld-reg-imm':
      return `ld ${inst.dest}, ${hexByte(inst.value)}`;
    case 'ld-mem-reg':
      return `ld (${hex(inst.addr)}), ${inst.src}`;
    case 'ld-reg-mem':
      return `ld ${inst.dest}, (${hex(inst.addr)})`;
    case 'ld-pair-imm':
      return `ld ${inst.pair}, ${hex(inst.value, inst.value > 0xFFFF ? 6 : 4)}`;
    case 'ld-mem-pair':
      return `ld (${hex(inst.addr)}), ${inst.pair}`;
    case 'call':
      return `call ${hex(inst.target)}`;
    case 'call-conditional':
      return `call ${inst.condition}, ${hex(inst.target)}`;
    case 'jp':
      return `jp ${hex(inst.target)}`;
    case 'jp-conditional':
      return `jp ${inst.condition}, ${hex(inst.target)}`;
    case 'jr':
      return `jr ${hex(inst.target)}`;
    case 'jr-conditional':
      return `jr ${inst.condition}, ${hex(inst.target)}`;
    case 'ret':
      return 'ret';
    case 'ret-conditional':
      return `ret ${inst.condition}`;
    case 'nop':
      return 'nop';
    default: {
      const props = formatGenericProps(inst);
      return props ? `${inst.tag} ${props}` : String(inst?.tag ?? 'unknown');
    }
  }
}

function hexDump(offset, count) {
  const start = Math.max(0, offset);
  const end = Math.min(ROM_SIZE, offset + count);
  const bytes = [];
  for (let i = start; i < end; i++) {
    bytes.push(ROM[i].toString(16).toUpperCase().padStart(2, '0'));
  }
  return bytes.join(' ');
}

function findBestDecodeWindow(site, patternLen, { beforeBytes = 20, afterBytes = 12, slop = 12 } = {}) {
  const desiredStart = Math.max(0, site - beforeBytes);
  const earliestStart = Math.max(0, desiredStart - slop);
  const latestExclusive = Math.min(ROM_SIZE, site + patternLen + afterBytes);

  let best = null;

  for (let candidate = earliestStart; candidate <= site; candidate++) {
    const instructions = [];
    let pc = candidate;
    let exactSite = false;
    let valid = true;

    while (pc < latestExclusive) {
      let inst;
      try {
        inst = decodeInstruction(ROM, pc, 'adl');
      } catch {
        valid = false;
        break;
      }

      if (!inst || !Number.isInteger(inst.length) || inst.length <= 0) {
        valid = false;
        break;
      }

      if (pc < site && pc + inst.length > site) {
        valid = false;
        break;
      }

      instructions.push(inst);

      if (pc === site) {
        exactSite = true;
      }

      pc += inst.length;
    }

    if (!valid || !exactSite) {
      continue;
    }

    const coveredBefore = Math.min(site - candidate, beforeBytes);
    const coveredAfter = Math.min(Math.max(0, pc - site), afterBytes + patternLen);
    const startPenalty = Math.abs(candidate - desiredStart);
    const score = (coveredBefore * 1000) + (coveredAfter * 10) - startPenalty;

    if (!best || score > best.score) {
      best = { start: candidate, end: pc, instructions, score };
    }
  }

  return best;
}

function isContextControl(inst) {
  return inst?.tag === 'call' ||
    inst?.tag === 'call-conditional' ||
    inst?.tag === 'jp' ||
    inst?.tag === 'jp-conditional';
}

function describeContext(inst) {
  if (!inst) {
    return 'n/a';
  }

  if (inst.tag === 'call') {
    return `call ${hex(inst.target)} @${hex(inst.pc)}`;
  }
  if (inst.tag === 'call-conditional') {
    return `call ${inst.condition}, ${hex(inst.target)} @${hex(inst.pc)}`;
  }
  if (inst.tag === 'jp') {
    return `jp ${hex(inst.target)} @${hex(inst.pc)}`;
  }
  if (inst.tag === 'jp-conditional') {
    return `jp ${inst.condition}, ${hex(inst.target)} @${hex(inst.pc)}`;
  }

  return formatInstruction(inst);
}

function findNearestContext(site) {
  const window = findBestDecodeWindow(site, 4, { beforeBytes: 64, afterBytes: 24, slop: 32 });
  if (!window) {
    return null;
  }

  let best = null;
  for (const inst of window.instructions) {
    if (!isContextControl(inst)) {
      continue;
    }

    const distance = Math.abs(inst.pc - site);
    const prefer = inst.pc <= site ? 0 : 1;
    const score = (distance * 10) + prefer;

    if (!best || score < best.score) {
      best = { inst, score };
    }
  }

  return best?.inst ?? null;
}

function printTable(headers, rows) {
  const widths = headers.map((header) => header.length);

  for (const row of rows) {
    for (let i = 0; i < headers.length; i++) {
      widths[i] = Math.max(widths[i], String(row[i] ?? '').length);
    }
  }

  console.log(headers.map((header, i) => header.padEnd(widths[i])).join('  '));
  console.log(widths.map((width) => '-'.repeat(width)).join('  '));
  for (const row of rows) {
    console.log(row.map((value, i) => String(value ?? '').padEnd(widths[i])).join('  '));
  }
}

function collectSite(site, patternLen, label) {
  const decodeWindow = findBestDecodeWindow(site, patternLen, { beforeBytes: 20, afterBytes: 8, slop: 12 });
  const contextInst = findNearestContext(site);
  const detailInstructions = decodeWindow
    ? decodeWindow.instructions.filter((inst) => (inst.pc + inst.length) > (site - 20) && inst.pc <= site + patternLen)
    : [];

  return {
    site,
    label,
    region: regionLabel(site),
    contextInst,
    detailInstructions,
  };
}

// ========================
// Run the scan
// ========================

console.log('=== Phase 262: D007D0 Write-Site Scan ===\n');
console.log(`ROM: ${ROM_PATH}`);
console.log(`ROM size: ${hex(ROM_SIZE, 8)} (${ROM_SIZE} bytes)`);
console.log(`Target RAM address: ${hex(TARGET_ADDR)}`);
console.log(`Context: LD HL,(D007D0) at 0x08C69E then JP (HL) -- crashes when D007D0=0x000000\n`);

// 1. Exact pattern scans
const directAHits = scanPattern(DIRECT_A_PATTERN);
const directHLHits = scanPattern(DIRECT_HL_PATTERN);
const ixHLHits = scanPattern(IX_HL_PATTERN);
const iyHLHits = scanPattern(IY_HL_PATTERN);
const pairWriteHits = PAIR_WRITE_PATTERNS.flatMap(({ pair, bytes }) =>
  scanPattern(bytes).map((site) => ({ site, pair })),
);

console.log(`--- Exact store pattern results for ${hex(TARGET_ADDR)} ---`);
console.log(`  LD (D007D0),A  [32 D0 07 D0]:        ${directAHits.length} hit(s)`);
console.log(`  LD (D007D0),HL [22 D0 07 D0]:        ${directHLHits.length} hit(s)`);
console.log(`  LD (D007D0),IX [DD 22 D0 07 D0]:     ${ixHLHits.length} hit(s)`);
console.log(`  LD (D007D0),IY [FD 22 D0 07 D0]:     ${iyHLHits.length} hit(s)`);
console.log(`  LD (D007D0),BC [ED 43 D0 07 D0]:     ${pairWriteHits.filter(h => h.pair === 'bc').length} hit(s)`);
console.log(`  LD (D007D0),DE [ED 53 D0 07 D0]:     ${pairWriteHits.filter(h => h.pair === 'de').length} hit(s)`);
console.log(`  LD (D007D0),HL [ED 63 D0 07 D0]:     ${pairWriteHits.filter(h => h.pair === 'hl').length} hit(s)`);
console.log(`  LD (D007D0),SP [ED 73 D0 07 D0]:     ${pairWriteHits.filter(h => h.pair === 'sp').length} hit(s)`);
console.log('');

// Collect and display detailed info for each hit
const allExactHits = [];

for (const site of directAHits) {
  allExactHits.push(collectSite(site, 4, 'LD (D007D0),A'));
}
for (const site of directHLHits) {
  allExactHits.push(collectSite(site, 4, 'LD (D007D0),HL'));
}
for (const site of ixHLHits) {
  allExactHits.push(collectSite(site, 5, 'LD (D007D0),IX'));
}
for (const site of iyHLHits) {
  allExactHits.push(collectSite(site, 5, 'LD (D007D0),IY'));
}
for (const { site, pair } of pairWriteHits) {
  allExactHits.push(collectSite(site, 5, `LD (D007D0),${pair.toUpperCase()}`));
}

allExactHits.sort((a, b) => a.site - b.site);

if (allExactHits.length > 0) {
  console.log('--- All exact write sites (sorted by address) ---\n');
  printTable(
    ['site', 'region', 'instruction', 'nearest CALL/JP'],
    allExactHits.map((h) => [
      hex(h.site),
      h.region,
      h.label,
      describeContext(h.contextInst),
    ]),
  );

  console.log('\n--- Per-site hex dump and disassembly ---\n');
  for (const hit of allExactHits) {
    console.log(`${hex(hit.site)}  ${hit.label}  region=${hit.region}  context=${describeContext(hit.contextInst)}`);
    console.log(`  -16 bytes: ${hexDump(hit.site - 16, 16)}`);
    console.log(`  +16 bytes: ${hexDump(hit.site, 16)}`);

    if (hit.detailInstructions.length > 0) {
      console.log('  Disassembly:');
      for (const inst of hit.detailInstructions) {
        const marker = inst.pc === hit.site ? ' <== WRITE' : '';
        console.log(`    ${hex(inst.pc)}: ${formatInstruction(inst)}${marker}`);
      }
    } else {
      console.log('  (no aligned disassembly window found)');
    }
    console.log('');
  }
} else {
  console.log('*** NO exact store instructions found for D007D0 ***\n');
}

// 2. Broader sweep -- raw D0 07 D0 occurrences
console.log('--- Broader sweep: raw byte sequence D0 07 D0 in ROM ---\n');
const rawHits = [];
for (let i = 0; i <= ROM_SIZE - 3; i++) {
  if (ROM[i] === 0xD0 && ROM[i + 1] === 0x07 && ROM[i + 2] === 0xD0) {
    rawHits.push(i);
  }
}
console.log(`Found ${rawHits.length} occurrence(s) of bytes D0 07 D0:\n`);

if (rawHits.length > 0) {
  printTable(
    ['offset', 'region', 'context (-4..+4 bytes)'],
    rawHits.map((off) => {
      const before = hexDump(off - 4, 4);
      const target = hexDump(off, 3);
      const after = hexDump(off + 3, 4);
      return [hex(off), regionLabel(off), `${before} [${target}] ${after}`];
    }),
  );

  // For each raw hit, check if it could be an address operand of a store or load
  console.log('\n--- Raw hits with recognized opcode context ---\n');
  let annotatedCount = 0;
  for (const off of rawHits) {
    const notes = [];

    // Check if byte before is a store opcode (0x32 or 0x22)
    if (off >= 1 && ROM[off - 1] === 0x32) {
      notes.push(`LD (D007D0),A at ${hex(off - 1)}`);
    }
    if (off >= 1 && ROM[off - 1] === 0x22) {
      notes.push(`LD (D007D0),HL at ${hex(off - 1)}`);
    }
    // DD/FD prefix + 22
    if (off >= 2 && ROM[off - 2] === 0xDD && ROM[off - 1] === 0x22) {
      notes.push(`LD (D007D0),IX at ${hex(off - 2)}`);
    }
    if (off >= 2 && ROM[off - 2] === 0xFD && ROM[off - 1] === 0x22) {
      notes.push(`LD (D007D0),IY at ${hex(off - 2)}`);
    }
    // ED xx store patterns
    if (off >= 2 && ROM[off - 2] === 0xED) {
      const sub = ROM[off - 1];
      if (ED_STORE_OPCODES.has(sub)) {
        notes.push(`${ED_STORE_OPCODES.get(sub)} at ${hex(off - 2)} [WRITE]`);
      }
    }
    // Load (read) patterns for completeness
    if (off >= 1 && ROM[off - 1] === 0x3A) {
      notes.push(`LD A,(D007D0) [read] at ${hex(off - 1)}`);
    }
    if (off >= 1 && ROM[off - 1] === 0x2A) {
      notes.push(`LD HL,(D007D0) [read] at ${hex(off - 1)}`);
    }
    if (off >= 2 && ROM[off - 2] === 0xDD && ROM[off - 1] === 0x2A) {
      notes.push(`LD IX,(D007D0) [read] at ${hex(off - 2)}`);
    }
    if (off >= 2 && ROM[off - 2] === 0xFD && ROM[off - 1] === 0x2A) {
      notes.push(`LD IY,(D007D0) [read] at ${hex(off - 2)}`);
    }
    if (off >= 2 && ROM[off - 2] === 0xED) {
      const sub = ROM[off - 1];
      if (sub === 0x4B) notes.push(`LD BC,(D007D0) [read] at ${hex(off - 2)}`);
      if (sub === 0x5B) notes.push(`LD DE,(D007D0) [read] at ${hex(off - 2)}`);
      if (sub === 0x7B) notes.push(`LD SP,(D007D0) [read] at ${hex(off - 2)}`);
    }

    if (notes.length > 0) {
      console.log(`  ${hex(off)}: ${notes.join('; ')}`);
      annotatedCount++;
    }
  }
  if (annotatedCount === 0) {
    console.log('  (no raw hits matched a recognized store/load opcode)');
  }
}

// 3. Nearby address scan (D007CE..D007D5 excluding D007D0)
console.log('\n--- Nearby address scan (D007CE..D007D5, excluding D007D0) ---\n');
let nearbyFound = 0;

for (const addr of NEARBY_ADDRS) {
  const le = [addr & 0xFF, (addr >> 8) & 0xFF, (addr >> 16) & 0xFF];
  const results = [];

  // LD (addr),A
  const aHits = scanPattern([0x32, ...le]);
  for (const h of aHits) results.push({ site: h, desc: `LD (${hex(addr)}),A` });

  // LD (addr),HL
  const hlHits = scanPattern([0x22, ...le]);
  for (const h of hlHits) results.push({ site: h, desc: `LD (${hex(addr)}),HL` });

  // LD (addr),IX
  const ixHits = scanPattern([0xDD, 0x22, ...le]);
  for (const h of ixHits) results.push({ site: h, desc: `LD (${hex(addr)}),IX` });

  // LD (addr),IY
  const iyHits = scanPattern([0xFD, 0x22, ...le]);
  for (const h of iyHits) results.push({ site: h, desc: `LD (${hex(addr)}),IY` });

  // ED pair writes
  for (const { pair, bytes: refBytes } of PAIR_WRITE_PATTERNS) {
    const pBytes = [0xED, refBytes[1], ...le];
    const pH = scanPattern(pBytes);
    for (const h of pH) results.push({ site: h, desc: `LD (${hex(addr)}),${pair.toUpperCase()}` });
  }

  if (results.length > 0) {
    nearbyFound += results.length;
    const leStr = le.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
    console.log(`  ${hex(addr)} (LE: ${leStr}):`);
    for (const r of results) {
      console.log(`    ${r.desc} at ${hex(r.site)} [region: ${regionLabel(r.site)}]`);
    }
  }
}

if (nearbyFound === 0) {
  console.log('  No writes found to nearby addresses.');
}

// 4. Summary
console.log('\n--- Summary ---\n');
const totalExact = allExactHits.length;
console.log(`Total exact store instructions to D007D0: ${totalExact}`);
console.log(`Total raw D0 07 D0 byte occurrences: ${rawHits.length}`);
console.log(`Nearby address write sites: ${nearbyFound}`);

if (totalExact === 0) {
  console.log('\nD007D0 is NEVER written by a direct LD (imm24),reg instruction in ROM.');
  console.log('The pointer must be set via:');
  console.log('  - Indirect store: LD (HL),r / LD (IX+d),r / LD (IY+d),r with computed address');
  console.log('  - Block transfer: LDIR/LDDR copying a table that includes this address');
  console.log('  - DMA or peripheral write');
  console.log('  - Code that computes the address at runtime and stores via (HL) or (IX+d)');
}

console.log('\nDone.');
