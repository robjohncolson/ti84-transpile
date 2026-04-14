#!/usr/bin/env node
/**
 * Phase 137 — 0x0800A0 Caller Analysis (IY+0x14 bit 3 flag)
 *
 * Pure static ROM scan. No executor needed.
 *
 * 0x0800A0 does: BIT 3,(IY+0x14); RET  — tests bit 3 of 0xD00094
 * 0x0800C2 does: RES 3,(IY+0x14); RET  — clears bit 3 of 0xD00094
 *
 * Tasks:
 *  1. Find all CALL 0x0800A0 (CD A0 00 08) in ROM
 *  2. Find all CALL 0x0800C2 (CD C2 00 08) in ROM
 *  3. Analyze 20 sample callers — what branch instruction follows?
 *  4. Cross-reference existing phase reports
 *  5. Hypothesize flag meaning
 *  6. Write report
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const REPORT_PATH = path.join(__dirname, 'phase137-report.md');

const rom = fs.readFileSync(ROM_PATH);

// ── Helpers ──────────────────────────────────────────────────────────

function hexAddr(n) {
  return '0x' + n.toString(16).padStart(6, '0');
}

function hexByte(b) {
  return b.toString(16).padStart(2, '0');
}

function hexDump(buf, start, len) {
  const bytes = [];
  for (let i = 0; i < len; i++) {
    const addr = start + i;
    if (addr < 0 || addr >= buf.length) {
      bytes.push('??');
    } else {
      bytes.push(hexByte(buf[addr]));
    }
  }
  return bytes.join(' ');
}

// Known branch opcodes after CALL
const BRANCH_OPCODES = {
  0x28: 'JR Z,dd',
  0x20: 'JR NZ,dd',
  0x38: 'JR C,dd',
  0x30: 'JR NC,dd',
  0xCA: 'JP Z,nnnnnn',
  0xC2: 'JP NZ,nnnnnn',
  0xDA: 'JP C,nnnnnn',
  0xD2: 'JP NC,nnnnnn',
  0xC8: 'RET Z',
  0xC0: 'RET NZ',
  0xD8: 'RET C',
  0xD0: 'RET NC',
  0xC9: 'RET',
  0x18: 'JR dd',
  0xC3: 'JP nnnnnn',
};

// ── 1. Scan for CALL 0x0800A0 ─────────────────────────────────────────

function scanForCall(target) {
  const lo = target & 0xFF;
  const mi = (target >> 8) & 0xFF;
  const hi = (target >> 16) & 0xFF;
  const results = [];
  for (let i = 0; i < rom.length - 3; i++) {
    if (rom[i] === 0xCD && rom[i+1] === lo && rom[i+2] === mi && rom[i+3] === hi) {
      results.push(i);
    }
  }
  return results;
}

console.log('Scanning ROM for CALL 0x0800A0...');
const callers0800A0 = scanForCall(0x0800A0);
console.log(`  Found ${callers0800A0.length} calls to 0x0800A0`);

console.log('Scanning ROM for CALL 0x0800C2...');
const callers0800C2 = scanForCall(0x0800C2);
console.log(`  Found ${callers0800C2.length} calls to 0x0800C2`);

// ── 2. Also scan for direct BIT 3,(IY+0x14) inline ──────────────────
// FD CB 14 5E
function scanForBitInline() {
  const results = [];
  for (let i = 0; i < rom.length - 3; i++) {
    if (rom[i] === 0xFD && rom[i+1] === 0xCB && rom[i+2] === 0x14 && rom[i+3] === 0x5E) {
      // Exclude the one at 0x0800A0 itself
      if (i !== 0x0800A0) {
        results.push(i);
      }
    }
  }
  return results;
}

console.log('Scanning ROM for inline BIT 3,(IY+0x14)...');
const inlineBit = scanForBitInline();
console.log(`  Found ${inlineBit.length} inline occurrences (excluding 0x0800A0)`);

// Also scan for SET 3,(IY+0x14) — FD CB 14 DE
function scanForSetInline() {
  const results = [];
  for (let i = 0; i < rom.length - 3; i++) {
    if (rom[i] === 0xFD && rom[i+1] === 0xCB && rom[i+2] === 0x14 && rom[i+3] === 0xDE) {
      results.push(i);
    }
  }
  return results;
}

console.log('Scanning ROM for inline SET 3,(IY+0x14)...');
const inlineSet = scanForSetInline();
console.log(`  Found ${inlineSet.length} inline SET occurrences`);

// Also scan for RES 3,(IY+0x14) inline — FD CB 14 9E
function scanForResInline() {
  const results = [];
  for (let i = 0; i < rom.length - 3; i++) {
    if (rom[i] === 0xFD && rom[i+1] === 0xCB && rom[i+2] === 0x14 && rom[i+3] === 0x9E) {
      // Exclude the one at 0x0800C2 itself
      if (i !== 0x0800C2) {
        results.push(i);
      }
    }
  }
  return results;
}

console.log('Scanning ROM for inline RES 3,(IY+0x14)...');
const inlineRes = scanForResInline();
console.log(`  Found ${inlineRes.length} inline RES occurrences (excluding 0x0800C2)`);

// ── 3. Analyze sample callers of 0x0800A0 ───────────────────────────

function analyzeCallers(callerAddrs, sampleSize) {
  const sample = callerAddrs.slice(0, sampleSize);
  const branchTally = {};
  const details = [];

  for (const callAddr of sample) {
    const contextStart = Math.max(0, callAddr - 10);
    const contextLen = 30;
    const dump = hexDump(rom, contextStart, contextLen);

    // The CALL is 4 bytes (CD xx xx xx), so the next instruction is at callAddr+4
    const nextAddr = callAddr + 4;
    const nextOpcode = nextAddr < rom.length ? rom[nextAddr] : null;
    const branchName = BRANCH_OPCODES[nextOpcode] ?? `unknown (0x${hexByte(nextOpcode ?? 0)})`;

    const key = branchName;
    branchTally[key] = (branchTally[key] || 0) + 1;

    // Also decode the branch target if applicable
    let branchTarget = null;
    if (nextOpcode === 0x28 || nextOpcode === 0x20 || nextOpcode === 0x38 || nextOpcode === 0x30 || nextOpcode === 0x18) {
      // JR: signed 8-bit offset from (nextAddr+2)
      const offset = rom[nextAddr + 1];
      const signed = offset >= 128 ? offset - 256 : offset;
      branchTarget = hexAddr(nextAddr + 2 + signed);
    } else if (nextOpcode === 0xCA || nextOpcode === 0xC2 || nextOpcode === 0xDA || nextOpcode === 0xD2 || nextOpcode === 0xC3) {
      // JP: 3-byte LE address
      branchTarget = hexAddr(rom[nextAddr+1] | (rom[nextAddr+2] << 8) | (rom[nextAddr+3] << 16));
    }

    details.push({
      callAddr: hexAddr(callAddr),
      dump,
      nextOpcode: nextOpcode !== null ? hexByte(nextOpcode) : '??',
      branchName,
      branchTarget,
    });
  }

  return { details, branchTally };
}

// Analyze ALL callers for the full tally, but only show details for first 20
console.log('\nAnalyzing all callers of 0x0800A0 for branch pattern...');
const fullAnalysis = analyzeCallers(callers0800A0, callers0800A0.length);
const sampleAnalysis = analyzeCallers(callers0800A0, 20);

console.log('\nBranch pattern tally (all callers):');
for (const [k, v] of Object.entries(fullAnalysis.branchTally).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k}: ${v}`);
}

// ── 4. Analyze callers of 0x0800C2 ──────────────────────────────────

console.log('\nAnalyzing all callers of 0x0800C2...');
const resAnalysis = analyzeCallers(callers0800C2, callers0800C2.length);

// ── 5. Cross-reference existing reports ──────────────────────────────

function crossRefReports() {
  const reportDir = __dirname;
  const files = fs.readdirSync(reportDir).filter(f => f.match(/phase\d+-report\.md/i));
  const results = [];
  const searchTerms = ['0xD00094', 'D00094', 'IY+0x14', '0x0800A0', '0x0800C2', '0800a0', '0800c2', 'd00094'];

  for (const file of files) {
    const content = fs.readFileSync(path.join(reportDir, file), 'utf8');
    const matches = [];
    for (const term of searchTerms) {
      if (content.toLowerCase().includes(term.toLowerCase())) {
        // Find the lines containing the term
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].toLowerCase().includes(term.toLowerCase())) {
            matches.push({ line: i + 1, text: lines[i].trim().substring(0, 120) });
          }
        }
      }
    }
    if (matches.length > 0) {
      // Deduplicate by line number
      const seen = new Set();
      const unique = matches.filter(m => {
        if (seen.has(m.line)) return false;
        seen.add(m.line);
        return true;
      });
      results.push({ file, matches: unique.slice(0, 10) }); // cap at 10 per file
    }
  }
  return results;
}

console.log('\nCross-referencing existing reports...');
const crossRefs = crossRefReports();
console.log(`  Found references in ${crossRefs.length} report files`);

// ── 6. Generate report ───────────────────────────────────────────────

function generateReport() {
  const lines = [];
  lines.push('# Phase 137 — 0x0800A0 Caller Analysis (IY+0x14 bit 3 flag)');
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push('`0x0800A0` tests bit 3 of `(IY+0x14)` = memory `0xD00094`, returning Z flag.');
  lines.push('`0x0800C2` clears that same bit (RES 3).');
  lines.push('');
  lines.push(`- **CALL 0x0800A0**: ${callers0800A0.length} occurrences in ROM`);
  lines.push(`- **CALL 0x0800C2**: ${callers0800C2.length} occurrences in ROM`);
  lines.push(`- **Inline BIT 3,(IY+0x14)**: ${inlineBit.length} (excluding 0x0800A0 itself)`);
  lines.push(`- **Inline SET 3,(IY+0x14)**: ${inlineSet.length}`);
  lines.push(`- **Inline RES 3,(IY+0x14)**: ${inlineRes.length} (excluding 0x0800C2 itself)`);
  lines.push('');

  // All caller addresses
  lines.push('## All CALL 0x0800A0 Addresses');
  lines.push('');
  lines.push('```');
  for (let i = 0; i < callers0800A0.length; i++) {
    lines.push(hexAddr(callers0800A0[i]));
  }
  lines.push('```');
  lines.push('');

  // All CALL 0x0800C2 addresses
  lines.push('## All CALL 0x0800C2 Addresses');
  lines.push('');
  lines.push('```');
  for (let i = 0; i < callers0800C2.length; i++) {
    lines.push(hexAddr(callers0800C2[i]));
  }
  lines.push('```');
  lines.push('');

  // Inline occurrences
  if (inlineBit.length > 0) {
    lines.push('## Inline BIT 3,(IY+0x14) Addresses');
    lines.push('');
    lines.push('```');
    for (const addr of inlineBit) lines.push(hexAddr(addr));
    lines.push('```');
    lines.push('');
  }

  if (inlineSet.length > 0) {
    lines.push('## Inline SET 3,(IY+0x14) Addresses');
    lines.push('');
    lines.push('```');
    for (const addr of inlineSet) lines.push(hexAddr(addr));
    lines.push('```');
    lines.push('');
  }

  if (inlineRes.length > 0) {
    lines.push('## Inline RES 3,(IY+0x14) Addresses');
    lines.push('');
    lines.push('```');
    for (const addr of inlineRes) lines.push(hexAddr(addr));
    lines.push('```');
    lines.push('');
  }

  // Branch pattern tally
  lines.push('## Branch Pattern After CALL 0x0800A0 (All Callers)');
  lines.push('');
  lines.push('| Instruction After CALL | Count |');
  lines.push('|------------------------|-------|');
  for (const [k, v] of Object.entries(fullAnalysis.branchTally).sort((a, b) => b[1] - a[1])) {
    lines.push(`| ${k} | ${v} |`);
  }
  lines.push('');

  // Sample caller details
  lines.push('## Sample Caller Details (First 20 of 0x0800A0)');
  lines.push('');
  for (const d of sampleAnalysis.details) {
    lines.push(`### ${d.callAddr}`);
    lines.push('```');
    lines.push(`hex: ${d.dump}`);
    lines.push(`next opcode: 0x${d.nextOpcode} = ${d.branchName}${d.branchTarget ? ' -> ' + d.branchTarget : ''}`);
    lines.push('```');
    lines.push('');
  }

  // 0x0800C2 caller details
  lines.push('## CALL 0x0800C2 Caller Details');
  lines.push('');
  for (const d of resAnalysis.details) {
    lines.push(`### ${d.callAddr}`);
    lines.push('```');
    lines.push(`hex: ${d.dump}`);
    lines.push(`next opcode: 0x${d.nextOpcode} = ${d.branchName}${d.branchTarget ? ' -> ' + d.branchTarget : ''}`);
    lines.push('```');
    lines.push('');
  }

  // Cross-references
  lines.push('## Cross-References in Existing Reports');
  lines.push('');
  if (crossRefs.length === 0) {
    lines.push('No references found in existing phase reports.');
  } else {
    for (const ref of crossRefs) {
      lines.push(`### ${ref.file}`);
      lines.push('');
      for (const m of ref.matches) {
        lines.push(`- Line ${m.line}: ${m.text}`);
      }
      lines.push('');
    }
  }

  // Address range analysis
  lines.push('## Address Range Distribution');
  lines.push('');
  const ranges = {};
  for (const addr of callers0800A0) {
    const rangeKey = hexAddr(addr & 0xFF0000);
    ranges[rangeKey] = (ranges[rangeKey] || 0) + 1;
  }
  lines.push('| ROM Region | Caller Count |');
  lines.push('|------------|-------------|');
  for (const [k, v] of Object.entries(ranges).sort((a, b) => b[1] - a[1])) {
    lines.push(`| ${k}–${hexAddr((parseInt(k, 16) | 0xFFFF))} | ${v} |`);
  }
  lines.push('');

  // Hypothesis
  lines.push('## Hypothesis');
  lines.push('');

  // Determine dominant branch pattern
  const totalCallers = callers0800A0.length;
  const jrZcount = fullAnalysis.branchTally['JR Z,dd'] || 0;
  const jrNZcount = fullAnalysis.branchTally['JR NZ,dd'] || 0;
  const jpZcount = fullAnalysis.branchTally['JP Z,nnnnnn'] || 0;
  const jpNZcount = fullAnalysis.branchTally['JP NZ,nnnnnn'] || 0;
  const retZcount = fullAnalysis.branchTally['RET Z'] || 0;
  const retNZcount = fullAnalysis.branchTally['RET NZ'] || 0;

  const zBranches = jrZcount + jpZcount + retZcount;
  const nzBranches = jrNZcount + jpNZcount + retNZcount;

  lines.push(`Out of ${totalCallers} callers:`);
  lines.push(`- ${zBranches} branch on Z (flag IS clear / bit=0) — "if flag not set, do X"`);
  lines.push(`- ${nzBranches} branch on NZ (flag IS set / bit=1) — "if flag set, do X"`);
  lines.push('');
  lines.push('### Interpretation');
  lines.push('');
  lines.push('`BIT 3,(IY+0x14)` tests bit 3 of the OS flags byte at `0xD00094`.');
  lines.push('On the TI-84 Plus CE, `IY` points to the OS flag area at `0xD00080`.');
  lines.push('Offset `0x14` (20 decimal) = byte `0xD00094`.');
  lines.push('');
  lines.push('In the TI OS flag nomenclature, this is part of the **system flags** area.');
  lines.push('Bit 3 of offset `0x14` from the flag base is commonly associated with');
  lines.push('the **text write / cursor** system — specifically whether the OS is in a');
  lines.push('state where text input operations should be processed or deferred.');
  lines.push('');
  if (nzBranches > zBranches) {
    lines.push('The majority of callers branch on NZ (bit is set), suggesting most code');
    lines.push('checks "is this flag active?" and takes a special path when it is.');
  } else if (zBranches > nzBranches) {
    lines.push('The majority of callers branch on Z (bit is clear), suggesting most code');
    lines.push('checks "is this flag active?" and skips an operation when it is NOT set.');
  } else {
    lines.push('Callers are roughly evenly split between Z and NZ branches, suggesting');
    lines.push('the flag is used as a general-purpose toggle checked in many contexts.');
  }
  lines.push('');
  lines.push('The companion `RES 3,(IY+0x14)` at `0x0800C2` (clears the flag) being called');
  lines.push(`from only ${callers0800C2.length} sites suggests the flag is cleared in specific`);
  lines.push('cleanup/reset paths rather than toggled frequently.');
  lines.push('');
  lines.push(`With ${totalCallers} callers testing and ${inlineSet.length} inline SET + ${callers0800C2.length} CALL-based RES,`);
  lines.push('this flag appears to be a widely-consulted OS state bit — likely a "busy" or');
  lines.push('"mode active" indicator that many subsystems check before proceeding.');
  lines.push('');

  // Known values from other phases
  lines.push('### Known Values from Other Phases');
  lines.push('');
  lines.push('- Phase 100d: `0xD00094` transitions from `0x00` to `0xFF` during boot');
  lines.push('- Phase 117: `0xD00094` = `0xF7` / `0xE7` (bit 3 = 0 in `0xF7`, bit 3 = 1... no, `0xF7` = 11110111 so bit 3 = 0; `0xE7` = 11100111 so bit 3 = 0)');
  lines.push('- Phase 129: `0xD00094` = `0xFF` (all bits set, including bit 3) / `0xDF` (bit 5 cleared)');
  lines.push('- Phase 91a: `0xD00094` = `0xFF` at mode-bytes snapshot');
  lines.push('');
  lines.push('When `0xD00094 = 0xFF`, bit 3 = 1 → `BIT 3,(IY+0x14)` returns NZ.');
  lines.push('When `0xD00094 = 0xF7`, bit 3 = 0 → `BIT 3,(IY+0x14)` returns Z.');
  lines.push('');
  lines.push('The flag starts clear (0x00), gets set to 0xFF during boot, and is selectively');
  lines.push('manipulated. The `RES 3` calls clear just bit 3 while preserving other bits.');

  lines.push('');
  lines.push('---');
  lines.push('*Generated by probe-phase137-iy14-flag-analysis.mjs*');

  fs.writeFileSync(REPORT_PATH, lines.join('\n'), 'utf8');
  console.log(`\nReport written to ${REPORT_PATH}`);
}

generateReport();
