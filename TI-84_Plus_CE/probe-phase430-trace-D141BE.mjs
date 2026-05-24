#!/usr/bin/env node
// Phase 430 — trace all ROM references to D141BE ("data source buffer" pointer)
// Scans the 4MB ROM for the 24-bit little-endian pattern BE 41 D1 and adjacent
// addresses (D141BD, D141BF, D141C0) to determine variable size, readers, writers.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const REPORT_PATH = path.join(__dirname, 'phase430-D141BE-report.md');

const rom = fs.readFileSync(ROM_PATH);

// ── Target addresses ──

const TARGETS = [
  { addr: 0xD141BD, label: 'D141BD', le: [0xBD, 0x41, 0xD1] },
  { addr: 0xD141BE, label: 'D141BE', le: [0xBE, 0x41, 0xD1] },
  { addr: 0xD141BF, label: 'D141BF', le: [0xBF, 0x41, 0xD1] },
  { addr: 0xD141C0, label: 'D141C0', le: [0xC0, 0x41, 0xD1] },
];

// ── Opcode classification ──

// Single-byte prefix opcodes that take a 3-byte immediate
const SINGLE_BYTE_OPS = {
  0x01: { mnem: 'LD BC,nn',    type: 'ADDR_LOAD' },
  0x11: { mnem: 'LD DE,nn',    type: 'ADDR_LOAD' },
  0x21: { mnem: 'LD HL,nn',    type: 'ADDR_LOAD' },
  0x31: { mnem: 'LD SP,nn',    type: 'ADDR_LOAD' },
  0x2A: { mnem: 'LD HL,(nn)',  type: 'READ' },
  0x22: { mnem: 'LD (nn),HL',  type: 'WRITE' },
  0x3A: { mnem: 'LD A,(nn)',   type: 'READ' },
  0x32: { mnem: 'LD (nn),A',   type: 'WRITE' },
  0xC3: { mnem: 'JP nn',       type: 'JUMP' },
  0xCA: { mnem: 'JP Z,nn',     type: 'JUMP' },
  0xC2: { mnem: 'JP NZ,nn',    type: 'JUMP' },
  0xDA: { mnem: 'JP C,nn',     type: 'JUMP' },
  0xD2: { mnem: 'JP NC,nn',    type: 'JUMP' },
  0xCD: { mnem: 'CALL nn',     type: 'CALL' },
  0xCC: { mnem: 'CALL Z,nn',   type: 'CALL' },
  0xC4: { mnem: 'CALL NZ,nn',  type: 'CALL' },
  0xDC: { mnem: 'CALL C,nn',   type: 'CALL' },
  0xD4: { mnem: 'CALL NC,nn',  type: 'CALL' },
};

// Two-byte prefix opcodes (0xED + second byte)
const ED_PREFIX_OPS = {
  0x4B: { mnem: 'LD BC,(nn)',  type: 'READ' },
  0x5B: { mnem: 'LD DE,(nn)',  type: 'READ' },
  0x43: { mnem: 'LD (nn),BC',  type: 'WRITE' },
  0x53: { mnem: 'LD (nn),DE',  type: 'WRITE' },
  0x73: { mnem: 'LD (nn),SP',  type: 'WRITE' },
  0x7B: { mnem: 'LD SP,(nn)',  type: 'READ' },
};

// Two-byte prefix opcodes (0xDD/0xFD + second byte)
const IXIY_PREFIX_OPS = {
  0x21: { mnem_ix: 'LD IX,nn', mnem_iy: 'LD IY,nn', type: 'ADDR_LOAD' },
  0x22: { mnem_ix: 'LD (nn),IX', mnem_iy: 'LD (nn),IY', type: 'WRITE' },
  0x2A: { mnem_ix: 'LD IX,(nn)', mnem_iy: 'LD IY,(nn)', type: 'READ' },
};

