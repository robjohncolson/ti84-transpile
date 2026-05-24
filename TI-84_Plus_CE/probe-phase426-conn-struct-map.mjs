#!/usr/bin/env node
// Phase 426 — Connection struct field map (IY+0 through IY+31)
// Scans USB/Link code regions for all IY-relative read/write instructions
// to build a complete field map of the connection structure.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const REPORT_PATH = path.join(__dirname, 'phase426-conn-struct-map-report.md');

const rom = fs.readFileSync(ROM_PATH);

// Scan regions: USB/Link code
const REGIONS = [
  { start: 0x009400, end: 0x00FF00, name: 'USB/Link primary' },
  { start: 0x012400, end: 0x012600, name: 'USB/Link secondary' },
];

// Known callers for cross-referencing
const KNOWN_CALLERS = {
  0x00ED77: 'link_handshake',
  0x00FE10: 'link_transfer_engine',
  0x00DA8C: 'link_state_toggle',
  0x00E583: 'sibling_list_walker',
  0x00E4E8: 'header_field_extractor',
  0x00CB7B: 'descriptor_node_body_init',
  0x00CBE9: 'secondary_constructor',
  0x00E06D: 'slab_alloc',
  0x00E1CC: 'slab_free',
  0x00CD7B: 'descriptor_table_builder_1',
  0x00EB31: 'descriptor_table_builder_2',
  0x00DB66: 'link_io_drain_1',
  0x00DC0E: 'link_io_drain_2',
};

// Known function boundaries (approximate, based on sizes from commit messages)
const FUNC_RANGES = [
  { start: 0x00ED77, end: 0x00ED77 + 164, name: 'link_handshake' },
  { start: 0x00FE10, end: 0x00FE10 + 638, name: 'link_transfer_engine' },
  { start: 0x00DA8C, end: 0x00DA8C + 218, name: 'link_state_toggle' },
  { start: 0x00E583, end: 0x00E583 + 923, name: 'sibling_list_walker' },
  { start: 0x00E4E8, end: 0x00E4E8 + 155, name: 'header_field_extractor' },
  { start: 0x00CB7B, end: 0x00CB7B + 110, name: 'descriptor_node_body_init' },
  { start: 0x00CBE9, end: 0x00CBE9 + 136, name: 'secondary_constructor' },
  { start: 0x00E06D, end: 0x00E06D + 351, name: 'slab_alloc' },
  { start: 0x00E1CC, end: 0x00E1CC + 287, name: 'slab_free' },
  { start: 0x00CD7B, end: 0x00CD7B + 1394, name: 'descriptor_table_builder_1' },
  { start: 0x00EB31, end: 0x00EB31 + 582, name: 'descriptor_table_builder_2' },
  { start: 0x00DB66, end: 0x00DB66 + 168, name: 'link_io_drain_1' },
  { start: 0x00DC0E, end: 0x00DC0E + 168, name: 'link_io_drain_2' },
];

function findFunction(addr) {
  for (const f of FUNC_RANGES) {
    if (addr >= f.start && addr < f.end) return f.name;
  }
  return null;
}

// IY-relative instruction patterns (all start with 0xFD prefix)
// Reads: LD r,(IY+d) — FD <opcode> <d>
const IY_READ_OPCODES = {
  0x7E: 'LD A,(IY+d)',
  0x46: 'LD B,(IY+d)',
  0x4E: 'LD C,(IY+d)',
  0x56: 'LD D,(IY+d)',
  0x5E: 'LD E,(IY+d)',
  0x66: 'LD H,(IY+d)',
  0x6E: 'LD L,(IY+d)',
};

// Writes: LD (IY+d),r — FD <opcode> <d>
const IY_WRITE_OPCODES = {
  0x77: 'LD (IY+d),A',
  0x70: 'LD (IY+d),B',
  0x71: 'LD (IY+d),C',
  0x72: 'LD (IY+d),D',
  0x73: 'LD (IY+d),E',
  0x74: 'LD (IY+d),H',
  0x75: 'LD (IY+d),L',
};

// LD (IY+d),imm — FD 36 <d> <imm>
const IY_WRITE_IMM = 0x36;

// BIT/SET/RES via FD CB <d> <op>
// SET: op = 0xC6 + (bit*8), RES: op = 0x86 + (bit*8), BIT: op = 0x46 + (bit*8)
// All target (IY+d)

