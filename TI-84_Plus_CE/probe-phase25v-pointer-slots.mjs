#!/usr/bin/env node
// Phase 25V — Name the 4 pointer slots found in signExtTemp (0x0827CA)
// InsertMem adjusts these during VAT operations. Three unknowns sit in the
// DeltaY(0xD01FB7)..TraceStep(0xD0203D) gap at a 6-byte stride.
//
// Targets:
//   0xD01FEA  — unknown (gap)
//   0xD01FF0  — unknown (gap)
//   0xD01FF6  — unknown (gap)
//   0xD02567  — already known as fmtMatSym

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const INC_PATH = path.join(__dirname, 'references', 'ti84pceg.inc');
const REPORT_PATH = path.join(__dirname, 'phase25v-pointer-slots-named-report.md');

const rom = fs.readFileSync(ROM_PATH);

function hex(v, w = 6) {
  if (v === null || v === undefined) return 'n/a';
  return `0x${(v >>> 0).toString(16).padStart(w, '0').toUpperCase()}`;
}

// --- 1. Scan ROM for each pointer's little-endian pattern ---

const TARGETS = [
  { addr: 0xD01FEA, name: 'unknown_D01FEA', bytes: [0xEA, 0x1F, 0xD0] },
  { addr: 0xD01FF0, name: 'unknown_D01FF0', bytes: [0xF0, 0x1F, 0xD0] },
  { addr: 0xD01FF6, name: 'unknown_D01FF6', bytes: [0xF6, 0x1F, 0xD0] },
  { addr: 0xD02567, name: 'fmtMatSym',      bytes: [0x67, 0x25, 0xD0] },
];

// eZ80 opcodes that take a 24-bit immediate
const IMM24_OPCODES = {
  0x01: 'LD BC,nn',
  0x11: 'LD DE,nn',
  0x21: 'LD HL,nn',
  0x31: 'LD SP,nn',
  0x22: 'LD (nn),HL',
  0x2A: 'LD HL,(nn)',
  0x32: 'LD (nn),A',
  0x3A: 'LD A,(nn)',
  0xCD: 'CALL nn',
  0xC3: 'JP nn',
  0xCA: 'JP Z,nn',
  0xC2: 'JP NZ,nn',
  0xDA: 'JP C,nn',
  0xD2: 'JP NC,nn',
};

const results = {};

for (const target of TARGETS) {
  const hits = [];
  const [b0, b1, b2] = target.bytes;

  for (let i = 0; i < rom.length - 2; i++) {
    if (rom[i] === b0 && rom[i + 1] === b1 && rom[i + 2] === b2) {
      // Grab context: 4 bytes before, the 3-byte match, 6 bytes after
      const before = [];
      for (let j = Math.max(0, i - 4); j < i; j++) before.push(rom[j]);
      const after = [];
      for (let j = i + 3; j < Math.min(rom.length, i + 9); j++) after.push(rom[j]);

      const prevByte = i > 0 ? rom[i - 1] : null;
      const opcode = prevByte !== null ? (IMM24_OPCODES[prevByte] ?? null) : null;

      hits.push({
        romAddr: i,
        prevByte,
        opcode,
        before,
        match: target.bytes,
        after,
      });
    }
  }

  results[target.name] = { target, hits };
}

// --- 2. Search ti84pceg.inc for equates in 0xD01FC0..0xD0203C ---

const incText = fs.readFileSync(INC_PATH, 'utf-8');
const incLines = incText.split('\n');

const RANGE_START = 0xD01FC0;
const RANGE_END = 0xD0203C;

const equatesInRange = [];

for (const line of incLines) {
  // Match lines like: symbolName  equ  0D01FEAh  or  := $D01FEA
  const m = line.match(/^\s*(\w+)\s+(?:\.?equ|:=)\s+(?:0x|0|\$)?([0-9A-Fa-f]+)h?\b/i);
  if (!m) continue;
  const val = parseInt(m[2], 16);
  if (val >= RANGE_START && val <= RANGE_END) {
    equatesInRange.push({ name: m[1], value: val, line: line.trim() });
  }
}