function classify(romAddr) {
  // Check two-byte prefixes first (ED, DD, FD)
  if (romAddr >= 2) {
    const prefix = rom[romAddr - 2];
    const second = rom[romAddr - 1];

    if (prefix === 0xED && ED_PREFIX_OPS[second]) {
      const op = ED_PREFIX_OPS[second];
      return { mnem: op.mnem, type: op.type, instrAddr: romAddr - 2 };
    }

    if ((prefix === 0xDD || prefix === 0xFD) && IXIY_PREFIX_OPS[second]) {
      const op = IXIY_PREFIX_OPS[second];
      const reg = prefix === 0xDD ? 'IX' : 'IY';
      const mnem = prefix === 0xDD ? op.mnem_ix : op.mnem_iy;
      return { mnem, type: op.type, instrAddr: romAddr - 2 };
    }
  }

  // Single-byte prefix
  if (romAddr >= 1) {
    const prev = rom[romAddr - 1];
    if (SINGLE_BYTE_OPS[prev]) {
      const op = SINGLE_BYTE_OPS[prev];
      return { mnem: op.mnem, type: op.type, instrAddr: romAddr - 1 };
    }
  }

  return { mnem: 'UNKNOWN', type: 'DATA', instrAddr: romAddr };
}

// ── Find nearest RET boundaries for approximate function grouping ──

function findContainingFunction(addr) {
  // Search backward for RET (0xC9) or RETI (0xED 0x4D) or start of ROM
  let start = addr;
  for (let i = addr - 1; i >= Math.max(0, addr - 4096); i--) {
    if (rom[i] === 0xC9) { start = i + 1; break; }
    if (i > 0 && rom[i - 1] === 0xED && rom[i] === 0x4D) { start = i + 1; break; }
  }

  // Search forward for RET
  let end = addr;
  for (let i = addr + 1; i < Math.min(rom.length, addr + 8192); i++) {
    if (rom[i] === 0xC9) { end = i; break; }
  }

  return { start, end, size: end - start + 1 };
}

// ── Scan ──

function hex(v, w = 6) {
  if (v === null || v === undefined) return 'n/a';
  return `0x${(v >>> 0).toString(16).toUpperCase().padStart(w, '0')}`;
}

const allResults = {};

for (const target of TARGETS) {
  const hits = [];

  for (let i = 0; i < rom.length - 2; i++) {
    if (rom[i] === target.le[0] && rom[i + 1] === target.le[1] && rom[i + 2] === target.le[2]) {
      const info = classify(i);
      const func = findContainingFunction(info.instrAddr);

      // Grab context bytes: 4 before, the 3-byte address, 2 after
      const ctxStart = Math.max(0, i - 4);
      const ctxEnd = Math.min(rom.length, i + 5);
      const context = [];
      for (let j = ctxStart; j < ctxEnd; j++) context.push(rom[j]);

      hits.push({
        romAddr: i,
        instrAddr: info.instrAddr,
        mnem: info.mnem,
        type: info.type,
        func,
        context,
        ctxStart,
      });
    }
  }

  allResults[target.label] = hits;
}

// ── Console output ──

console.log('=== Phase 430 — Trace D141BE (data source buffer) ===');
console.log(`ROM size: ${rom.length} bytes (${(rom.length / 1024 / 1024).toFixed(1)} MB)`);
console.log('');

for (const target of TARGETS) {
  const hits = allResults[target.label];
  const reads = hits.filter(h => h.type === 'READ');
  const writes = hits.filter(h => h.type === 'WRITE');
  const addrLoads = hits.filter(h => h.type === 'ADDR_LOAD');
  const calls = hits.filter(h => h.type === 'CALL');
  const jumps = hits.filter(h => h.type === 'JUMP');
  const data = hits.filter(h => h.type === 'DATA');

  console.log(`--- ${target.label} (${hex(target.addr)}) ---`);
  console.log(`  Total hits: ${hits.length}`);
  console.log(`  READs: ${reads.length}, WRITEs: ${writes.length}, ADDR_LOADs: ${addrLoads.length}, CALLs: ${calls.length}, JUMPs: ${jumps.length}, DATA: ${data.length}`);

  for (const hit of hits) {
    const ctx = hit.context.map(b => b.toString(16).padStart(2, '0')).join(' ');
    const funcRange = `func ~${hex(hit.func.start)}-${hex(hit.func.end)} (${hit.func.size}b)`;
    console.log(`    ${hex(hit.romAddr)} [${hit.type.padEnd(9)}] ${hit.mnem.padEnd(18)} instr@${hex(hit.instrAddr)} ${funcRange}  ctx: ${ctx}`);
  }
  console.log('');
}

// ── D141BE-specific analysis ──

