#!/usr/bin/env node
// Phase 410 probe: map D141B3–D141BC and D14091 key state registers.
//
// Searches the ROM binary for 3-byte little-endian address patterns,
// classifies each reference as read/write/pointer-load/indirect,
// and finds IY-base loading sites + IY-relative accesses.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romPath = path.join(__dirname, 'ROM.rom');
const reportPath = path.join(__dirname, 'phase410-key-state-regs-report.md');

if (!fs.existsSync(romPath)) throw new Error(`Missing ${romPath}`);
const rom = fs.readFileSync(romPath);
const ROM_SIZE = rom.length;

function hex(v, w = 6) { return '0x' + (v >>> 0).toString(16).padStart(w, '0'); }

// Target addresses and their 3-byte LE patterns
const TARGETS = [
  { addr: 0xD141B3, label: 'D141B3 (IY base)',     iyOff: 0 },
  { addr: 0xD141B4, label: 'D141B4 (IY+1)',        iyOff: 1 },
  { addr: 0xD141B5, label: 'D141B5 (key buffer)',   iyOff: 2 },
  { addr: 0xD141B6, label: 'D141B6 (IY+3)',        iyOff: 3 },
  { addr: 0xD141B7, label: 'D141B7 (IY+4)',        iyOff: 4 },
  { addr: 0xD141B8, label: 'D141B8 (IY+5)',        iyOff: 5 },
  { addr: 0xD141B9, label: 'D141B9 (IY+6)',        iyOff: 6 },
  { addr: 0xD141BA, label: 'D141BA (notif flag)',   iyOff: 7 },
  { addr: 0xD141BB, label: 'D141BB (IY+8)',        iyOff: 8 },
  { addr: 0xD141BC, label: 'D141BC (IY+9)',        iyOff: 9 },
  { addr: 0xD14091, label: 'D14091',               iyOff: null },
];

// Instruction classification: byte before the 3-byte pattern
const SINGLE_PREFIX = {
  0x3A: 'LD A,(addr) READ',
  0x32: 'LD (addr),A WRITE',
  0x21: 'LD HL,addr PTRLOAD',
  0x01: 'LD BC,addr PTRLOAD',
  0x11: 'LD DE,addr PTRLOAD',
  0x2A: 'LD HL,(addr) INDREAD',
  0x22: 'LD (addr),HL INDWRITE',
  0xCD: 'CALL addr CALL',
  0xC3: 'JP addr JUMP',
  0xDD: 'IX-prefix',
  0xFD: 'IY-prefix',
};

// Two-byte prefixes (ED xx)
const DOUBLE_PREFIX = {
  0x4B: 'LD BC,(addr) INDREAD',
  0x5B: 'LD DE,(addr) INDREAD',
  0x6B: 'LD HL,(addr) INDREAD',
  0x43: 'LD (addr),BC INDWRITE',
  0x53: 'LD (addr),DE INDWRITE',
  0x63: 'LD (addr),HL INDWRITE',
};

// Conditional jumps/calls that take a 3-byte address
const COND_JUMPS = new Set([0xC2, 0xCA, 0xD2, 0xDA, 0xE2, 0xEA, 0xF2, 0xFA]); // JP cc,addr
const COND_CALLS = new Set([0xC4, 0xCC, 0xD4, 0xDC, 0xE4, 0xEC, 0xF4, 0xFC]); // CALL cc,addr

function classifyMatch(pos) {
  // pos = offset where the 3-byte LE pattern starts
  const results = [];

  // Check two bytes before
  if (pos >= 2) {
    const b2 = rom[pos - 2];
    const b1 = rom[pos - 1];
    if (b2 === 0xED && DOUBLE_PREFIX[b1]) {
      results.push({ pc: hex(pos - 2), instr: DOUBLE_PREFIX[b1], prefixLen: 2 });
    }
    // FD 21 = LD IY,addr
    if (b2 === 0xFD && b1 === 0x21) {
      results.push({ pc: hex(pos - 2), instr: 'LD IY,addr IYLOAD', prefixLen: 2 });
    }
    // DD 21 = LD IX,addr
    if (b2 === 0xDD && b1 === 0x21) {
      results.push({ pc: hex(pos - 2), instr: 'LD IX,addr IXLOAD', prefixLen: 2 });
    }
  }

  // Check one byte before
  if (pos >= 1) {
    const b1 = rom[pos - 1];
    if (SINGLE_PREFIX[b1] && b1 !== 0xDD && b1 !== 0xFD) {
      results.push({ pc: hex(pos - 1), instr: SINGLE_PREFIX[b1], prefixLen: 1 });
    }
    if (COND_JUMPS.has(b1)) {
      results.push({ pc: hex(pos - 1), instr: `JP cc,addr CONDJUMP (${hex(b1, 2)})`, prefixLen: 1 });
    }
    if (COND_CALLS.has(b1)) {
      results.push({ pc: hex(pos - 1), instr: `CALL cc,addr CONDCALL (${hex(b1, 2)})`, prefixLen: 1 });
    }
  }

  if (results.length === 0) {
    // Unknown context — show surrounding bytes
    const before = pos >= 3 ? [rom[pos-3], rom[pos-2], rom[pos-1]] : [];
    results.push({
      pc: hex(pos),
      instr: `UNKNOWN context: [${before.map(b => hex(b,2)).join(' ')}] <pattern>`,
      prefixLen: 0,
    });
  }

  return results;
}

