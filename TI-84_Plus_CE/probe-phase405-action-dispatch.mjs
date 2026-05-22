#!/usr/bin/env node
// Phase 405: Trace action code dispatch at all callers of the action byte reader.
//
// Scans ROM for CALL instructions targeting the 4 action reader entry points,
// then disassembles the bytes after each CALL to determine how the returned
// action byte (in register A) is used.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rom = fs.readFileSync(path.join(__dirname, 'ROM.rom'));

// ---------------------------------------------------------------------------
// Entry points to scan
// ---------------------------------------------------------------------------
const ENTRY_POINTS = [
  { addr: 0x07FDD6, label: 'read_slot0_action', desc: 'Read slot 0 action byte' },
  { addr: 0x07FDD0, label: 'read_slot1_action', desc: 'Read slot 1 action byte' },
  { addr: 0x07FDC9, label: 'test_slot0_bit7',   desc: 'Test slot 0 bit 7' },
  { addr: 0x07FDC3, label: 'test_slot1_bit7',   desc: 'Test slot 1 bit 7' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function hex(n, width = 6) {
  return '0x' + n.toString(16).toUpperCase().padStart(width, '0');
}

function read24LE(buf, off) {
  return buf[off] | (buf[off + 1] << 8) | (buf[off + 2] << 16);
}

// Find all CALL nn instructions in ROM targeting `target`.
// CALL nn = 0xCD + 3-byte LE address (4 bytes total on eZ80 in ADL mode).
function findCallers(target) {
  const lo = target & 0xFF;
  const mid = (target >> 8) & 0xFF;
  const hi = (target >> 16) & 0xFF;
  const callers = [];
  for (let i = 0; i < rom.length - 3; i++) {
    if (rom[i] === 0xCD && rom[i + 1] === lo && rom[i + 2] === mid && rom[i + 3] === hi) {
      callers.push(i);
    }
  }
  return callers;
}

// Conditional JP opcodes
const JP_CC_OPCODES = new Set([0xC2, 0xCA, 0xD2, 0xDA, 0xE2, 0xEA, 0xF2, 0xFA]);

// Conditional RET opcodes
const RET_CC_OPCODES = new Set([0xC0, 0xC8, 0xD0, 0xD8, 0xE0, 0xE8, 0xF0, 0xF8]);

// Conditional JR opcodes
const JR_CC_OPCODES = new Set([0x20, 0x28, 0x30, 0x38]);

// Condition code names for JP/JR/RET cc
function ccName(opcode, isJR) {
  if (isJR) {
    const map = { 0x20: 'NZ', 0x28: 'Z', 0x30: 'NC', 0x38: 'C' };
    return map[opcode] || '??';
  }
  const idx = (opcode >> 3) & 7;
  return ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'][idx];
}

// Categorize what happens with register A after a CALL to the action reader.
// Returns an array of decoded instructions (up to `maxInsns` or `maxBytes`).
function disasmAfterCall(callAddr, maxBytes = 20, maxInsns = 8) {
  const start = callAddr + 4; // skip the CALL instruction
  const insns = [];
  let off = start;
  const end = Math.min(start + maxBytes, rom.length);

  while (off < end && insns.length < maxInsns) {
    const b = rom[off];

    if (b === 0xFE) {
      // CP n
      const imm = rom[off + 1];
      insns.push({ addr: off, type: 'CP', value: imm, text: `CP ${hex(imm, 2)}` });
      off += 2;
    } else if (b === 0xBE) {
      // CP (HL)
      insns.push({ addr: off, type: 'CP_HL', text: 'CP (HL)' });
      off += 1;
    } else if (b === 0xCD) {
      // CALL nn
      const target = read24LE(rom, off + 1);
      insns.push({ addr: off, type: 'CALL', target, text: `CALL ${hex(target)}` });
      off += 4;
    } else if (b === 0xC3) {
      // JP nn
      const target = read24LE(rom, off + 1);
      insns.push({ addr: off, type: 'JP', target, text: `JP ${hex(target)}` });
      off += 4;
      break; // unconditional jump ends this sequence
    } else if (JP_CC_OPCODES.has(b)) {
      // JP cc, nn
      const cc = ccName(b, false);
      const target = read24LE(rom, off + 1);
      insns.push({ addr: off, type: 'JP_CC', cc, target, text: `JP ${cc},${hex(target)}` });
      off += 4;
    } else if (b === 0x32) {
      // LD (nn),A
      const addr = read24LE(rom, off + 1);
      insns.push({ addr: off, type: 'LD_NN_A', target: addr, text: `LD (${hex(addr)}),A` });
      off += 4;
    } else if (b === 0x3A) {
      // LD A,(nn)
      const addr = read24LE(rom, off + 1);
      insns.push({ addr: off, type: 'LD_A_NN', target: addr, text: `LD A,(${hex(addr)})` });
      off += 4;
    } else if (b === 0x3E) {
      // LD A,n
      const imm = rom[off + 1];
      insns.push({ addr: off, type: 'LD_A_N', value: imm, text: `LD A,${hex(imm, 2)}` });
      off += 2;
    } else if (b === 0xE6) {
      // AND n
      const imm = rom[off + 1];
      insns.push({ addr: off, type: 'AND', value: imm, text: `AND ${hex(imm, 2)}` });
      off += 2;
    } else if (b === 0xF6) {
      // OR n
      const imm = rom[off + 1];
      insns.push({ addr: off, type: 'OR', value: imm, text: `OR ${hex(imm, 2)}` });
      off += 2;
    } else if (b === 0xEE) {
      // XOR n
      const imm = rom[off + 1];
      insns.push({ addr: off, type: 'XOR', value: imm, text: `XOR ${hex(imm, 2)}` });
      off += 2;
    } else if (b === 0xCB && off + 1 < end) {
      const b2 = rom[off + 1];
      if (b2 === 0x7F) {
        insns.push({ addr: off, type: 'BIT7A', text: 'BIT 7,A' });
      } else {
        const bit = (b2 >> 3) & 7;
        const reg = b2 & 7;
        const regNames = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
        const opType = (b2 >> 6) & 3;
        const opNames = ['RLC/RRC/etc', 'BIT', 'RES', 'SET'];
        insns.push({ addr: off, type: 'CB_PREFIX', text: `${opNames[opType]} ${bit},${regNames[reg]}` });
      }
      off += 2;
    } else if (b === 0xC9) {
      // RET
      insns.push({ addr: off, type: 'RET', text: 'RET' });
      off += 1;
      break;
    } else if (RET_CC_OPCODES.has(b)) {
      const cc = ccName(b, false);
      insns.push({ addr: off, type: 'RET_CC', cc, text: `RET ${cc}` });
      off += 1;
    } else if (JR_CC_OPCODES.has(b)) {
      const cc = ccName(b, true);
      const rel = rom[off + 1];
      const signed = rel >= 0x80 ? rel - 256 : rel;
      const target = off + 2 + signed;
      insns.push({ addr: off, type: 'JR_CC', cc, target, text: `JR ${cc},${hex(target)}` });
      off += 2;
    } else if (b === 0x18) {
      // JR e
      const rel = rom[off + 1];
      const signed = rel >= 0x80 ? rel - 256 : rel;
      const target = off + 2 + signed;
      insns.push({ addr: off, type: 'JR', target, text: `JR ${hex(target)}` });
      off += 2;
      break; // unconditional
    } else if (b === 0xF5) {
      insns.push({ addr: off, type: 'PUSH_AF', text: 'PUSH AF' });
      off += 1;
    } else if (b === 0xF1) {
      insns.push({ addr: off, type: 'POP_AF', text: 'POP AF' });
      off += 1;
    } else {
      // Unknown — record raw byte and stop
      insns.push({ addr: off, type: 'OTHER', opcode: b, text: `DB ${hex(b, 2)}` });
      off += 1;
    }
  }

  return insns;
}

// Classify the first "interesting" instruction after the CALL
function classifyPattern(insns) {
  if (insns.length === 0) return { category: 'empty', detail: '' };

  // Look at first instruction
  const first = insns[0];

  // If first instruction is a conditional branch (JR cc / RET cc / JP cc),
  // it tests the flags set by the CALL return — classify as "branch on flags"
  if (first.type === 'JR_CC' || first.type === 'RET_CC' || first.type === 'JP_CC') {
    return { category: 'branch_on_flags', detail: first.text };
  }

  // CP immediately
  if (first.type === 'CP') {
    return { category: 'cp_immediate', detail: `CP ${hex(first.value, 2)}` };
  }
  if (first.type === 'CP_HL') {
    return { category: 'cp_hl', detail: 'CP (HL)' };
  }

  // BIT 7,A
  if (first.type === 'BIT7A') {
    return { category: 'bit7_test', detail: 'BIT 7,A' };
  }

  // Store to RAM
  if (first.type === 'LD_NN_A') {
    return { category: 'store_to_ram', detail: `LD (${hex(first.target)}),A` };
  }

  // Pass to subroutine
  if (first.type === 'CALL') {
    return { category: 'pass_to_sub', detail: `CALL ${hex(first.target)}`, target: first.target };
  }

  // Tail-jump
  if (first.type === 'JP') {
    return { category: 'tail_jump', detail: `JP ${hex(first.target)}`, target: first.target };
  }

  // AND/OR/XOR
  if (first.type === 'AND' || first.type === 'OR' || first.type === 'XOR') {
    return { category: 'bitwise', detail: first.text };
  }

  // PUSH AF — saving the result for later
  if (first.type === 'PUSH_AF') {
    // Look ahead for what uses it
    const next = insns.find((i, idx) => idx > 0 && ['CP', 'CALL', 'JP', 'LD_NN_A', 'BIT7A'].includes(i.type));
    if (next) {
      return { category: 'push_then_use', detail: `PUSH AF ... ${next.text}` };
    }
    return { category: 'push_af', detail: 'PUSH AF (deferred use)' };
  }

  // LD A,n — overwrites A, so the original return value was already consumed by flags
  if (first.type === 'LD_A_N') {
    return { category: 'overwrite_a', detail: first.text };
  }

  // RET immediately
  if (first.type === 'RET') {
    return { category: 'ret_immediate', detail: 'RET (pass-through)' };
  }

  // CB prefix other than BIT 7,A
  if (first.type === 'CB_PREFIX') {
    return { category: 'cb_op', detail: first.text };
  }

  return { category: 'other', detail: first.text };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
console.log('=== Phase 405: Action Code Dispatch Analysis ===\n');

const allResults = [];

for (const entry of ENTRY_POINTS) {
  const callers = findCallers(entry.addr);
  console.log(`\n--- ${entry.label} (${hex(entry.addr)}) : ${entry.desc} ---`);
  console.log(`Found ${callers.length} callers\n`);

  const categories = {};
  const subTargets = {};
  const cpValues = {};
  const details = [];

  for (const callerAddr of callers) {
    const insns = disasmAfterCall(callerAddr);
    const pattern = classifyPattern(insns);

    // Tally category
    categories[pattern.category] = (categories[pattern.category] || 0) + 1;

    // Track subroutine targets
    if (pattern.target !== undefined) {
      const key = hex(pattern.target);
      subTargets[key] = (subTargets[key] || 0) + 1;
    }

    // Track CP values
    if (pattern.category === 'cp_immediate') {
      const val = insns[0].value;
      cpValues[hex(val, 2)] = (cpValues[hex(val, 2)] || 0) + 1;
    }

    details.push({
      callerAddr,
      entryLabel: entry.label,
      entryAddr: entry.addr,
      pattern,
      firstInsns: insns.slice(0, 4).map(i => i.text).join('; '),
    });
  }

  // Print category summary
  console.log('  Category breakdown:');
  const sorted = Object.entries(categories).sort((a, b) => b[1] - a[1]);
  for (const [cat, count] of sorted) {
    console.log(`    ${cat.padEnd(20)} ${count}`);
  }

  // Print CP values
  if (Object.keys(cpValues).length > 0) {
    console.log('\n  CP immediate values:');
    for (const [val, count] of Object.entries(cpValues).sort((a, b) => b[1] - a[1])) {
      console.log(`    ${val} : ${count} callers`);
    }
  }

  // Print subroutine targets
  if (Object.keys(subTargets).length > 0) {
    console.log('\n  Top subroutine/jump targets:');
    const topTargets = Object.entries(subTargets).sort((a, b) => b[1] - a[1]).slice(0, 15);
    for (const [addr, count] of topTargets) {
      console.log(`    ${addr} : ${count} callers`);
    }
  }

  allResults.push(...details);
}

// ---------------------------------------------------------------------------
// Grand summary
// ---------------------------------------------------------------------------
console.log('\n\n=== Grand Summary Across All Entry Points ===\n');

const grandCategories = {};
const grandSubTargets = {};
const grandCpValues = {};

for (const d of allResults) {
  grandCategories[d.pattern.category] = (grandCategories[d.pattern.category] || 0) + 1;
  if (d.pattern.target !== undefined) {
    const key = hex(d.pattern.target);
    grandSubTargets[key] = (grandSubTargets[key] || 0) + 1;
  }
  if (d.pattern.category === 'cp_immediate') {
    const val = d.firstInsns.match(/CP (0x[0-9A-F]+)/)?.[1] || '??';
    grandCpValues[val] = (grandCpValues[val] || 0) + 1;
  }
}

console.log('Category totals:');
for (const [cat, count] of Object.entries(grandCategories).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${cat.padEnd(20)} ${count}`);
}

console.log('\nTop subroutine/jump targets (all entry points):');
for (const [addr, count] of Object.entries(grandSubTargets).sort((a, b) => b[1] - a[1]).slice(0, 20)) {
  console.log(`  ${addr} : ${count} callers`);
}

if (Object.keys(grandCpValues).length > 0) {
  console.log('\nAll CP immediate values:');
  for (const [val, count] of Object.entries(grandCpValues).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${val} : ${count} callers`);
  }
}

// ---------------------------------------------------------------------------
// Full caller detail listing
// ---------------------------------------------------------------------------
console.log('\n\n=== Full Caller Detail ===\n');
for (const entry of ENTRY_POINTS) {
  const entryCallers = allResults.filter(d => d.entryAddr === entry.addr);
  console.log(`\n--- ${entry.label} (${hex(entry.addr)}) ---`);
  for (const d of entryCallers) {
    console.log(`  ${hex(d.callerAddr)} : [${d.pattern.category}] ${d.firstInsns}`);
  }
}

// ---------------------------------------------------------------------------
// Generate report
// ---------------------------------------------------------------------------
const reportPath = path.join(__dirname, 'phase405-action-dispatch-report.md');

let report = `# Phase 405: Action Code Dispatch Analysis

## Overview

Traced all callers of the 4 action byte reader entry points to determine
how the returned action code (register A) is dispatched.

## Entry Points

| Address | Label | Description | Callers Found |
|---------|-------|-------------|---------------|
`;

for (const entry of ENTRY_POINTS) {
  const count = allResults.filter(d => d.entryAddr === entry.addr).length;
  report += `| ${hex(entry.addr)} | ${entry.label} | ${entry.desc} | ${count} |\n`;
}

report += `\n## Dispatch Pattern Summary (All ${allResults.length} Callers)\n\n`;
report += '| Pattern | Count | Description |\n';
report += '|---------|-------|-------------|\n';

const patternDescriptions = {
  branch_on_flags: 'Conditional branch on flags set by the reader (JR cc / RET cc / JP cc)',
  cp_immediate: 'Direct CP n comparison against specific action code',
  cp_hl: 'CP (HL) — compare against memory-pointed value',
  bit7_test: 'BIT 7,A — tests the high bit flag',
  store_to_ram: 'LD (nn),A — stores action byte to RAM',
  pass_to_sub: 'CALL nn — passes action byte to a subroutine',
  tail_jump: 'JP nn — tail-jump to handler',
  bitwise: 'AND/OR/XOR — bitwise operation on action byte',
  push_af: 'PUSH AF — saves result for deferred use',
  push_then_use: 'PUSH AF then later uses the value',
  overwrite_a: 'LD A,n — overwrites A (flags already consumed)',
  ret_immediate: 'RET — passes action byte back to grandparent caller',
  cb_op: 'CB-prefix operation (BIT/SET/RES on registers)',
  other: 'Other pattern',
  empty: 'No instructions decoded',
};

for (const [cat, count] of Object.entries(grandCategories).sort((a, b) => b[1] - a[1])) {
  const desc = patternDescriptions[cat] || cat;
  report += `| ${cat} | ${count} | ${desc} |\n`;
}

report += '\n## CP Immediate Values (Known Action Codes)\n\n';
if (Object.keys(grandCpValues).length > 0) {
  report += '| Value | Callers |\n';
  report += '|-------|--------|\n';
  for (const [val, count] of Object.entries(grandCpValues).sort((a, b) => b[1] - a[1])) {
    report += `| ${val} | ${count} |\n`;
  }
} else {
  report += 'No direct CP n instructions found.\n';
}

report += '\n## Top Subroutine/Jump Targets\n\n';
report += 'These are the functions most frequently called with the action byte in A:\n\n';
report += '| Target Address | Callers | Notes |\n';
report += '|----------------|---------|-------|\n';
for (const [addr, count] of Object.entries(grandSubTargets).sort((a, b) => b[1] - a[1]).slice(0, 20)) {
  report += `| ${addr} | ${count} | |\n`;
}

report += '\n## Per-Entry-Point Detail\n\n';
for (const entry of ENTRY_POINTS) {
  const entryCallers = allResults.filter(d => d.entryAddr === entry.addr);
  report += `### ${entry.label} (${hex(entry.addr)})\n\n`;
  report += `${entry.desc} -- ${entryCallers.length} callers\n\n`;
  report += '| Caller | Pattern | First Instructions |\n';
  report += '|--------|---------|--------------------|\n';
  for (const d of entryCallers) {
    report += `| ${hex(d.callerAddr)} | ${d.pattern.category} | \`${d.firstInsns}\` |\n`;
  }
  report += '\n';
}

report += `\n## Key Findings\n\n`;
report += `- Total callers across all 4 entry points: ${allResults.length}\n`;
report += `- Most common dispatch pattern: ${Object.entries(grandCategories).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A'}\n`;

const totalSubCalls = Object.values(grandSubTargets).reduce((a, b) => a + b, 0);
report += `- Callers that pass action byte to subroutines: ${totalSubCalls}\n`;
report += `- Unique subroutine targets: ${Object.keys(grandSubTargets).length}\n`;

fs.writeFileSync(reportPath, report);
console.log(`\nReport written to ${reportPath}`);
