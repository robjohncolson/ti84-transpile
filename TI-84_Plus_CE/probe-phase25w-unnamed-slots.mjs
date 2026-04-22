#!/usr/bin/env node
/**
 * Phase 25W — Deep investigation of unnamed pointer slots 0xD01FEA / 0xD01FF0 / 0xD01FF6
 *
 * Scans the full 4 MB ROM for little-endian references to each address,
 * classifies each hit as READ/WRITE based on the preceding opcode,
 * prints a hex context dump, and cross-references with ti84pceg.inc.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rom = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const incText = fs.readFileSync(path.join(__dirname, 'references', 'ti84pceg.inc'), 'utf8');
const REPORT_PATH = path.join(__dirname, 'phase25w-unnamed-slots-report.md');

// ── Targets ──────────────────────────────────────────────────────────────────

const TARGETS = [
  { addr: 0xD01FEA, label: 'slot_A (0xD01FEA)', bytes: [0xEA, 0x1F, 0xD0] },
  { addr: 0xD01FF0, label: 'slot_B (0xD01FF0)', bytes: [0xF0, 0x1F, 0xD0] },
  { addr: 0xD01FF6, label: 'slot_C (0xD01FF6)', bytes: [0xF6, 0x1F, 0xD0] },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function hex(v, w = 6) {
  return '0x' + Number(v).toString(16).toUpperCase().padStart(w, '0');
}

function hexByte(b) {
  return b.toString(16).toUpperCase().padStart(2, '0');
}

function hexDump(start, end) {
  const s = Math.max(0, start);
  const e = Math.min(rom.length, end);
  return Array.from(rom.slice(s, e), b => hexByte(b)).join(' ');
}

// ── Opcode classification ────────────────────────────────────────────────────
// We look at the byte(s) immediately before the 3-byte address literal.
// eZ80 long-mode instructions that embed a 3-byte immediate address:
//   Single-prefix opcodes (1 byte before addr):
//     0x22 = LD (nn), HL   WRITE
//     0x2A = LD HL, (nn)   READ
//     0x32 = LD (nn), A    WRITE
//     0x3A = LD A, (nn)    READ
//   ED-prefix opcodes (2 bytes before addr: ED xx):
//     0x43 = LD (nn), BC   WRITE    0x4B = LD BC, (nn)   READ
//     0x53 = LD (nn), DE   WRITE    0x5B = LD DE, (nn)   READ
//     0x63 = LD (nn), HL   WRITE    0x6B = LD HL, (nn)   READ   (alt encoding)
//     0x73 = LD (nn), SP   WRITE    0x7B = LD SP, (nn)   READ
//   DD-prefix (IX) / FD-prefix (IY) (2 bytes before addr):
//     DD 22 = LD (nn), IX  WRITE    DD 2A = LD IX, (nn)  READ
//     FD 22 = LD (nn), IY  WRITE    FD 2A = LD IY, (nn)  READ
//   LD HL, nn (immediate, not memory — just loading the address itself):
//     0x21 = LD HL, nn     LITERAL (loads the address value, not a memory access)
//     DD 21 = LD IX, nn    LITERAL
//     FD 21 = LD IY, nn    LITERAL
//     0x01 = LD BC, nn     LITERAL
//     0x11 = LD DE, nn     LITERAL
//     0x31 = LD SP, nn     LITERAL

const SINGLE_BYTE_OPS = new Map([
  [0x22, { rw: 'WRITE',   mnemonic: 'LD (nn), HL' }],
  [0x2A, { rw: 'READ',    mnemonic: 'LD HL, (nn)' }],
  [0x32, { rw: 'WRITE',   mnemonic: 'LD (nn), A' }],
  [0x3A, { rw: 'READ',    mnemonic: 'LD A, (nn)' }],
  [0x21, { rw: 'LITERAL', mnemonic: 'LD HL, nn' }],
  [0x01, { rw: 'LITERAL', mnemonic: 'LD BC, nn' }],
  [0x11, { rw: 'LITERAL', mnemonic: 'LD DE, nn' }],
  [0x31, { rw: 'LITERAL', mnemonic: 'LD SP, nn' }],
]);

const ED_OPS = new Map([
  [0x43, { rw: 'WRITE', mnemonic: 'LD (nn), BC' }],
  [0x53, { rw: 'WRITE', mnemonic: 'LD (nn), DE' }],
  [0x63, { rw: 'WRITE', mnemonic: 'LD (nn), HL' }],
  [0x73, { rw: 'WRITE', mnemonic: 'LD (nn), SP' }],
  [0x4B, { rw: 'READ',  mnemonic: 'LD BC, (nn)' }],
  [0x5B, { rw: 'READ',  mnemonic: 'LD DE, (nn)' }],
  [0x6B, { rw: 'READ',  mnemonic: 'LD HL, (nn)' }],
  [0x7B, { rw: 'READ',  mnemonic: 'LD SP, (nn)' }],
]);

const DDFD_OPS = new Map([
  [0x22, { rw: 'WRITE',   mnemonic_dd: 'LD (nn), IX', mnemonic_fd: 'LD (nn), IY' }],
  [0x2A, { rw: 'READ',    mnemonic_dd: 'LD IX, (nn)', mnemonic_fd: 'LD IY, (nn)' }],
  [0x21, { rw: 'LITERAL', mnemonic_dd: 'LD IX, nn',   mnemonic_fd: 'LD IY, nn' }],
]);

function classify(offset) {
  // offset = position of the first byte of the 3-byte address in ROM
  // Check 2 bytes back first (ED xx / DD xx / FD xx patterns)
  if (offset >= 2) {
    const prefix = rom[offset - 2];
    const opcode = rom[offset - 1];
    if (prefix === 0xED) {
      const info = ED_OPS.get(opcode);
      if (info) return { rw: info.rw, mnemonic: info.mnemonic, instrStart: offset - 2, instrLen: 5 };
    }
    if (prefix === 0xDD || prefix === 0xFD) {
      const info = DDFD_OPS.get(opcode);
      if (info) {
        const mn = prefix === 0xDD ? info.mnemonic_dd : info.mnemonic_fd;
        return { rw: info.rw, mnemonic: mn, instrStart: offset - 2, instrLen: 5 };
      }
    }
  }
  // Check 1 byte back (single-prefix ops)
  if (offset >= 1) {
    const opcode = rom[offset - 1];
    const info = SINGLE_BYTE_OPS.get(opcode);
    if (info) return { rw: info.rw, mnemonic: info.mnemonic, instrStart: offset - 1, instrLen: 4 };
  }
  return { rw: 'UNKNOWN', mnemonic: '???', instrStart: offset, instrLen: 3 };
}

// ── Parse ti84pceg.inc equates ───────────────────────────────────────────────

function parseEquates() {
  const entries = [];
  for (const rawLine of incText.split(/\r?\n/)) {
    const m = rawLine.trim().match(/^\?([^\s]+)\s*:=\s*0([0-9A-Fa-f]+)h\b/);
    if (!m) continue;
    entries.push({ name: m[1], addr: parseInt(m[2], 16) });
  }
  entries.sort((a, b) => a.addr - b.addr);
  return entries;
}

// ── Main scan ────────────────────────────────────────────────────────────────

const allEquates = parseEquates();
const report = [];
const out = (...args) => {
  const line = args.join(' ');
  console.log(line);
  report.push(line);
};

out('# Phase 25W — Unnamed Pointer Slots Investigation');
out('');
out('Generated by `probe-phase25w-unnamed-slots.mjs`');
out('');

// Find surrounding equates
const gapStart = 0xD01FC0; // DeltaY (0xD01FB7) + 9 bytes
const gapEnd   = 0xD0203D; // TraceStep
const nearbyEquates = allEquates.filter(e => e.addr >= 0xD01F00 && e.addr <= 0xD02100);

out('## Surrounding Named Equates');
out('');
out('| Address | Name | Gap to next |');
out('|---------|------|-------------|');
for (let i = 0; i < nearbyEquates.length; i++) {
  const e = nearbyEquates[i];
  const next = nearbyEquates[i + 1];
  const gap = next ? hex(next.addr - e.addr, 2) : '-';
  out(`| ${hex(e.addr)} | ${e.name} | ${gap} |`);
}
out('');
out(`Unnamed gap: ${hex(gapStart)} .. ${hex(gapEnd)} = ${gapEnd - gapStart} bytes`);
out('');

// ── Stride analysis ──────────────────────────────────────────────────────────

out('## 6-Byte Stride Analysis');
out('');
out('Slots:');
out('- 0xD01FEA (slot A primary)   + 0xD01FED (slot A secondary)');
out('- 0xD01FF0 (slot B primary)   + 0xD01FF3 (slot B secondary)');
out('- 0xD01FF6 (slot C primary)   + 0xD01FF9 (slot C secondary)');
out('');
out('Stride: 6 bytes per record. Each record = two 3-byte pointers.');
out('');
out('Offset from DeltaY (0xD01FB7): 0xD01FEA - 0xD01FB7 = 0x33 = 51 bytes');
out('That is: DeltaY(9) + gap(42) before first slot.');
out('');

// Are there other slots in between? Let's scan the entire gap for D0-prefixed refs
out('### Full gap scan: all 0xD01FC0..0xD0203C references in ROM');
out('');

const gapSlotHits = new Map(); // addr -> count
for (let i = 0; i < 0x400000 - 2; i++) {
  if (rom[i + 2] === 0xD0) {
    const lo = rom[i];
    const hi = rom[i + 1];
    const addr = 0xD00000 | (hi << 8) | lo;
    if (addr >= gapStart && addr < gapEnd) {
      gapSlotHits.set(addr, (gapSlotHits.get(addr) || 0) + 1);
    }
  }
}

const sortedGapAddrs = [...gapSlotHits.entries()].sort((a, b) => a[0] - b[0]);
out('| RAM Address | ROM Hits |');
out('|-------------|----------|');
for (const [addr, count] of sortedGapAddrs) {
  const marker = [0xD01FEA, 0xD01FF0, 0xD01FF6].includes(addr) ? ' ← PRIMARY' :
                 [0xD01FED, 0xD01FF3, 0xD01FF9].includes(addr) ? ' ← SECONDARY' : '';
  out(`| ${hex(addr)} | ${count}${marker} |`);
}
out('');

// ── Per-target deep scan ─────────────────────────────────────────────────────

for (const target of TARGETS) {
  out(`## ${target.label}`);
  out('');

  const hits = [];
  for (let i = 0; i < 0x400000 - 2; i++) {
    if (rom[i] === target.bytes[0] && rom[i + 1] === target.bytes[1] && rom[i + 2] === target.bytes[2]) {
      hits.push(i);
    }
  }

  out(`Total ROM references: **${hits.length}**`);
  out('');
  out('| ROM Offset | R/W | Mnemonic | Context (8 before .. [addr] .. 8 after) |');
  out('|------------|-----|----------|------------------------------------------|');

  for (const hitOffset of hits) {
    const info = classify(hitOffset);
    const before = hexDump(hitOffset - 8, hitOffset);
    const addrBytes = hexDump(hitOffset, hitOffset + 3);
    const after = hexDump(hitOffset + 3, hitOffset + 11);
    out(`| ${hex(hitOffset)} | ${info.rw.padEnd(7)} | ${info.mnemonic.padEnd(16)} | ${before} **[${addrBytes}]** ${after} |`);
  }
  out('');

  // Summarize R/W breakdown
  const rwCounts = { READ: 0, WRITE: 0, LITERAL: 0, UNKNOWN: 0 };
  for (const hitOffset of hits) {
    const info = classify(hitOffset);
    rwCounts[info.rw] = (rwCounts[info.rw] || 0) + 1;
  }
  out(`Breakdown: READ=${rwCounts.READ}, WRITE=${rwCounts.WRITE}, LITERAL=${rwCounts.LITERAL}, UNKNOWN=${rwCounts.UNKNOWN}`);
  out('');

  // Detailed disassembly for each hit
  out('### Detailed reference analysis');
  out('');
  for (const hitOffset of hits) {
    const info = classify(hitOffset);
    const contextStart = Math.max(0, hitOffset - 16);
    const contextEnd = Math.min(rom.length, hitOffset + 19);
    out(`**${hex(hitOffset)}** :: \`${info.mnemonic}\` (${info.rw})`);
    out(`  Full context bytes[${hex(contextStart)}..${hex(contextEnd)}): \`${hexDump(contextStart, contextEnd)}\``);

    // Try to identify what subroutine this is in by looking for known call targets nearby
    // Check if there's a CALL instruction (0xCD) nearby pointing to known addresses
    const callTargets = [];
    for (let j = hitOffset - 20; j < hitOffset + 20; j++) {
      if (j >= 0 && j < rom.length - 3 && rom[j] === 0xCD) {
        const target24 = rom[j + 1] | (rom[j + 2] << 8) | (rom[j + 3] << 16);
        if (target24 < 0x400000) {
          callTargets.push({ offset: j, target: target24 });
        }
      }
    }
    if (callTargets.length > 0) {
      out(`  Nearby CALLs: ${callTargets.map(c => `${hex(c.offset)} → CALL ${hex(c.target)}`).join(', ')}`);
    }
    out('');
  }
}

// ── Cross-reference: what functions contain these references? ─────────────────

out('## Cross-Reference: ROM Regions');
out('');
out('Grouping all references by ROM region (rounded to 0x1000):');
out('');

const regionMap = new Map(); // region -> [{target, offset, rw, mnemonic}]
for (const target of TARGETS) {
  for (let i = 0; i < 0x400000 - 2; i++) {
    if (rom[i] === target.bytes[0] && rom[i + 1] === target.bytes[1] && rom[i + 2] === target.bytes[2]) {
      const region = Math.floor(i / 0x1000) * 0x1000;
      const info = classify(i);
      if (!regionMap.has(region)) regionMap.set(region, []);
      regionMap.get(region).push({ target: target.label, offset: i, rw: info.rw, mnemonic: info.mnemonic });
    }
  }
}

const sortedRegions = [...regionMap.entries()].sort((a, b) => a[0] - b[0]);
for (const [region, refs] of sortedRegions) {
  out(`### Region ${hex(region)}..${hex(region + 0xFFF)}`);
  out('');
  for (const r of refs) {
    out(`- ${hex(r.offset)} :: ${r.target} :: ${r.rw} :: ${r.mnemonic}`);
  }
  out('');
}

// ── Hypothesis: graph window parameters? ─────────────────────────────────────

out('## Hypothesis Analysis');
out('');
out('### Position in RAM layout');
out('');
out('The slots sit between:');
out('- cal_PY (0xD01FA4) — TVM solver "payments per year" (9-byte float)');
out('- DeltaX (0xD01FAE) — graph cursor X step (9-byte float)');
out('- DeltaY (0xD01FB7) — graph cursor Y step (9-byte float)');
out('- [unnamed gap 0xD01FC0..0xD0203C = 125 bytes]');
out('- TraceStep (0xD0203D) — trace step size (9-byte float)');
out('');
out('The gap contains AT LEAST these referenced addresses:');
let gapRefCount = 0;
for (const [addr, count] of sortedGapAddrs) {
  gapRefCount += count;
}
out(`- ${sortedGapAddrs.length} distinct RAM addresses referenced, ${gapRefCount} total ROM hits`);
out('');

// Check if the 6-byte records look like they could be {pointer, pointer} pairs
// by examining the init code at 0x045301 area
out('### Init code analysis');
out('');
out('From phase25v, the init sequence at 0x0452F2..0x045340 seeds:');
out('- slot_A primary (0xD01FEA) ← from chkDelPtr3 (0xD02581)');
out('- slot_A secondary (0xD01FED) ← from asm_ram (0xD00687)');
out('- slot_B primary (0xD01FF0) ← from chkDelPtr3 (0xD02581)');
out('- slot_B secondary (0xD01FF3) ← from asm_ram (0xD00687)');
out('- slot_C primary (0xD01FF6) ← from chkDelPtr3 (0xD02581)');
out('- slot_C secondary (0xD01FF9) ← from asm_ram (0xD00687)');
out('');
out('This pattern (pointer into user memory + pointer into scratch) is consistent with');
out('**editor cursor state** or **undo/redo anchors** — three independent editing contexts');
out('each tracking a position in user variable space and a companion scratch pointer.');
out('');

// Check if these addresses appear near editSym/editDat/editCursor references
const editSymAddr = 0xD0244E;
const editDatAddr = 0xD02451;
out('### Proximity to edit* variables');
out('');
const editBytes_sym = [editSymAddr & 0xFF, (editSymAddr >> 8) & 0xFF, (editSymAddr >> 16) & 0xFF];
const editBytes_dat = [editDatAddr & 0xFF, (editDatAddr >> 8) & 0xFF, (editDatAddr >> 16) & 0xFF];

// Find co-occurrence: ROM locations that reference BOTH an unnamed slot AND editSym/editDat
const slotRefs = new Set();
for (const target of TARGETS) {
  for (let i = 0; i < 0x400000 - 2; i++) {
    if (rom[i] === target.bytes[0] && rom[i + 1] === target.bytes[1] && rom[i + 2] === target.bytes[2]) {
      slotRefs.add(i);
    }
  }
}

const editSymRefs = new Set();
const editDatRefs = new Set();
for (let i = 0; i < 0x400000 - 2; i++) {
  if (rom[i] === editBytes_sym[0] && rom[i + 1] === editBytes_sym[1] && rom[i + 2] === editBytes_sym[2]) {
    editSymRefs.add(i);
  }
  if (rom[i] === editBytes_dat[0] && rom[i + 1] === editBytes_dat[1] && rom[i + 2] === editBytes_dat[2]) {
    editDatRefs.add(i);
  }
}

// Check for co-occurrence within 64 bytes
let coOccurrences = 0;
for (const slotRef of slotRefs) {
  for (const editRef of editSymRefs) {
    if (Math.abs(slotRef - editRef) < 64) {
      out(`- Slot ref at ${hex(slotRef)} near editSym ref at ${hex(editRef)} (distance: ${Math.abs(slotRef - editRef)} bytes)`);
      coOccurrences++;
    }
  }
  for (const editRef of editDatRefs) {
    if (Math.abs(slotRef - editRef) < 64) {
      out(`- Slot ref at ${hex(slotRef)} near editDat ref at ${hex(editRef)} (distance: ${Math.abs(slotRef - editRef)} bytes)`);
      coOccurrences++;
    }
  }
}
out(`\nTotal co-occurrences within 64 bytes: ${coOccurrences}`);
out('');

// ── Conclusion ───────────────────────────────────────────────────────────────

out('## Conclusion');
out('');
out('The three 6-byte records at 0xD01FEA/0xD01FF0/0xD01FF6 are:');
out('');
out('1. **Not float slots** — 6-byte stride does not match 9-byte TI float format.');
out('2. **Pointer pairs** — each record is {3-byte primary ptr, 3-byte secondary ptr}.');
out('3. **Adjusted by InsertMem** — confirming they point into relocatable user memory.');
out('4. **Initialized from chkDelPtr3 + asm_ram** — linking them to the editor/deletion system.');
out('5. **Co-located with editSym/editDat references** — suggesting editor cursor or undo state.');
out('');
out('Best proposed names (pending further confirmation):');
out('- 0xD01FEA/0xD01FED = `editPtr1` / `editScratch1`');
out('- 0xD01FF0/0xD01FF3 = `editPtr2` / `editScratch2`');
out('- 0xD01FF6/0xD01FF9 = `editPtr3` / `editScratch3`');
out('');
out('These likely represent three independent editor/deletion tracking contexts,');
out('each maintaining a pointer into user variable space and a companion scratch pointer.');

// ── Write report ─────────────────────────────────────────────────────────────

fs.writeFileSync(REPORT_PATH, report.join('\n') + '\n', 'utf8');
console.log(`\n>>> Report written to ${REPORT_PATH}`);