// Also look for our exact target addresses anywhere in the file
const exactMatches = {};
for (const target of TARGETS) {
  const addrHex = target.addr.toString(16).toUpperCase();
  const addrHexNoPrefix = addrHex.replace(/^0+/, '');
  const matchingLines = [];
  for (let i = 0; i < incLines.length; i++) {
    const upper = incLines[i].toUpperCase();
    if (upper.includes(addrHex) || upper.includes(addrHexNoPrefix + 'H')) {
      matchingLines.push({ lineNum: i + 1, text: incLines[i].trim() });
    }
  }
  if (matchingLines.length > 0) exactMatches[hex(target.addr)] = matchingLines;
}

// --- 3. Console output ---

console.log('=== Phase 25V — Pointer Slot Scanner ===');
console.log(`ROM size: ${rom.length} bytes`);
console.log('');

for (const [name, { target, hits }] of Object.entries(results)) {
  console.log(`--- ${hex(target.addr)} (${name}) — ${hits.length} hits ---`);
  for (const hit of hits) {
    const bCtx = hit.before.map(b => b.toString(16).padStart(2, '0')).join(' ');
    const mCtx = hit.match.map(b => b.toString(16).padStart(2, '0')).join(' ');
    const aCtx = hit.after.map(b => b.toString(16).padStart(2, '0')).join(' ');
    const opStr = hit.opcode ? ` [${hit.opcode}]` : '';
    console.log(`  rom=${hex(hit.romAddr)} | ${bCtx} | ${mCtx} | ${aCtx}${opStr}`);
  }
  console.log('');
}

console.log(`--- ti84pceg.inc equates in ${hex(RANGE_START)}..${hex(RANGE_END)} ---`);
if (equatesInRange.length === 0) {
  console.log('  (none found)');
} else {
  for (const eq of equatesInRange) {
    console.log(`  ${eq.name} = ${hex(eq.value)} — ${eq.line}`);
  }
}
console.log('');

console.log('--- Exact address matches in ti84pceg.inc ---');
for (const [addr, lines] of Object.entries(exactMatches)) {
  for (const l of lines) {
    console.log(`  ${addr} line ${l.lineNum}: ${l.text}`);
  }
}
if (Object.keys(exactMatches).length === 0) console.log('  (none)');
console.log('');

// --- 4. Analysis: stride and neighbourhood ---

console.log('--- Stride analysis ---');
const unknowns = [0xD01FEA, 0xD01FF0, 0xD01FF6];
for (let i = 1; i < unknowns.length; i++) {
  console.log(`  ${hex(unknowns[i])} - ${hex(unknowns[i - 1])} = ${unknowns[i] - unknowns[i - 1]} bytes`);
}

// Known neighbours from ti84pceg.inc
const knownNeighbours = [
  { name: 'DeltaY', addr: 0xD01FB7 },
  { name: 'Xfact', addr: 0xD01FBD },
  { name: 'unknown_D01FEA', addr: 0xD01FEA },
  { name: 'unknown_D01FF0', addr: 0xD01FF0 },
  { name: 'unknown_D01FF6', addr: 0xD01FF6 },
  { name: 'TraceStep', addr: 0xD0203D },
];
console.log('');
console.log('--- Neighbourhood map (known + unknown) ---');
for (let i = 0; i < knownNeighbours.length; i++) {
  const n = knownNeighbours[i];
  const gap = i > 0 ? n.addr - knownNeighbours[i - 1].addr : 0;
  console.log(`  ${hex(n.addr)}  ${n.name}${i > 0 ? `  (+${gap} from prev)` : ''}`);
}

// --- 5. Write report ---