function categorize(instrStr) {
  if (instrStr.includes('READ')) return 'read';
  if (instrStr.includes('WRITE')) return 'write';
  if (instrStr.includes('PTRLOAD') || instrStr.includes('IYLOAD') || instrStr.includes('IXLOAD')) return 'ptrload';
  if (instrStr.includes('CALL') || instrStr.includes('JUMP')) return 'branch';
  return 'other';
}

// --- Search for 3-byte LE patterns ---
console.log('=== Phase 410: Key State Register ROM Scan ===\n');

const allResults = {};

for (const target of TARGETS) {
  const lo = target.addr & 0xFF;
  const mid = (target.addr >> 8) & 0xFF;
  const hi = (target.addr >> 16) & 0xFF;

  const matches = [];
  for (let i = 0; i < ROM_SIZE - 2; i++) {
    if (rom[i] === lo && rom[i + 1] === mid && rom[i + 2] === hi) {
      const classified = classifyMatch(i);
      for (const c of classified) {
        matches.push({ offset: i, ...c });
      }
    }
  }

  allResults[target.addr] = { target, matches };

  const reads = matches.filter(m => categorize(m.instr) === 'read').length;
  const writes = matches.filter(m => categorize(m.instr) === 'write').length;
  const ptrloads = matches.filter(m => categorize(m.instr) === 'ptrload').length;
  const branches = matches.filter(m => categorize(m.instr) === 'branch').length;
  const other = matches.filter(m => categorize(m.instr) === 'other').length;

  console.log(`${target.label}: ${matches.length} refs (${reads} read, ${writes} write, ${ptrloads} ptrload, ${branches} branch, ${other} other)`);
  for (const m of matches) {
    console.log(`  ${m.pc}  ${m.instr}`);
  }
  console.log();
}

// --- Search for IY-base loads (LD IY, D141B3 = FD 21 B3 41 D1) ---
console.log('=== IY Base Loading Sites (LD IY, 0xD141B3) ===\n');

const iyLoadSites = [];
for (let i = 0; i < ROM_SIZE - 4; i++) {
  if (rom[i] === 0xFD && rom[i+1] === 0x21 &&
      rom[i+2] === 0xB3 && rom[i+3] === 0x41 && rom[i+4] === 0xD1) {
    iyLoadSites.push(i);
    console.log(`  ${hex(i)}: FD 21 B3 41 D1  LD IY, 0xD141B3`);
  }
}
console.log(`  Total: ${iyLoadSites.length} sites\n`);

// --- Search for IY-relative accesses ---
console.log('=== IY-Relative Access Patterns ===\n');

// FD 7E dd = LD A,(IY+d)   — read
// FD 77 dd = LD (IY+d),A   — write
// FD 36 dd vv = LD (IY+d),imm8 — write immediate
// FD 46 dd = LD B,(IY+d)   — read
// FD 4E dd = LD C,(IY+d)   — read
// FD 56 dd = LD D,(IY+d)   — read
// FD 5E dd = LD E,(IY+d)   — read
// FD 66 dd = LD H,(IY+d)   — read
// FD 6E dd = LD L,(IY+d)   — read
// FD 70 dd = LD (IY+d),B   — write
// FD 71 dd = LD (IY+d),C   — write
// FD 72 dd = LD (IY+d),D   — write
// FD 73 dd = LD (IY+d),E   — write
// FD 74 dd = LD (IY+d),H   — write
// FD 75 dd = LD (IY+d),L   — write
// FD CB dd xx = bit/set/res (IY+d) — read or write depending on xx
// FD BE dd = CP (IY+d)     — read (compare)
// FD B6 dd = OR (IY+d)     — read
// FD A6 dd = AND (IY+d)    — read
// FD AE dd = XOR (IY+d)    — read
// FD 86 dd = ADD A,(IY+d)  — read
// FD 8E dd = ADC A,(IY+d)  — read
// FD 96 dd = SUB (IY+d)    — read
// FD 9E dd = SBC A,(IY+d)  — read

