/**
 * Phase 430 Probe: Trace 0x00211B — general-purpose inline case dispatcher
 *
 * Disassembles the dispatcher body, documents the algorithm, then scans
 * the entire ROM for CALL 0x00211B (CD 1B 21 00) and decodes each site's
 * inline case table.
 *
 * Run:  node TI-84_Plus_CE/probe-phase430-trace-00211B.mjs
 */

import { readFileSync, writeFileSync } from 'fs';

const rom = readFileSync('TI-84_Plus_CE/ROM.rom');

// ── 1. Disassemble the dispatcher body ──────────────────────────────

const FUNC_START = 0x00211B;
const FUNC_END   = 0x002150;  // inclusive (RET)
const FUNC_SIZE  = FUNC_END - FUNC_START + 1;  // 54 bytes

const disasm = [
  { addr: 0x00211B, bytes: 'FD E3',        mnemonic: 'EX (SP), IY',     comment: 'IY = return addr (inline table ptr); old IY pushed' },
  { addr: 0x00211D, bytes: 'F5',           mnemonic: 'PUSH AF',         comment: 'save A (dispatch key)' },
  { addr: 0x00211E, bytes: 'C5',           mnemonic: 'PUSH BC',         comment: 'save BC' },
  { addr: 0x00211F, bytes: 'D5',           mnemonic: 'PUSH DE',         comment: 'save DE' },
  { addr: 0x002120, bytes: 'ED 33 02',     mnemonic: 'LEA IY, IY+2',    comment: 'skip 2-byte count field; IY -> first entry' },
  { addr: 0x002123, bytes: 'FD 17 FE',     mnemonic: 'LD DE, (IY-2)',   comment: 'DE = entry count (2-byte LE from count field)' },
  { addr: 0x002126, bytes: '01 00 00 00',  mnemonic: 'LD BC, 0x000000',  comment: 'zero BC (loop top — re-entered on miss)' },
  { addr: 0x00212A, bytes: 'FD 4E 00',     mnemonic: 'LD C, (IY+0)',    comment: 'C = case byte from current entry' },
  { addr: 0x00212D, bytes: 'FD 23',        mnemonic: 'INC IY',          comment: 'IY past case byte, now -> 3-byte target addr' },
  { addr: 0x00212F, bytes: 'E5',           mnemonic: 'PUSH HL',         comment: 'save HL (dispatch key, zero-extended A)' },
  { addr: 0x002130, bytes: 'B7',           mnemonic: 'OR A',            comment: 'clear carry for SBC' },
  { addr: 0x002131, bytes: 'ED 42',        mnemonic: 'SBC HL, BC',      comment: 'HL -= BC; Z flag set if HL == case byte' },
  { addr: 0x002133, bytes: 'E1',           mnemonic: 'POP HL',          comment: 'restore HL (key value)' },
  { addr: 0x002134, bytes: '28 11',        mnemonic: 'JR Z, +0x11',     comment: 'match -> jump to 0x002147 (read target addr)' },
  { addr: 0x002136, bytes: '52 1B',        mnemonic: 'DEC.SIL DE',      comment: 'decrement entry counter (16-bit in SIL mode)' },
  { addr: 0x002138, bytes: '06 00',        mnemonic: 'LD B, 0x00',      comment: 'ensure B=0 (re-zero high byte of BC)' },
  { addr: 0x00213A, bytes: '0E 00',        mnemonic: 'LD C, 0x00',      comment: 'C=0 (will be overwritten at loop top)' },
  { addr: 0x00213C, bytes: 'EB',           mnemonic: 'EX DE, HL',       comment: 'HL = counter, DE = key' },
  { addr: 0x00213D, bytes: 'B7',           mnemonic: 'OR A',            comment: 'clear carry' },
  { addr: 0x00213E, bytes: '52 ED 42',     mnemonic: 'SBC.SIL HL, BC',  comment: 'HL -= 0; sets Z if counter == 0' },
  { addr: 0x002141, bytes: 'EB',           mnemonic: 'EX DE, HL',       comment: 'restore: DE = counter, HL = key' },
  { addr: 0x002142, bytes: 'ED 33 03',     mnemonic: 'LEA IY, IY+3',    comment: 'skip 3-byte addr field; IY -> next entry' },
  { addr: 0x002145, bytes: '20 DF',        mnemonic: 'JR NZ, -0x21',    comment: 'counter != 0 -> loop back to 0x002126' },
  { addr: 0x002147, bytes: 'FD 27 00',     mnemonic: 'LD HL, (IY+0)',   comment: 'HL = target addr (match) or fall-through addr (exhausted)' },
  { addr: 0x00214A, bytes: 'D1',           mnemonic: 'POP DE',          comment: 'restore DE' },
  { addr: 0x00214B, bytes: 'C1',           mnemonic: 'POP BC',          comment: 'restore BC' },
  { addr: 0x00214C, bytes: 'F1',           mnemonic: 'POP AF',          comment: 'restore AF' },
  { addr: 0x00214D, bytes: 'FD E3',        mnemonic: 'EX (SP), IY',     comment: 'restore old IY; push IY-derived value' },
  { addr: 0x00214F, bytes: 'E3',           mnemonic: 'EX (SP), HL',     comment: 'push target addr onto stack top' },
  { addr: 0x002150, bytes: 'C9',           mnemonic: 'RET',             comment: 'pop target addr -> jump to handler' },
];

