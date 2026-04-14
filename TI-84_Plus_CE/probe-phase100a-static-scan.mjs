#!/usr/bin/env node
// Phase 100A — static ROM scan for references to the mode display buffer
// 0xD020A6-0xD020BF. Looks for the 24-bit little-endian byte pattern
// anywhere in the ROM and classifies each hit by the preceding opcode.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const REPORT_PATH = path.join(__dirname, 'phase100a-static-scan-report.md');

const rom = fs.readFileSync(ROM_PATH);

const BUF_START = 0xD020A6;
const BUF_END = 0xD020BF;

// Opcodes that take a 24-bit immediate (ADL mode, .LIL prefix variants omitted).
// Key candidates for loading a buffer address: LD rr,nnnnnn
const IMM24_OPCODES = {
  0x01: 'LD BC,nnnnnn',
  0x11: 'LD DE,nnnnnn',
  0x21: 'LD HL,nnnnnn',
  0x31: 'LD SP,nnnnnn',
  0x22: 'LD (nnnnnn),HL',
  0x2a: 'LD HL,(nnnnnn)',
  0x32: 'LD (nnnnnn),A',
  0x3a: 'LD A,(nnnnnn)',
  0xcd: 'CALL nnnnnn',
  0xc3: 'JP nnnnnn',
  0xca: 'JP Z,nnnnnn',
  0xc2: 'JP NZ,nnnnnn',
  0xda: 'JP C,nnnnnn',
  0xd2: 'JP NC,nnnnnn',
};

const hits = [];

for (let addr = 0; addr < rom.length - 2; addr++) {
  const b0 = rom[addr];
  const b1 = rom[addr + 1];
  const b2 = rom[addr + 2];
  const imm24 = b0 | (b1 << 8) | (b2 << 16);

  if (imm24 < BUF_START || imm24 > BUF_END) continue;

  const prevByte = addr > 0 ? rom[addr - 1] : null;
  const opcode = IMM24_OPCODES[prevByte] ?? null;

  hits.push({
    romAddr: addr,
    prevByte,
    opcode,
    target: imm24,
    context: [
      addr >= 3 ? rom[addr - 3] : null,
      addr >= 2 ? rom[addr - 2] : null,
      addr >= 1 ? rom[addr - 1] : null,
      rom[addr],
      rom[addr + 1],
      rom[addr + 2],
      addr + 3 < rom.length ? rom[addr + 3] : null,
    ],
  });
}

function hex(v, w = 6) {
  if (v === null || v === undefined) return 'n/a';
  return `0x${(v >>> 0).toString(16).padStart(w, '0')}`;
}

const likelyInstructions = hits.filter((h) => h.opcode !== null);
const dataHits = hits.filter((h) => h.opcode === null);

console.log(`=== Phase 100A Static ROM Scan ===`);
console.log(`ROM size: ${rom.length} bytes`);
console.log(`Target range: ${hex(BUF_START)} - ${hex(BUF_END)}`);
console.log(`Total byte-pattern hits: ${hits.length}`);
console.log(`Likely instructions (preceded by LD/CALL/JP opcode): ${likelyInstructions.length}`);
console.log(`Likely data: ${dataHits.length}`);
console.log('');

console.log('--- Likely instruction hits ---');
for (const hit of likelyInstructions) {
  const ctx = hit.context.map((b) => b === null ? '--' : b.toString(16).padStart(2, '0')).join(' ');
  console.log(
    `  rom=${hex(hit.romAddr)} target=${hex(hit.target)} prevByte=${hex(hit.prevByte, 2)} op=${hit.opcode} ctx=${ctx}`,
  );
}

console.log('');
console.log(`--- Likely data (first 20 of ${dataHits.length}) ---`);
for (const hit of dataHits.slice(0, 20)) {
  const ctx = hit.context.map((b) => b === null ? '--' : b.toString(16).padStart(2, '0')).join(' ');
  console.log(`  rom=${hex(hit.romAddr)} target=${hex(hit.target)} prevByte=${hex(hit.prevByte, 2)} ctx=${ctx}`);
}

// Write report
const lines = [];
lines.push('# Phase 100A — Static ROM Scan for 0xD020A6-0xD020BF');
lines.push('');
lines.push(`- ROM size: ${rom.length} bytes`);
lines.push(`- Target range: ${hex(BUF_START)} - ${hex(BUF_END)}`);
lines.push(`- Total byte-pattern hits: ${hits.length}`);
lines.push(`- Likely instructions: ${likelyInstructions.length}`);
lines.push(`- Likely data: ${dataHits.length}`);
lines.push('');
lines.push('## Likely Instruction Hits');
lines.push('');
if (likelyInstructions.length === 0) {
  lines.push('**(none)** — no LD/CALL/JP immediate loads of this range in ROM.');
  lines.push('');
  lines.push('This confirms the populator uses a **computed address** — likely:');
  lines.push('- Offset from an index register (IX/IY) pre-loaded with a base near 0xD020A6');
  lines.push('- BC/DE arithmetic building up the address from a table');
  lines.push('- LD HL,nnnnnn with a DIFFERENT address, then ADD HL,rr');
} else {
  lines.push('| ROM addr | target | prev byte | opcode | context bytes |');
  lines.push('|---|---|---|---|---|');
  for (const hit of likelyInstructions) {
    const ctx = hit.context.map((b) => b === null ? '--' : b.toString(16).padStart(2, '0')).join(' ');
    lines.push(`| ${hex(hit.romAddr)} | ${hex(hit.target)} | ${hex(hit.prevByte, 2)} | ${hit.opcode} | ${ctx} |`);
  }
}
lines.push('');
lines.push(`## Data / Non-instruction Hits (${dataHits.length} total)`);
lines.push('');
lines.push('| ROM addr | target | prev byte | context |');
lines.push('|---|---|---|---|');
for (const hit of dataHits.slice(0, 40)) {
  const ctx = hit.context.map((b) => b === null ? '--' : b.toString(16).padStart(2, '0')).join(' ');
  lines.push(`| ${hex(hit.romAddr)} | ${hex(hit.target)} | ${hex(hit.prevByte, 2)} | ${ctx} |`);
}
if (dataHits.length > 40) {
  lines.push('');
  lines.push(`(${dataHits.length - 40} more data hits omitted)`);
}
lines.push('');

fs.writeFileSync(REPORT_PATH, lines.join('\n') + '\n');
console.log(`\nreport: ${REPORT_PATH}`);