const IY_READ_OPS = new Map([
  [0x7E, 'LD A,(IY+d)'],
  [0x46, 'LD B,(IY+d)'],
  [0x4E, 'LD C,(IY+d)'],
  [0x56, 'LD D,(IY+d)'],
  [0x5E, 'LD E,(IY+d)'],
  [0x66, 'LD H,(IY+d)'],
  [0x6E, 'LD L,(IY+d)'],
  [0xBE, 'CP (IY+d)'],
  [0xB6, 'OR (IY+d)'],
  [0xA6, 'AND (IY+d)'],
  [0xAE, 'XOR (IY+d)'],
  [0x86, 'ADD A,(IY+d)'],
  [0x8E, 'ADC A,(IY+d)'],
  [0x96, 'SUB (IY+d)'],
  [0x9E, 'SBC A,(IY+d)'],
]);

const IY_WRITE_OPS = new Map([
  [0x77, 'LD (IY+d),A'],
  [0x70, 'LD (IY+d),B'],
  [0x71, 'LD (IY+d),C'],
  [0x72, 'LD (IY+d),D'],
  [0x73, 'LD (IY+d),E'],
  [0x74, 'LD (IY+d),H'],
  [0x75, 'LD (IY+d),L'],
]);

const iyRelResults = {};

for (let d = 0; d <= 9; d++) {
  const targetAddr = 0xD141B3 + d;
  const label = TARGETS.find(t => t.addr === targetAddr)?.label || hex(targetAddr);
  iyRelResults[d] = { label, reads: [], writes: [], bitOps: [], immWrites: [] };

  // FD xx dd patterns (reads)
  for (const [opcode, mnemonic] of IY_READ_OPS) {
    for (let i = 0; i < ROM_SIZE - 2; i++) {
      if (rom[i] === 0xFD && rom[i+1] === opcode && rom[i+2] === d) {
        iyRelResults[d].reads.push({ pc: hex(i), instr: mnemonic.replace('d', d.toString()) });
      }
    }
  }

  // FD xx dd patterns (writes)
  for (const [opcode, mnemonic] of IY_WRITE_OPS) {
    for (let i = 0; i < ROM_SIZE - 2; i++) {
      if (rom[i] === 0xFD && rom[i+1] === opcode && rom[i+2] === d) {
        iyRelResults[d].writes.push({ pc: hex(i), instr: mnemonic.replace('d', d.toString()) });
      }
    }
  }

  // FD 36 dd vv = LD (IY+d),imm8
  for (let i = 0; i < ROM_SIZE - 3; i++) {
    if (rom[i] === 0xFD && rom[i+1] === 0x36 && rom[i+2] === d) {
      const imm = rom[i+3];
      iyRelResults[d].immWrites.push({ pc: hex(i), instr: `LD (IY+${d}),${hex(imm, 2)}`, value: imm });
    }
  }

  // FD CB dd xx = bit/set/res operations on (IY+d)
  for (let i = 0; i < ROM_SIZE - 3; i++) {
    if (rom[i] === 0xFD && rom[i+1] === 0xCB && rom[i+2] === d) {
      const op = rom[i+3];
      let mnemonic;
      if (op >= 0x40 && op <= 0x7F) {
        const bit = (op >> 3) & 7;
        mnemonic = `BIT ${bit},(IY+${d})`;
      } else if (op >= 0xC0 && op <= 0xFF) {
        const bit = (op >> 3) & 7;
        mnemonic = `SET ${bit},(IY+${d})`;
      } else if (op >= 0x80 && op <= 0xBF) {
        const bit = (op >> 3) & 7;
        mnemonic = `RES ${bit},(IY+${d})`;
      } else {
        mnemonic = `CB ${hex(op, 2)} (IY+${d})`;
      }
      iyRelResults[d].bitOps.push({ pc: hex(i), instr: mnemonic });
    }
  }

  const totalR = iyRelResults[d].reads.length;
  const totalW = iyRelResults[d].writes.length + iyRelResults[d].immWrites.length;
  const totalB = iyRelResults[d].bitOps.length;
  console.log(`IY+${d} = ${label}: ${totalR} reads, ${totalW} writes, ${totalB} bit ops`);

  for (const r of iyRelResults[d].reads) {
    console.log(`  R  ${r.pc}  ${r.instr}`);
  }
  for (const w of iyRelResults[d].writes) {
    console.log(`  W  ${w.pc}  ${w.instr}`);
  }
  for (const w of iyRelResults[d].immWrites) {
    console.log(`  Wi ${w.pc}  ${w.instr}`);
  }
  for (const b of iyRelResults[d].bitOps) {
    console.log(`  B  ${b.pc}  ${b.instr}`);
  }
  console.log();
}