let report = `# Phase 25V — Pointer Slot Naming Report\n\n`;
report += `Generated: ${new Date().toISOString()}\n\n`;
report += `## Background\n\n`;
report += `Session 80's signExtTemp disassembly at 0x0827CA revealed 4 pointer slots\n`;
report += `adjusted by InsertMem. Three are in the DeltaY(0xD01FB7)..TraceStep(0xD0203D)\n`;
report += `gap at a 6-byte stride. The fourth (0xD02567) is already known as \`fmtMatSym\`.\n\n`;

report += `## ROM Scan Results\n\n`;

for (const [name, { target, hits }] of Object.entries(results)) {
  report += `### ${hex(target.addr)} — ${name} (${hits.length} hits)\n\n`;
  if (hits.length === 0) {
    report += `No byte-pattern hits found.\n\n`;
    continue;
  }
  report += `| ROM offset | Before (4B) | Match (3B) | After (6B) | Prev opcode |\n`;
  report += `|------------|-------------|------------|------------|-------------|\n`;
  for (const hit of hits) {
    const bCtx = hit.before.map(b => b.toString(16).padStart(2, '0')).join(' ');
    const mCtx = hit.match.map(b => b.toString(16).padStart(2, '0')).join(' ');
    const aCtx = hit.after.map(b => b.toString(16).padStart(2, '0')).join(' ');
    const opStr = hit.opcode ?? '(data/other)';
    report += `| ${hex(hit.romAddr)} | ${bCtx} | ${mCtx} | ${aCtx} | ${opStr} |\n`;
  }
  report += `\n`;
}

report += `## ti84pceg.inc Equates in 0xD01FC0..0xD0203C\n\n`;
if (equatesInRange.length === 0) {
  report += `No equates found in this range.\n\n`;
} else {
  report += `| Name | Address | Line |\n`;
  report += `|------|---------|------|\n`;
  for (const eq of equatesInRange) {
    report += `| ${eq.name} | ${hex(eq.value)} | \`${eq.line}\` |\n`;
  }
  report += `\n`;
}

report += `## Exact Address Matches in ti84pceg.inc\n\n`;
if (Object.keys(exactMatches).length === 0) {
  report += `None of the 4 target addresses appear in ti84pceg.inc.\n\n`;
} else {
  for (const [addr, lines] of Object.entries(exactMatches)) {
    for (const l of lines) {
      report += `- **${addr}** line ${l.lineNum}: \`${l.text}\`\n`;
    }
  }
  report += `\n`;
}

report += `## Stride Analysis\n\n`;
report += `The 3 unknown addresses are exactly **6 bytes** apart:\n\n`;
report += `| From | To | Delta |\n`;
report += `|------|----|-------|\n`;
for (let i = 1; i < unknowns.length; i++) {
  report += `| ${hex(unknowns[i - 1])} | ${hex(unknowns[i])} | ${unknowns[i] - unknowns[i - 1]} |\n`;
}
report += `\n`;
report += `A 6-byte stride in the graph parameter region strongly suggests these are\n`;
report += `**graph window variables** — each is a 9-byte TI FP number, but InsertMem\n`;
report += `adjusts the 3-byte *pointer* to each one. The 6-byte gap between pointers\n`;
report += `(with 9-byte FP values) indicates these are contiguous FP slots with only\n`;
report += `the pointer portion being tracked by InsertMem.\n\n`;

report += `## Neighbourhood Map\n\n`;
report += `| Address | Name | Gap from prev |\n`;
report += `|---------|------|---------------|\n`;
for (let i = 0; i < knownNeighbours.length; i++) {
  const n = knownNeighbours[i];
  const gap = i > 0 ? n.addr - knownNeighbours[i - 1].addr : '-';
  report += `| ${hex(n.addr)} | ${n.name} | ${gap} |\n`;
}
report += `\n`;

report += `## Conclusions\n\n`;
report += `Conclusions will be filled after analyzing the ROM scan output above.\n`;
report += `The pattern of references and their instruction context will reveal\n`;
report += `whether these are graph window parameters, table parameters, or\n`;
report += `statistical variables.\n`;

fs.writeFileSync(REPORT_PATH, report);
console.log(`Report written to ${REPORT_PATH}`);