// Arithmetic/logic: INC/DEC (IY+d), ADD A,(IY+d), etc.
const IY_RMW_OPCODES = {
  0x34: 'INC (IY+d)',
  0x35: 'DEC (IY+d)',
  0x86: 'ADD A,(IY+d)',
  0x8E: 'ADC A,(IY+d)',
  0x96: 'SUB (IY+d)',
  0x9E: 'SBC A,(IY+d)',
  0xA6: 'AND (IY+d)',
  0xAE: 'XOR (IY+d)',
  0xB6: 'OR (IY+d)',
  0xBE: 'CP (IY+d)',
};

// Collect results: offset => { reads: [{addr, instr, func}], writes: [...], tests: [...] }
const fieldMap = {};
for (let i = 0; i < 64; i++) {
  fieldMap[i] = { reads: [], writes: [], tests: [], rmw: [] };
}

function addEntry(offset, type, addr, instr, detail) {
  if (offset >= 64) return; // skip huge offsets
  const func = findFunction(addr);
  const entry = {
    addr: `0x${addr.toString(16).padStart(6, '0').toUpperCase()}`,
    instr,
    func: func || 'unknown',
    detail: detail || '',
  };
  fieldMap[offset][type].push(entry);
}

for (const region of REGIONS) {
  for (let i = region.start; i < region.end - 3; i++) {
    if (rom[i] !== 0xFD) continue;

    const op = rom[i + 1];
    const d = rom[i + 2]; // displacement (signed byte, but struct offsets are positive)

    // Read instructions
    if (IY_READ_OPCODES[op]) {
      addEntry(d, 'reads', i, IY_READ_OPCODES[op].replace('d', d));
      continue;
    }

    // Write instructions
    if (IY_WRITE_OPCODES[op]) {
      addEntry(d, 'writes', i, IY_WRITE_OPCODES[op].replace('d', d));
      continue;
    }

    // Write immediate
    if (op === IY_WRITE_IMM && i + 3 < region.end) {
      const imm = rom[i + 3];
      addEntry(d, 'writes', i, `LD (IY+${d}),0x${imm.toString(16).toUpperCase()}`);
      continue;
    }

    // Read-modify-write
    if (IY_RMW_OPCODES[op]) {
      addEntry(d, 'rmw', i, IY_RMW_OPCODES[op].replace('d', d));
      continue;
    }

    // BIT/SET/RES via CB prefix
    if (op === 0xCB && i + 3 < region.end) {
      const disp = d; // d is the displacement
      const cbOp = rom[i + 3];
      const bit = (cbOp >> 3) & 7;

      if ((cbOp & 0xC7) === 0x46) {
        // BIT b,(IY+d) — test
        addEntry(disp, 'tests', i, `BIT ${bit},(IY+${disp})`);
      } else if ((cbOp & 0xC7) === 0xC6) {
        // SET b,(IY+d) — write
        addEntry(disp, 'writes', i, `SET ${bit},(IY+${disp})`);
      } else if ((cbOp & 0xC7) === 0x86) {
        // RES b,(IY+d) — write
        addEntry(disp, 'writes', i, `RES ${bit},(IY+${disp})`);
      }
      continue;
    }
  }
}

// ---- Print summary to console ----
console.log('=== Connection Struct Field Map (IY+0 through IY+63) ===\n');

let maxOffset = 0;
for (let i = 63; i >= 0; i--) {
  const f = fieldMap[i];
  if (f.reads.length || f.writes.length || f.tests.length || f.rmw.length) {
    maxOffset = i;
    break;
  }
}

const usedOffsets = [];
for (let i = 0; i <= maxOffset; i++) {
  const f = fieldMap[i];
  const total = f.reads.length + f.writes.length + f.tests.length + f.rmw.length;
  if (total === 0) continue;
  usedOffsets.push(i);

  const funcsSet = new Set();
  [...f.reads, ...f.writes, ...f.tests, ...f.rmw].forEach(e => funcsSet.add(e.func));
  const funcs = [...funcsSet].join(', ');

  console.log(`Offset +${i} (0x${i.toString(16).toUpperCase()}): ${f.reads.length}R ${f.writes.length}W ${f.tests.length}T ${f.rmw.length}RMW  [${funcs}]`);

  for (const e of f.reads) {
    console.log(`  R  ${e.addr}  ${e.instr}  (${e.func})`);
  }
  for (const e of f.writes) {
    console.log(`  W  ${e.addr}  ${e.instr}  (${e.func})`);
  }
  for (const e of f.tests) {
    console.log(`  T  ${e.addr}  ${e.instr}  (${e.func})`);
  }
  for (const e of f.rmw) {
    console.log(`  M  ${e.addr}  ${e.instr}  (${e.func})`);
  }
  console.log();
}

console.log(`\nTotal offsets with activity: ${usedOffsets.length}`);
console.log(`Max offset seen: +${maxOffset}`);