// --- Generate report ---
let report = `# Phase 410: Key State Registers (D141B3-D141BC, D14091)\n\n`;
report += `Generated: ${new Date().toISOString()}\n\n`;

report += `## Structure Layout\n\n`;
report += `IY base = 0xD141B3 (loaded by LD IY,0xD141B3 at ${iyLoadSites.length} site(s))\n\n`;
report += `| Offset | Address | Label | Direct Refs | IY Reads | IY Writes | IY Bit Ops | Known Purpose |\n`;
report += `|--------|---------|-------|-------------|----------|-----------|------------|---------------|\n`;

for (const target of TARGETS) {
  const d = target.iyOff;
  const directRefs = allResults[target.addr]?.matches.length || 0;

  let iyR = 0, iyW = 0, iyB = 0;
  if (d !== null && iyRelResults[d]) {
    iyR = iyRelResults[d].reads.length;
    iyW = iyRelResults[d].writes.length + iyRelResults[d].immWrites.length;
    iyB = iyRelResults[d].bitOps.length;
  }

  let purpose = '';
  if (target.addr === 0xD141B3) purpose = 'IY base pointer for key state struct';
  else if (target.addr === 0xD141B5) purpose = 'Key buffer (5 consumers, dispatch via 0x05D58F)';
  else if (target.addr === 0xD141BA) purpose = 'Notification flag (IY+7, if zero build notification)';
  else if (target.addr === 0xD14091) purpose = 'Referenced by key buffer consumers';
  else if (target.addr === 0xD141B4) purpose = 'IY+1';
  else if (target.addr === 0xD141B6) purpose = 'IY+3';
  else if (target.addr === 0xD141B7) purpose = 'IY+4';
  else if (target.addr === 0xD141B8) purpose = 'IY+5';
  else if (target.addr === 0xD141B9) purpose = 'IY+6';
  else if (target.addr === 0xD141BB) purpose = 'IY+8';
  else if (target.addr === 0xD141BC) purpose = 'IY+9';

  const offStr = d !== null ? `IY+${d}` : 'N/A';
  report += `| ${offStr} | ${hex(target.addr)} | ${target.label.split('(')[0].trim()} | ${directRefs} | ${iyR} | ${iyW} | ${iyB} | ${purpose} |\n`;
}

report += `\n## IY Base Loading Sites\n\n`;
for (const site of iyLoadSites) {
  // Show surrounding context
  const context = [];
  for (let j = Math.max(0, site - 4); j < Math.min(ROM_SIZE, site + 10); j++) {
    context.push(hex(rom[j], 2));
  }
  report += `- ${hex(site)}: \`${context.join(' ')}\`\n`;
}

report += `\n## Detailed Direct References\n\n`;
for (const target of TARGETS) {
  const res = allResults[target.addr];
  report += `### ${target.label}\n\n`;
  if (res.matches.length === 0) {
    report += `No direct references found.\n\n`;
    continue;
  }
  report += `| PC | Instruction | Category |\n`;
  report += `|----|-------------|----------|\n`;
  for (const m of res.matches) {
    report += `| ${m.pc} | ${m.instr} | ${categorize(m.instr)} |\n`;
  }
  report += `\n`;
}

report += `## Detailed IY-Relative References\n\n`;
for (let d = 0; d <= 9; d++) {
  const ir = iyRelResults[d];
  const total = ir.reads.length + ir.writes.length + ir.immWrites.length + ir.bitOps.length;
  report += `### IY+${d} = ${ir.label} (${total} total)\n\n`;
  if (total === 0) {
    report += `No IY-relative references found.\n\n`;
    continue;
  }
  report += `| PC | Type | Instruction |\n`;
  report += `|----|------|-------------|\n`;
  for (const r of ir.reads) report += `| ${r.pc} | READ | ${r.instr} |\n`;
  for (const w of ir.writes) report += `| ${w.pc} | WRITE | ${w.instr} |\n`;
  for (const w of ir.immWrites) report += `| ${w.pc} | WRITE_IMM | ${w.instr} |\n`;
  for (const b of ir.bitOps) report += `| ${b.pc} | BIT_OP | ${b.instr} |\n`;
  report += `\n`;
}