console.log('=== 0x00211B Inline Case Dispatcher — Disassembly ===');
console.log(`Function body: 0x${FUNC_START.toString(16).padStart(6, '0')} - 0x${FUNC_END.toString(16).padStart(6, '0')} (${FUNC_SIZE} bytes)\n`);

for (const line of disasm) {
  const addr = '0x' + line.addr.toString(16).padStart(6, '0');
  console.log(`${addr}  ${line.bytes.padEnd(14)} ${line.mnemonic.padEnd(24)} ; ${line.comment}`);
}

// ── 2. Algorithm summary ────────────────────────────────────────────

console.log(`
=== Algorithm ===

Calling convention:
  Caller sets HL = zero-extended dispatch key (typically: OR A; SBC HL,HL; LD L,A)
  Then CALL 0x00211B with inline table immediately after the CALL instruction.

Table format (inline, immediately after the CALL):
  [2-byte LE count] [N x (1-byte case + 3-byte LE target addr)] [3-byte LE fall-through addr]
  Total table size = 2 + N*4 + 3 bytes

Algorithm:
  1. EX (SP),IY to capture return address (= table pointer) into IY, saving old IY
  2. Read 2-byte entry count into DE; advance IY past count field
  3. Loop: load 1-byte case from (IY+0) into C (BC=0 so BC=case)
     - SBC HL,BC: if Z, match found
     - On match: read 3-byte addr from (IY+0), jump there via stack manipulation
     - On miss: DEC DE (counter), skip 3-byte addr (LEA IY,IY+3), loop if counter != 0
  4. On exhaustion (no match): IY points to fall-through addr; read it and jump there
  5. All registers (AF, BC, DE, IY) restored before jumping to target

Key details:
  - Linear scan, O(N) per dispatch
  - 16-bit counter (via SIL prefix) but all observed counts fit in 1 byte (max 11)
  - Comparison is full 24-bit SBC HL,BC but case bytes are 1-byte zero-extended
  - Both match and no-match paths converge at 0x002147 (LD HL,(IY+0) -> RET)
  - Fall-through address acts as a default/else handler
`);

// ── 3. Scan for all CALL 0x00211B sites ─────────────────────────────

const CALL_BYTES = [0xCD, 0x1B, 0x21, 0x00];
const callSites = [];

for (let i = 0; i < rom.length - 3; i++) {
  if (rom[i] === CALL_BYTES[0] && rom[i + 1] === CALL_BYTES[1] &&
      rom[i + 2] === CALL_BYTES[2] && rom[i + 3] === CALL_BYTES[3]) {
    callSites.push(i);
  }
}

console.log(`=== Call Sites (${callSites.length} found) ===\n`);

const allTables = [];