const primary = allResults['D141BE'];
const reads = primary.filter(h => h.type === 'READ');
const writes = primary.filter(h => h.type === 'WRITE');
const addrLoads = primary.filter(h => h.type === 'ADDR_LOAD');

console.log('=== D141BE Data Flow ===');
console.log('');
console.log('Writers (store to D141BE):');
for (const w of writes) {
  console.log(`  ${hex(w.instrAddr)} — ${w.mnem}  (func ~${hex(w.func.start)}-${hex(w.func.end)})`);
}
console.log('');
console.log('Readers (load from D141BE):');
for (const r of reads) {
  console.log(`  ${hex(r.instrAddr)} — ${r.mnem}  (func ~${hex(r.func.start)}-${hex(r.func.end)})`);
}
console.log('');
console.log('Address loaders (load address D141BE into register):');
for (const a of addrLoads) {
  console.log(`  ${hex(a.instrAddr)} — ${a.mnem}  (func ~${hex(a.func.start)}-${hex(a.func.end)})`);
}

// ── Variable size inference ──

console.log('');
console.log('=== Variable Size Inference ===');
const adjCounts = TARGETS.map(t => ({ label: t.label, count: allResults[t.label].length }));
for (const ac of adjCounts) {
  console.log(`  ${ac.label}: ${ac.count} references`);
}

const bfHits = allResults['D141BF'].length;
const c0Hits = allResults['D141C0'].length;
if (bfHits > 0 || c0Hits > 0) {
  console.log(`  => D141BE is likely a multi-byte variable (D141BF has ${bfHits} refs, D141C0 has ${c0Hits} refs)`);
} else {
  console.log('  => D141BF and D141C0 have zero refs — D141BE is likely a 1-byte variable OR accessed only via pointer');
}

// ── Group by function ──

console.log('');
console.log('=== D141BE References Grouped by Function ===');

const funcMap = new Map();
for (const hit of primary) {
  const key = `${hex(hit.func.start)}-${hex(hit.func.end)}`;
  if (!funcMap.has(key)) funcMap.set(key, []);
  funcMap.get(key).push(hit);
}

for (const [funcKey, funcHits] of funcMap) {
  console.log(`  Function ${funcKey} (${funcHits[0].func.size} bytes):`);
  for (const h of funcHits) {
    console.log(`    ${hex(h.instrAddr)} ${h.type.padEnd(9)} ${h.mnem}`);
  }
}

// ── Write report ──

const lines = [];
lines.push('# Phase 430 — D141BE Data Source Buffer Trace');
lines.push('');
lines.push(`ROM: ${rom.length} bytes (${(rom.length / 1024 / 1024).toFixed(1)} MB)`);
lines.push('');
lines.push('## Summary');
lines.push('');
lines.push(`| Address | Total | READs | WRITEs | ADDR_LOADs | CALLs | JUMPs | DATA |`);
lines.push(`|---------|-------|-------|--------|------------|-------|-------|------|`);
for (const target of TARGETS) {
  const hits = allResults[target.label];
  const r = hits.filter(h => h.type === 'READ').length;
  const w = hits.filter(h => h.type === 'WRITE').length;
  const a = hits.filter(h => h.type === 'ADDR_LOAD').length;
  const c = hits.filter(h => h.type === 'CALL').length;
  const j = hits.filter(h => h.type === 'JUMP').length;
  const d = hits.filter(h => h.type === 'DATA').length;
  lines.push(`| ${target.label} | ${hits.length} | ${r} | ${w} | ${a} | ${c} | ${j} | ${d} |`);
}
lines.push('');

// Variable size
lines.push('## Variable Size');
lines.push('');
if (bfHits > 0 || c0Hits > 0) {
  lines.push(`D141BF has ${bfHits} refs, D141C0 has ${c0Hits} refs — **multi-byte variable**.`);
  if (c0Hits > 0) {
    lines.push('At least 3 bytes wide (D141BE, D141BF, D141C0).');
  } else {
    lines.push('At least 2 bytes wide (D141BE, D141BF).');
  }
} else {
  lines.push('D141BF and D141C0 have zero references.');
  lines.push('D141BE is likely a **1-byte variable** or accessed only via pointer/index register.');
}
lines.push('');