// ---- Identify field groupings ----
console.log('\n=== Field Groupings (co-accessed offsets) ===\n');

// For each function, list which offsets it touches
const funcToOffsets = {};
for (let i = 0; i <= maxOffset; i++) {
  const f = fieldMap[i];
  [...f.reads, ...f.writes, ...f.tests, ...f.rmw].forEach(e => {
    if (!funcToOffsets[e.func]) funcToOffsets[e.func] = new Set();
    funcToOffsets[e.func].add(i);
  });
}

for (const [func, offsets] of Object.entries(funcToOffsets).sort((a, b) => a[0].localeCompare(b[0]))) {
  const sorted = [...offsets].sort((a, b) => a - b);
  console.log(`${func}: +${sorted.join(', +')}`);
}

// ---- Infer field types ----
console.log('\n=== Inferred Field Types ===\n');

function inferType(offset) {
  const f = fieldMap[offset];
  const all = [...f.reads, ...f.writes, ...f.tests, ...f.rmw];
  if (all.length === 0) return null;

  // Check for BIT/SET/RES => flags byte
  if (f.tests.length > 0 || all.some(e => e.instr.startsWith('SET') || e.instr.startsWith('RES'))) {
    return 'flags/bitfield';
  }

  // Check if this is part of a 3-byte pointer (consecutive L, H, U reads/writes)
  // Look for L/H register pairs at offset, offset+1, offset+2
  const hasL = all.some(e => e.instr.includes('LD L,') || e.instr.includes(',L'));
  const hasH = all.some(e => e.instr.includes('LD H,') || e.instr.includes(',H'));
  const f1 = fieldMap[offset + 1];
  const f2 = fieldMap[offset + 2];
  if (f1 && f2) {
    const all1 = [...f1.reads, ...f1.writes, ...f1.tests, ...f1.rmw];
    const all2 = [...f2.reads, ...f2.writes, ...f2.tests, ...f2.rmw];
    // Check for sequential register loading pattern
    if (all.length > 0 && all1.length > 0 && all2.length > 0) {
      // Heuristic: if 3 consecutive offsets are accessed, low byte might be pointer start
      return 'pointer/24-bit (low byte) — check +' + (offset + 1) + ', +' + (offset + 2);
    }
  }

  // Check for immediate writes with specific values
  const immWrites = all.filter(e => e.instr.includes(',0x'));
  if (immWrites.length > 0) {
    return 'byte (immediate-initialized)';
  }

  // Check for CP/SUB => comparison target
  if (all.some(e => e.instr.startsWith('CP') || e.instr.startsWith('SUB'))) {
    return 'byte (compared)';
  }

  return 'byte';
}

for (let i = 0; i <= maxOffset; i++) {
  const f = fieldMap[i];
  const total = f.reads.length + f.writes.length + f.tests.length + f.rmw.length;
  if (total === 0) continue;
  const type = inferType(i);
  console.log(`+${i}: ${type}`);
}

// ---- Generate report ----
let report = `# Phase 426 — Connection Struct Field Map

## Overview

Static scan of IY-relative instructions in USB/Link code regions
(0x009400–0x00FF00, 0x012400–0x012600) to map the connection structure
referenced via IY register.

### Scan Regions
| Region | Range | Name |
|--------|-------|------|
| 1 | 0x009400–0x00FF00 | USB/Link primary |
| 2 | 0x012400–0x012600 | USB/Link secondary |

### Known Functions Cross-Referenced
| Address | Name | Size |
|---------|------|------|
`;

for (const f of FUNC_RANGES) {
  report += `| 0x${f.start.toString(16).toUpperCase().padStart(6, '0')} | ${f.name} | ${f.end - f.start} bytes |\n`;
}

report += `\n## Complete Field Map\n\n`;
report += `| Offset | Hex | Reads | Writes | Tests | RMW | Type | Functions |\n`;
report += `|--------|-----|-------|--------|-------|-----|------|-----------|\n`;

for (let i = 0; i <= Math.max(maxOffset, 31); i++) {
  const f = fieldMap[i];
  const total = f.reads.length + f.writes.length + f.tests.length + f.rmw.length;
  const funcsSet = new Set();
  [...f.reads, ...f.writes, ...f.tests, ...f.rmw].forEach(e => funcsSet.add(e.func));
  const funcs = [...funcsSet].join(', ');
  const type = total > 0 ? (inferType(i) || '?') : '(unused)';

  report += `| +${String(i).padStart(2)} | 0x${i.toString(16).toUpperCase().padStart(2, '0')} | ${f.reads.length} | ${f.writes.length} | ${f.tests.length} | ${f.rmw.length} | ${type} | ${funcs} |\n`;
}