report += `## Summary\n\n`;
let totalDirect = 0, totalIY = 0;
for (const target of TARGETS) {
  totalDirect += allResults[target.addr]?.matches.length || 0;
}
for (let d = 0; d <= 9; d++) {
  const ir = iyRelResults[d];
  totalIY += ir.reads.length + ir.writes.length + ir.immWrites.length + ir.bitOps.length;
}
report += `- Total direct references: ${totalDirect}\n`;
report += `- Total IY-relative references: ${totalIY}\n`;
report += `- IY base loading sites: ${iyLoadSites.length}\n`;

// --- Focused IY-relative analysis near LD IY,D141B3 sites ---
// The global IY-relative counts above are misleading because IY is normally
// 0xD00080 (OS system flags). Only accesses near the 3 LD IY,D141B3 sites
// actually reference the key state struct.

report += `\n## IMPORTANT: IY Context Caveat\n\n`;
report += `The IY-relative counts above include ALL IY-relative accesses across the entire ROM.\n`;
report += `The TI-OS normally has IY=0xD00080 (system flags area). Only accesses near the 3\n`;
report += `LD IY,0xD141B3 sites (0x02B373, 0x02BD8B, 0x02BDB5) actually reference the key state\n`;
report += `struct. The direct reference counts are reliable; the IY-relative counts are inflated.\n\n`;

console.log('\n=== Focused IY-Relative Access (near LD IY,D141B3 sites) ===\n');
report += `## Focused IY-Relative Access (near LD IY,D141B3 sites)\n\n`;
report += `Scanning +/- 256 bytes around each LD IY,D141B3 site for IY-relative instructions.\n\n`;

const SEARCH_RADIUS = 256;

for (const site of iyLoadSites) {
  const regionStart = Math.max(0, site - SEARCH_RADIUS);
  const regionEnd = Math.min(ROM_SIZE - 4, site + SEARCH_RADIUS);

  console.log(`--- Near ${hex(site)} (range ${hex(regionStart)}-${hex(regionEnd)}) ---`);
  report += `### Near ${hex(site)} (range ${hex(regionStart)}-${hex(regionEnd)})\n\n`;
  report += `| PC | Instruction | Offset | Target |\n`;
  report += `|----|-------------|--------|--------|\n`;

  for (let i = regionStart; i < regionEnd; i++) {
    if (rom[i] !== 0xFD) continue;
    const op = rom[i + 1];
    const d = rom[i + 2];
    if (d > 9) continue; // only offsets 0-9 matter for the key state struct

    let mnemonic = null;
    let rw = null;

    if (IY_READ_OPS.has(op)) {
      mnemonic = IY_READ_OPS.get(op).replace('d', d.toString());
      rw = 'READ';
    } else if (IY_WRITE_OPS.has(op)) {
      mnemonic = IY_WRITE_OPS.get(op).replace('d', d.toString());
      rw = 'WRITE';
    } else if (op === 0x36) {
      const imm = rom[i + 3];
      mnemonic = `LD (IY+${d}),${hex(imm, 2)}`;
      rw = 'WRITE_IMM';
    } else if (op === 0xCB) {
      const cbOp = rom[i + 3];
      if (cbOp >= 0x40 && cbOp <= 0x7F) {
        const bit = (cbOp >> 3) & 7;
        mnemonic = `BIT ${bit},(IY+${d})`;
        rw = 'BIT_TEST';
      } else if (cbOp >= 0xC0) {
        const bit = (cbOp >> 3) & 7;
        mnemonic = `SET ${bit},(IY+${d})`;
        rw = 'BIT_SET';
      } else if (cbOp >= 0x80) {
        const bit = (cbOp >> 3) & 7;
        mnemonic = `RES ${bit},(IY+${d})`;
        rw = 'BIT_RES';
      }
    } else if (op === 0x21) {
      // LD IY,addr — skip, already handled
      continue;
    }

    if (mnemonic) {
      const targetAddr = 0xD141B3 + d;
      const targetLabel = TARGETS.find(t => t.addr === targetAddr)?.label || hex(targetAddr);
      console.log(`  ${hex(i)}  ${rw.padEnd(10)} ${mnemonic.padEnd(25)} → ${targetLabel}`);
      report += `| ${hex(i)} | ${mnemonic} | IY+${d} | ${targetLabel} |\n`;
    }
  }
  report += `\n`;
  console.log();
}

fs.writeFileSync(reportPath, report);
console.log(`\nReport written to ${reportPath}`);
