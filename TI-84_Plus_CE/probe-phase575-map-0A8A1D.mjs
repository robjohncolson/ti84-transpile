/**
 * probe-phase575-map-0A8A1D.mjs
 *
 * Decode function at 0x0A8A1D — LCD row height helper that wraps 0x0A89FE
 * (LCD parameter computation). Manually disassembles eZ80 ADL-mode bytes
 * and scans ROM for callers.
 */
import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rom = readFileSync(join(__dirname, 'ROM.rom'));

const FUNC_START = 0x0A8A1D;
const FUNC_END   = 0x0A8A32; // inclusive (RET byte)
const FUNC_SIZE  = FUNC_END - FUNC_START + 1; // 22 bytes

// ── Manual disassembly ──────────────────────────────────────────────

function hex(v, w = 6) {
  return '0x' + v.toString(16).toUpperCase().padStart(w, '0');
}

function hexBytes(start, end) {
  return Array.from(rom.slice(start, end))
    .map(b => b.toString(16).toUpperCase().padStart(2, '0'))
    .join(' ');
}

// Hand-decoded instruction table for 0x0A8A1D..0x0A8A32
const instructions = [
  { addr: 0x0A8A1D, size: 4, bytes: 'CD FE 89 0A',     mnemonic: 'CALL 0x0A89FE',       comment: 'LCD param computation (session 573)' },
  { addr: 0x0A8A21, size: 4, bytes: '21 14 00 00',      mnemonic: 'LD HL,0x000014',       comment: 'HL = 20 (large font row height)' },
  { addr: 0x0A8A25, size: 4, bytes: 'FD CB 51 5E',      mnemonic: 'BIT 3,(IY+0x51)',      comment: 'test font-size flag' },
  { addr: 0x0A8A29, size: 2, bytes: '28 04',             mnemonic: 'JR Z,0x0A8A2F',       comment: 'if large font → skip' },
  { addr: 0x0A8A2B, size: 4, bytes: '21 13 00 00',      mnemonic: 'LD HL,0x000013',       comment: 'HL = 19 (small font row height)' },
  { addr: 0x0A8A2F, size: 1, bytes: '19',                mnemonic: 'ADD HL,DE',            comment: 'HL = DE + row_height' },
  { addr: 0x0A8A30, size: 1, bytes: '13',                mnemonic: 'INC DE',               comment: 'DE++' },
  { addr: 0x0A8A31, size: 1, bytes: 'EB',                mnemonic: 'EX DE,HL',             comment: 'DE = old HL+DE+height; HL = old DE+1' },
  { addr: 0x0A8A32, size: 1, bytes: 'C9',                mnemonic: 'RET',                  comment: '' },
];

// ── Caller scan ─────────────────────────────────────────────────────

const pattern = [0x1D, 0x8A, 0x0A]; // LE encoding of 0x0A8A1D
const callers = [];

for (let i = 1; i < rom.length - 2; i++) {
  if (rom[i] === pattern[0] && rom[i + 1] === pattern[1] && rom[i + 2] === pattern[2]) {
    const prev = rom[i - 1];
    let kind = 'REF';
    if (prev === 0xCD) kind = 'CALL';
    else if (prev === 0xC3) kind = 'JP';
    else if (prev === 0xC4) kind = 'CALL NZ';
    else if (prev === 0xCC) kind = 'CALL Z';
    else if (prev === 0xD4) kind = 'CALL NC';
    else if (prev === 0xDC) kind = 'CALL C';
    callers.push({ addr: i - 1, kind });
  }
}

// ── Output ──────────────────────────────────────────────────────────

console.log('=== 0x0A8A1D: LCD ROW HEIGHT HELPER ===');
console.log(`Function size: ${FUNC_SIZE} bytes (${hex(FUNC_START)}..${hex(FUNC_END)})`);
console.log();

console.log('Disassembly:');
for (const inst of instructions) {
  const addrStr = hex(inst.addr);
  const bytesStr = inst.bytes.padEnd(16);
  const mnemStr = inst.mnemonic.padEnd(24);
  const commentStr = inst.comment ? `; ${inst.comment}` : '';
  console.log(`  ${addrStr}: ${bytesStr} ${mnemStr} ${commentStr}`);
}
console.log();