for (const site of callSites) {
  const tableStart = site + 4;
  const count = rom[tableStart] | (rom[tableStart + 1] << 8);

  const entries = [];
  for (let i = 0; i < count; i++) {
    const off = tableStart + 2 + i * 4;
    const caseVal = rom[off];
    const addr = rom[off + 1] | (rom[off + 2] << 8) | (rom[off + 3] << 16);
    entries.push({ caseVal, addr });
  }

  const fallOff = tableStart + 2 + count * 4;
  const fallAddr = rom[fallOff] | (rom[fallOff + 1] << 8) | (rom[fallOff + 2] << 16);
  const tableEnd = fallOff + 3;
  const tableSize = tableEnd - tableStart;

  const record = { site, tableStart, count, entries, fallAddr, tableEnd, tableSize };
  allTables.push(record);

  const siteHex = '0x' + site.toString(16).padStart(6, '0');
  const fallHex = '0x' + fallAddr.toString(16).padStart(6, '0');
  console.log(`CALL at ${siteHex}: ${count} entries, table ${tableSize} bytes, fall-through ${fallHex}`);

  for (const e of entries) {
    const caseHex = '0x' + e.caseVal.toString(16).padStart(2, '0');
    const addrHex = '0x' + e.addr.toString(16).padStart(6, '0');
    console.log(`  case ${caseHex} -> ${addrHex}`);
  }
  console.log();
}

// ── 4. Summary statistics ───────────────────────────────────────────

const totalEntries = allTables.reduce((s, t) => s + t.count, 0);
const totalTableBytes = allTables.reduce((s, t) => s + t.tableSize, 0);
const maxCount = Math.max(...allTables.map(t => t.count));
const minCount = Math.min(...allTables.map(t => t.count));

const allCaseVals = new Set();
for (const t of allTables) {
  for (const e of t.entries) allCaseVals.add(e.caseVal);
}

const allTargets = new Set();
for (const t of allTables) {
  for (const e of t.entries) allTargets.add(e.addr);
  allTargets.add(t.fallAddr);
}

console.log('=== Statistics ===');
console.log(`Call sites:          ${callSites.length}`);
console.log(`Total table entries: ${totalEntries}`);
console.log(`Total table bytes:   ${totalTableBytes} (inline data in ROM)`);
console.log(`Entry count range:   ${minCount} - ${maxCount}`);
console.log(`Unique case values:  ${allCaseVals.size}`);
console.log(`Unique targets:      ${allTargets.size}`);
console.log(`Dispatcher body:     ${FUNC_SIZE} bytes`);

// ── 5. Validate all target addresses ────────────────────────────────

let badTargets = 0;
for (const t of allTables) {
  for (const e of t.entries) {
    if (e.addr < 0x100 || e.addr >= 0x400000) {
      console.log(`WARNING: bad target 0x${e.addr.toString(16).padStart(6, '0')} at site 0x${t.site.toString(16).padStart(6, '0')} case 0x${e.caseVal.toString(16).padStart(2, '0')}`);
      badTargets++;
    }
  }
  if (t.fallAddr < 0x100 || t.fallAddr >= 0x400000) {
    console.log(`WARNING: bad fall-through 0x${t.fallAddr.toString(16).padStart(6, '0')} at site 0x${t.site.toString(16).padStart(6, '0')}`);
    badTargets++;
  }
}
console.log(`\nTarget validation:   ${badTargets === 0 ? 'ALL PASS' : badTargets + ' BAD'}`);

// ── 6. Generate the report ──────────────────────────────────────────