report += `\n## Detailed Access Log\n\n`;

for (let i = 0; i <= maxOffset; i++) {
  const f = fieldMap[i];
  const total = f.reads.length + f.writes.length + f.tests.length + f.rmw.length;
  if (total === 0) continue;

  report += `### Offset +${i} (0x${i.toString(16).toUpperCase().padStart(2, '0')})\n\n`;

  if (f.reads.length) {
    report += `**Reads:**\n`;
    for (const e of f.reads) {
      report += `- \`${e.addr}\`: \`${e.instr}\` — ${e.func}\n`;
    }
  }
  if (f.writes.length) {
    report += `**Writes:**\n`;
    for (const e of f.writes) {
      report += `- \`${e.addr}\`: \`${e.instr}\` — ${e.func}\n`;
    }
  }
  if (f.tests.length) {
    report += `**Bit Tests:**\n`;
    for (const e of f.tests) {
      report += `- \`${e.addr}\`: \`${e.instr}\` — ${e.func}\n`;
    }
  }
  if (f.rmw.length) {
    report += `**Read-Modify-Write:**\n`;
    for (const e of f.rmw) {
      report += `- \`${e.addr}\`: \`${e.instr}\` — ${e.func}\n`;
    }
  }
  report += `\n`;
}

report += `## Function-to-Field Cross Reference\n\n`;
report += `| Function | Offsets Touched |\n`;
report += `|----------|----------------|\n`;

for (const [func, offsets] of Object.entries(funcToOffsets).sort((a, b) => a[0].localeCompare(b[0]))) {
  const sorted = [...offsets].sort((a, b) => a - b);
  report += `| ${func} | +${sorted.join(', +')} |\n`;
}

report += `\n## Field Groupings and Interpretation\n\n`;

// Known field annotations
const knownFields = {
  0: 'callback pointer (low byte) — 3-byte pointer at +0/+1/+2',
  1: 'callback pointer (mid byte)',
  2: 'callback pointer (high byte)',
  8: 'busy flag (bit 7)',
  9: 'session pointer (low byte) — 3-byte pointer at +9/+10/+11',
  10: 'session pointer (mid byte)',
  11: 'session pointer (high byte)',
  12: 'secondary pointer (low byte) — 3-byte pointer at +12/+13/+14',
  13: 'secondary pointer (mid byte)',
  14: 'secondary pointer (high byte)',
  18: 'size field 1 (low byte) — 3-byte value at +18/+19/+20',
  19: 'size field 1 (mid byte)',
  20: 'size field 1 (high byte)',
  21: 'size field 2 (low byte) — 3-byte value at +21/+22/+23',
  22: 'size field 2 (mid byte)',
  23: 'size field 2 (high byte)',
  27: 'disposition state (1 byte)',
};

report += `### Previously Known Fields\n`;
for (const [off, desc] of Object.entries(knownFields)) {
  report += `- **+${off}**: ${desc}\n`;
}

report += `\n### Newly Discovered Fields\n\n`;

// Find fields not in known list that have activity
const newFields = [];
for (let i = 0; i <= maxOffset; i++) {
  if (knownFields[i]) continue;
  const f = fieldMap[i];
  const total = f.reads.length + f.writes.length + f.tests.length + f.rmw.length;
  if (total === 0) continue;
  const funcsSet = new Set();
  [...f.reads, ...f.writes, ...f.tests, ...f.rmw].forEach(e => funcsSet.add(e.func));
  const type = inferType(i);
  newFields.push({ offset: i, type, funcs: [...funcsSet], total });
}

if (newFields.length === 0) {
  report += `No previously unknown fields found with IY-relative access in the scanned regions.\n`;
} else {
  for (const nf of newFields) {
    report += `- **+${nf.offset}** (0x${nf.offset.toString(16).toUpperCase()}): ${nf.type} — accessed by: ${nf.funcs.join(', ')} (${nf.total} total accesses)\n`;
  }
}

report += `\n## Summary Statistics\n\n`;
report += `- Total offsets with IY-relative access: ${usedOffsets.length}\n`;
report += `- Maximum offset seen: +${maxOffset}\n`;
report += `- Previously known fields confirmed: ${Object.keys(knownFields).filter(k => {
  const f = fieldMap[parseInt(k)];
  return f.reads.length + f.writes.length + f.tests.length + f.rmw.length > 0;
}).length}\n`;
report += `- Newly discovered fields: ${newFields.length}\n`;

fs.writeFileSync(REPORT_PATH, report);
console.log(`\nReport written to ${REPORT_PATH}`);