console.log(`Callers (${callers.length}):`);
for (const c of callers) {
  console.log(`  ${hex(c.addr)}: ${c.kind}`);
}
console.log();

// Verify bytes match ROM
let mismatch = false;
for (const inst of instructions) {
  const expected = inst.bytes.split(' ').map(s => parseInt(s, 16));
  for (let j = 0; j < expected.length; j++) {
    if (rom[inst.addr + j] !== expected[j]) {
      console.log(`MISMATCH at ${hex(inst.addr + j)}: ROM=${hex(rom[inst.addr + j], 2)} expected=${hex(expected[j], 2)}`);
      mismatch = true;
    }
  }
}
if (!mismatch) console.log('Byte verification: ALL MATCH');

console.log();
console.log('Functional summary:');
console.log('  0x0A8A1D is a thin wrapper around 0x0A89FE (LCD param computation).');
console.log('  It computes a "next row Y" position by adding a font-dependent row height');
console.log('  (20 for large font, 19 for small font) to the current DE value.');
console.log('  Font size is determined by IY+0x51 bit 3.');
console.log('  On return: DE = old_DE + row_height, HL = old_DE + 1.');
console.log('  All 3 callers are in the 0x0A8A5B..0x0A8B0F range (LCD display region).');

// ── Write report ────────────────────────────────────────────────────

const report = `# Phase 575 Part 1 — 0x0A8A1D: LCD Row Height Helper

## Summary

| Field | Value |
|-------|-------|
| Address | 0x0A8A1D |
| Size | 22 bytes (0x0A8A1D..0x0A8A32) |
| Callers | 3 (all CALL) |
| Callee | 0x0A89FE (LCD param computation, session 573) |
| RAM refs | None direct (delegates to 0x0A89FE for D02A75/D02A77/D02A79) |
| IY flags | IY+0x51 bit 3 — font size selector |
| Role | Computes next-row Y position by adding font-dependent row height to DE |

## Disassembly

\`\`\`
${instructions.map(i => {
  const a = hex(i.addr);
  const b = i.bytes.padEnd(16);
  const m = i.mnemonic.padEnd(24);
  const c = i.comment ? '; ' + i.comment : '';
  return a + ': ' + b + ' ' + m + ' ' + c;
}).join('\n')}
\`\`\`

## Logic Flow

1. **CALL 0x0A89FE** — runs LCD parameter computation (reads D02A75/D02A77/D02A79 via .SIS, checks IY+0x51 bit 3 font flag). Returns with LCD state in registers.
2. **LD HL,20** — assume large font row height (20 pixels).
3. **BIT 3,(IY+0x51)** — test font-size flag.
4. **JR Z,skip** — if bit 3 is clear (large font), keep HL=20.
5. **LD HL,19** — if bit 3 is set (small font), use 19-pixel row height.
6. **ADD HL,DE** — HL = current_Y + row_height.
7. **INC DE** — DE = current_Y + 1.
8. **EX DE,HL** — swap: DE = new_row_Y, HL = current_Y + 1.
9. **RET**

## Font Row Heights

| IY+0x51 bit 3 | Font | Row height (pixels) |
|----------------|------|---------------------|
| 0 (clear) | Large | 20 |
| 1 (set) | Small | 19 |

## Callers

| Address | Type | Context |
|---------|------|---------|
| 0x0A8A5B | CALL | Within LCD display function at ~0x0A8A33 |
| 0x0A8ADA | CALL | Within LCD display function at ~0x0A8ACD |
| 0x0A8B0F | CALL | Within LCD display function at ~0x0A8AFD |

All 3 callers are in the 0x0A8A33..0x0A8B1D range — the LCD text rendering / cursor positioning region immediately following this function.

## Relationship to Session 573

Session 573 decoded 0x0A89FE as a 31-byte LCD parameter computation function. 0x0A8A1D is the first consumer: it wraps 0x0A89FE and adds row-height arithmetic. The font-size flag at IY+0x51 bit 3 is the same flag 0x0A89FE checks internally, confirming these two functions form a "compute LCD params then advance row" pair.
`;

writeFileSync(join(__dirname, 'phase575p1-map-0A8A1D-report.md'), report);
console.log('\nReport written to phase575p1-map-0A8A1D-report.md');

process.exit(0);