let report = `# Phase 430 Report: 0x00211B Inline Case Dispatcher

## Function Summary

| Field | Value |
|-------|-------|
| Address | \`0x00211B\` - \`0x002150\` |
| Size | ${FUNC_SIZE} bytes |
| Call sites | ${callSites.length} |
| Total inline table entries | ${totalEntries} |
| Total inline table bytes | ${totalTableBytes} |
| Entry count range | ${minCount} - ${maxCount} |

## Algorithm Pseudocode

\`\`\`
// Caller convention: HL = zero-extended dispatch key (OR A; SBC HL,HL; LD L,A)
// Inline table follows immediately after the CALL instruction

function dispatch_00211B():
    IY = pop_return_address()      // EX (SP), IY
    save AF, BC, DE

    count = read16_LE(IY)          // 2-byte LE entry count
    IY += 2                        // advance past count field

    for i = count downto 1:
        case_byte = read8(IY)      // 1-byte case value
        IY += 1
        if HL == case_byte:        // 24-bit compare (SBC HL, BC)
            target = read24_LE(IY) // 3-byte LE target address
            restore AF, BC, DE, IY
            jump target
        IY += 3                    // skip 3-byte target addr

    // No match: fall through to default
    fallthrough = read24_LE(IY)    // 3-byte LE default address
    restore AF, BC, DE, IY
    jump fallthrough
\`\`\`

## Inline Table Format

Immediately after \`CALL 0x00211B\`:

\`\`\`
Offset    Size  Description
+0        2     Entry count (little-endian 16-bit)
+2        1     Case byte 0
+3        3     Target address 0 (little-endian 24-bit)
+6        1     Case byte 1
+7        3     Target address 1
...
+2+N*4    3     Fall-through address (default handler, little-endian 24-bit)
\`\`\`

Total table size: \`2 + N*4 + 3\` bytes.

## Disassembly

\`\`\`
`;

for (const line of disasm) {
  const addr = '0x' + line.addr.toString(16).padStart(6, '0');
  report += `${addr}  ${line.bytes.padEnd(14)} ${line.mnemonic.padEnd(24)} ; ${line.comment}\n`;
}

report += `\`\`\`

## Comparison with _seqcase (0x002623)

| Feature | 0x00211B (sparse) | 0x002623 (sequential) |
|---------|-------------------|-----------------------|
| Table format | 1-byte case + 3-byte addr per entry | Dense sequential: 3-byte addr per index |
| Lookup | Linear scan, O(N) | Direct index, O(1) |
| Use case | Sparse/non-contiguous case values | Contiguous 0..N case values |
| Entry size | 4 bytes each | 3 bytes each |
| Count field | 2-byte LE | 1-byte |

## Call Sites and Case Tables

`;

for (const t of allTables) {
  const siteHex = '0x' + t.site.toString(16).padStart(6, '0');
  const fallHex = '0x' + t.fallAddr.toString(16).padStart(6, '0');
  report += `### ${siteHex} (${t.count} entries)\n\n`;
  report += `| Case | Target | Notes |\n`;
  report += `|------|--------|-------|\n`;
  for (const e of t.entries) {
    const caseHex = '0x' + e.caseVal.toString(16).padStart(2, '0');
    const addrHex = '0x' + e.addr.toString(16).padStart(6, '0');
    report += `| \`${caseHex}\` | \`${addrHex}\` | |\n`;
  }
  report += `| *default* | \`${fallHex}\` | fall-through |\n\n`;
}

report += `## Address Clusters

The ${callSites.length} call sites cluster in these ROM regions:

`;

const clusterBuckets = new Map();
for (const t of allTables) {
  const region = Math.floor(t.site / 0x1000) * 0x1000;
  if (!clusterBuckets.has(region)) clusterBuckets.set(region, []);
  clusterBuckets.get(region).push(t);
}

for (const [region, tables] of [...clusterBuckets.entries()].sort((a, b) => a[0] - b[0])) {
  const lo = '0x' + region.toString(16).padStart(6, '0');
  const hi = '0x' + (region + 0x1000).toString(16).padStart(6, '0');
  report += `- **${lo}-${hi}**: ${tables.length} site(s)\n`;
}

report += `
## Known Identifications

- **0x008A10**: USB event handler (cases 0x41, 0x45, 0x46, 0x47, 0xC0, 0xC1, 0xC2, 0xC4) -- session 429

## Statistics

- Unique case values used: ${allCaseVals.size}
- Unique target addresses: ${allTargets.size}
- Target validation: ${badTargets === 0 ? 'ALL PASS (all targets in ROM range 0x000100-0x3FFFFF)' : badTargets + ' invalid targets'}
`;

writeFileSync('TI-84_Plus_CE/phase430-00211B-report.md', report);
console.log('\nReport written to TI-84_Plus_CE/phase430-00211B-report.md');
console.log('\nDONE');