// All D141BE references
lines.push('## D141BE References');
lines.push('');
lines.push('| ROM addr | Instr addr | Type | Mnemonic | Function range | Function size |');
lines.push('|----------|------------|------|----------|----------------|---------------|');
for (const hit of primary) {
  lines.push(`| ${hex(hit.romAddr)} | ${hex(hit.instrAddr)} | ${hit.type} | ${hit.mnem} | ${hex(hit.func.start)}-${hex(hit.func.end)} | ${hit.func.size} |`);
}
lines.push('');

// Writers
lines.push('## Writers (store to D141BE)');
lines.push('');
if (writes.length === 0) {
  lines.push('No direct writes found. D141BE may be written via pointer indirection.');
} else {
  lines.push('| Instr addr | Mnemonic | Function range |');
  lines.push('|------------|----------|----------------|');
  for (const w of writes) {
    lines.push(`| ${hex(w.instrAddr)} | ${w.mnem} | ${hex(w.func.start)}-${hex(w.func.end)} |`);
  }
}
lines.push('');

// Readers
lines.push('## Readers (load from D141BE)');
lines.push('');
if (reads.length === 0) {
  lines.push('No direct reads found. D141BE may be read via pointer indirection.');
} else {
  lines.push('| Instr addr | Mnemonic | Function range |');
  lines.push('|------------|----------|----------------|');
  for (const r of reads) {
    lines.push(`| ${hex(r.instrAddr)} | ${r.mnem} | ${hex(r.func.start)}-${hex(r.func.end)} |`);
  }
}
lines.push('');

// Address loaders
lines.push('## Address Loaders (load &D141BE into register)');
lines.push('');
if (addrLoads.length === 0) {
  lines.push('No address loads found.');
} else {
  lines.push('| Instr addr | Mnemonic | Function range |');
  lines.push('|------------|----------|----------------|');
  for (const a of addrLoads) {
    lines.push(`| ${hex(a.instrAddr)} | ${a.mnem} | ${hex(a.func.start)}-${hex(a.func.end)} |`);
  }
}
lines.push('');

// Grouped by function
lines.push('## Grouped by Containing Function');
lines.push('');
for (const [funcKey, funcHits] of funcMap) {
  lines.push(`### Function ${funcKey} (${funcHits[0].func.size} bytes)`);
  lines.push('');
  for (const h of funcHits) {
    lines.push(`- ${hex(h.instrAddr)}: ${h.type} — ${h.mnem}`);
  }
  lines.push('');
}

// Data flow
lines.push('## Data Flow');
lines.push('');
lines.push('```');
lines.push('Source → D141BE → Consumers');
lines.push('');
if (writes.length > 0) {
  lines.push('Writers:');
  for (const w of writes) {
    lines.push(`  ${hex(w.instrAddr)} ${w.mnem} (func ${hex(w.func.start)})`);
  }
} else {
  lines.push('Writers: (none found — indirect writes via pointer)');
}
lines.push('');
if (reads.length > 0) {
  lines.push('Readers:');
  for (const r of reads) {
    lines.push(`  ${hex(r.instrAddr)} ${r.mnem} (func ${hex(r.func.start)})`);
  }
} else {
  lines.push('Readers: (none found — indirect reads via pointer)');
}
lines.push('');
if (addrLoads.length > 0) {
  lines.push('Address loaders (pointer-based access):');
  for (const a of addrLoads) {
    lines.push(`  ${hex(a.instrAddr)} ${a.mnem} (func ${hex(a.func.start)})`);
  }
}
lines.push('```');
lines.push('');

// Adjacent addresses
for (const target of TARGETS) {
  if (target.label === 'D141BE') continue;
  const hits = allResults[target.label];
  if (hits.length === 0) continue;

  lines.push(`## ${target.label} References`);
  lines.push('');
  lines.push('| ROM addr | Instr addr | Type | Mnemonic | Function range |');
  lines.push('|----------|------------|------|----------|----------------|');
  for (const hit of hits) {
    lines.push(`| ${hex(hit.romAddr)} | ${hex(hit.instrAddr)} | ${hit.type} | ${hit.mnem} | ${hex(hit.func.start)}-${hex(hit.func.end)} |`);
  }
  lines.push('');
}

fs.writeFileSync(REPORT_PATH, lines.join('\n') + '\n');
console.log(`\nReport written: ${REPORT_PATH}`);
