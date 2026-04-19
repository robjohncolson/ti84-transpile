#!/usr/bin/env node
// Phase 202c: Map routines in the 0x04xxxx range visited during graph trace.
// Reads raw ROM binary, decodes leading eZ80 instructions, classifies each routine.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romPath = path.join(__dirname, 'ROM.rom');
const reportPath = path.join(__dirname, 'phase202c-routine-map-report.md');

// ---------------------------------------------------------------------------
// PCs to analyze
// ---------------------------------------------------------------------------
const PCS = [
  0x040d11, 0x040d1f, 0x040d29, 0x040d3d, 0x040fad, 0x040fb1, 0x040fc1,
  0x040fc6, 0x040fcd, 0x040ff9, 0x0419f1, 0x0419f9, 0x041a09, 0x041a1d,
  0x041a28, 0x041a48, 0x041a4d, 0x041a5d, 0x041a62, 0x041a72, 0x041a77,
  0x041a8d, 0x041a8f, 0x041ab1, 0x041ab6, 0x041ac6, 0x041acb, 0x041ad4,
  0x041ade, 0x0457b2, 0x04586b, 0x048964, 0x048968, 0x048ac4, 0x048acc,
  0x048ae0, 0x048ae5, 0x048ae9, 0x048b07, 0x048b11, 0x048b21, 0x048b26,
  0x048b3c, 0x048b5b, 0x048b69, 0x048b81, 0x048b91, 0x048ba1, 0x048bb1,
  0x048bc1, 0x048bd1, 0x048bd7, 0x048beb, 0x048bfb, 0x048c0a, 0x048c20,
  0x048c2c, 0x048c44, 0x048c4e, 0x048c5d, 0x048c6b, 0x048c75, 0x048c7f,
  0x048c89, 0x048c93, 0x048c9d, 0x048ca7, 0x048cb1, 0x048cbb, 0x048cc5,
  0x048ccf, 0x048cd9, 0x048ce3, 0x048ced, 0x048cf2, 0x048cf8, 0x048d05,
  0x048d15, 0x048d1a, 0x048d2a, 0x048d2f, 0x048d3f, 0x048d44, 0x048d54,
  0x048d59, 0x048d69, 0x048d6e, 0x048d77, 0x048d8c, 0x048d91, 0x048da1,
  0x048da6, 0x048db6, 0x048dbb, 0x048dc9, 0x048dce, 0x048dd4, 0x048de4,
  0x048de9, 0x048ded, 0x048dfc, 0x04985c, 0x049a23, 0x049a2b, 0x049a3a,
  0x049aa7, 0x049ac9, 0x049cc2, 0x049cca, 0x049cd2, 0x049d11, 0x049d19,
  0x049d23, 0x049d2f, 0x049d77, 0x049df9, 0x049dfe, 0x049ffa, 0x04a00a,
  0x04a00f, 0x04a01f, 0x04a024, 0x04b664, 0x04b67f, 0x04b684, 0x04c973,
  0x04ca7b, 0x04e07b, 0x04e07f, 0x04e091, 0x04e0a1, 0x04e0b1, 0x04e0cc,
  0x04e0d1, 0x04e0d6
];

// ---------------------------------------------------------------------------
// Address range helpers
// ---------------------------------------------------------------------------
function isVRAM(addr)       { return addr >= 0xD40000 && addr <= 0xD65800; }
function isRAM(addr)        { return addr >= 0xD00000 && addr <= 0xD1FFFF; }
function isROM04(addr)      { return addr >= 0x040000 && addr <= 0x04FFFF; }
function isGraphRAM(addr)   { return (addr >= 0xD02000 && addr <= 0xD02FFF) || (addr >= 0xD00800 && addr <= 0xD008FF); }
function isFontTable(addr)  { return addr === 0x0040EE; }
function isFgColor(addr)    { return addr === 0xD02688; }

// Read a 3-byte little-endian address from buffer at offset
function read24LE(buf, off) {
  return buf[off] | (buf[off + 1] << 8) | (buf[off + 2] << 16);
}

// ---------------------------------------------------------------------------
// Decode leading instructions (up to 12 bytes)
// ---------------------------------------------------------------------------
function decodeLeading(buf, pc) {
  const off = pc; // ROM file offset == address for first 4MB
  if (off + 12 > buf.length) return { instructions: [], operandAddrs: [] };

  const bytes = buf.slice(off, off + 12);
  const instructions = [];
  const operandAddrs = [];
  let pos = 0;

  while (pos < 12) {
    const b0 = bytes[pos];

    // ret
    if (b0 === 0xC9) {
      instructions.push({ pos, len: 1, text: 'ret' });
      pos += 1;
      continue;
    }

    // jp nn (3-byte addr)
    if (b0 === 0xC3 && pos + 4 <= 12) {
      const addr = read24LE(bytes, pos + 1);
      instructions.push({ pos, len: 4, text: `jp 0x${addr.toString(16).padStart(6, '0')}` });
      operandAddrs.push(addr);
      pos += 4;
      continue;
    }

    // call nn (3-byte addr)
    if (b0 === 0xCD && pos + 4 <= 12) {
      const addr = read24LE(bytes, pos + 1);
      instructions.push({ pos, len: 4, text: `call 0x${addr.toString(16).padStart(6, '0')}` });
      operandAddrs.push(addr);
      pos += 4;
      continue;
    }

    // ld (nn), sp  -> ED 73 nn nn nn
    if (b0 === 0xED && pos + 1 < 12 && bytes[pos + 1] === 0x73 && pos + 5 <= 12) {
      const addr = read24LE(bytes, pos + 2);
      instructions.push({ pos, len: 5, text: `ld (0x${addr.toString(16).padStart(6, '0')}), sp` });
      operandAddrs.push(addr);
      pos += 5;
      continue;
    }

    // ld hl, nn
    if (b0 === 0x21 && pos + 4 <= 12) {
      const addr = read24LE(bytes, pos + 1);
      instructions.push({ pos, len: 4, text: `ld hl, 0x${addr.toString(16).padStart(6, '0')}` });
      operandAddrs.push(addr);
      pos += 4;
      continue;
    }

    // ld ix, nn  -> DD 21 nn nn nn
    if (b0 === 0xDD && pos + 1 < 12 && bytes[pos + 1] === 0x21 && pos + 5 <= 12) {
      const addr = read24LE(bytes, pos + 2);
      instructions.push({ pos, len: 5, text: `ld ix, 0x${addr.toString(16).padStart(6, '0')}` });
      operandAddrs.push(addr);
      pos += 5;
      continue;
    }

    // ld iy, nn  -> FD 21 nn nn nn
    if (b0 === 0xFD && pos + 1 < 12 && bytes[pos + 1] === 0x21 && pos + 5 <= 12) {
      const addr = read24LE(bytes, pos + 2);
      instructions.push({ pos, len: 5, text: `ld iy, 0x${addr.toString(16).padStart(6, '0')}` });
      operandAddrs.push(addr);
      pos += 5;
      continue;
    }

    // Conditional jp cc, nn  (0xC2, 0xCA, 0xD2, 0xDA, 0xE2, 0xEA, 0xF2, 0xFA)
    if ((b0 & 0xC7) === 0xC2 && pos + 4 <= 12) {
      const cc = ['nz', 'z', 'nc', 'c', 'po', 'pe', 'p', 'm'][(b0 >> 3) & 7];
      const addr = read24LE(bytes, pos + 1);
      instructions.push({ pos, len: 4, text: `jp ${cc}, 0x${addr.toString(16).padStart(6, '0')}` });
      operandAddrs.push(addr);
      pos += 4;
      continue;
    }

    // Conditional call cc, nn  (0xC4, 0xCC, 0xD4, 0xDC, 0xE4, 0xEC, 0xF4, 0xFC)
    if ((b0 & 0xC7) === 0xC4 && pos + 4 <= 12) {
      const cc = ['nz', 'z', 'nc', 'c', 'po', 'pe', 'p', 'm'][(b0 >> 3) & 7];
      const addr = read24LE(bytes, pos + 1);
      instructions.push({ pos, len: 4, text: `call ${cc}, 0x${addr.toString(16).padStart(6, '0')}` });
      operandAddrs.push(addr);
      pos += 4;
      continue;
    }

    // ld a, (nn) -> 0x3A nn nn nn
    if (b0 === 0x3A && pos + 4 <= 12) {
      const addr = read24LE(bytes, pos + 1);
      instructions.push({ pos, len: 4, text: `ld a, (0x${addr.toString(16).padStart(6, '0')})` });
      operandAddrs.push(addr);
      pos += 4;
      continue;
    }

    // ld (nn), a -> 0x32 nn nn nn
    if (b0 === 0x32 && pos + 4 <= 12) {
      const addr = read24LE(bytes, pos + 1);
      instructions.push({ pos, len: 4, text: `ld (0x${addr.toString(16).padStart(6, '0')}), a` });
      operandAddrs.push(addr);
      pos += 4;
      continue;
    }

    // ld bc, nn -> 0x01
    if (b0 === 0x01 && pos + 4 <= 12) {
      const val = read24LE(bytes, pos + 1);
      instructions.push({ pos, len: 4, text: `ld bc, 0x${val.toString(16).padStart(6, '0')}` });
      if (val >= 0x040000) operandAddrs.push(val);
      pos += 4;
      continue;
    }

    // ld de, nn -> 0x11
    if (b0 === 0x11 && pos + 4 <= 12) {
      const val = read24LE(bytes, pos + 1);
      instructions.push({ pos, len: 4, text: `ld de, 0x${val.toString(16).padStart(6, '0')}` });
      if (val >= 0x040000) operandAddrs.push(val);
      pos += 4;
      continue;
    }

    // ld sp, nn -> 0x31
    if (b0 === 0x31 && pos + 4 <= 12) {
      const val = read24LE(bytes, pos + 1);
      instructions.push({ pos, len: 4, text: `ld sp, 0x${val.toString(16).padStart(6, '0')}` });
      if (val >= 0x040000) operandAddrs.push(val);
      pos += 4;
      continue;
    }

    // push/pop single byte
    if ((b0 & 0xCF) === 0xC1 || (b0 & 0xCF) === 0xC5) {
      const reg = ['bc', 'de', 'hl', 'af'][(b0 >> 4) & 3];
      const op = (b0 & 0x04) ? 'push' : 'pop';
      instructions.push({ pos, len: 1, text: `${op} ${reg}` });
      pos += 1;
      continue;
    }

    // Unknown — just record the byte and advance
    instructions.push({ pos, len: 1, text: `db 0x${b0.toString(16).padStart(2, '0')}` });
    pos += 1;
  }

  return { instructions, operandAddrs };
}

// ---------------------------------------------------------------------------
// Brute-force scan all 3-byte LE windows in the 12 bytes for addresses
// ---------------------------------------------------------------------------
function scanAllAddresses(buf, pc) {
  const off = pc;
  if (off + 12 > buf.length) return [];
  const addrs = [];
  for (let i = 0; i < 10; i++) {
    const val = read24LE(buf, off + i);
    if (isVRAM(val) || isGraphRAM(val) || isFontTable(val) || isFgColor(val) ||
        isROM04(val) || isRAM(val)) {
      addrs.push({ offset: i, addr: val });
    }
  }
  return addrs;
}

// ---------------------------------------------------------------------------
// Classify a routine
// ---------------------------------------------------------------------------
function classify(operandAddrs, instructions, allAddrs) {
  const firstInstr = instructions[0]?.text || '';
  const allAddrVals = allAddrs.map(a => a.addr);
  const combined = [...operandAddrs, ...allAddrVals];

  // Check text-renderer first (specific)
  for (const addr of combined) {
    if (isFontTable(addr) || isFgColor(addr)) return 'text-renderer';
  }

  // Check dispatch: first instruction is jp/call to 0x04xxxx
  if (/^(jp|call) 0x04/.test(firstInstr)) {
    const match = firstInstr.match(/0x([0-9a-f]{6})/);
    if (match && isROM04(parseInt(match[1], 16))) return 'dispatch';
  }

  // Also check if any call/jp in first few instructions targets 0x04xxxx
  for (const instr of instructions.slice(0, 4)) {
    if (/^(call|jp)\s/.test(instr.text)) {
      const m = instr.text.match(/0x([0-9a-f]{6})/);
      if (m && isROM04(parseInt(m[1], 16))) return 'dispatch';
    }
  }

  // Check renderer (VRAM reference)
  for (const addr of combined) {
    if (isVRAM(addr)) return 'renderer';
  }

  // Check graph-setup (graph RAM reference: D02xxx, D008xx, or D177xx which is graph state)
  for (const addr of combined) {
    if (isGraphRAM(addr)) return 'graph-setup';
  }

  // Extended graph-state: D177xx, D176xx, D178xx are graph variable storage
  for (const addr of combined) {
    if (addr >= 0xD17600 && addr <= 0xD178FF) return 'graph-state';
  }

  // D140xx appears to be graph display flags
  for (const addr of combined) {
    if (addr >= 0xD14000 && addr <= 0xD140FF) return 'graph-flags';
  }

  // Port I/O patterns: many routines do port reads (ed 78 = in a,(c))
  // with bc = 0x3010, 0x3081, etc — these are LCD controller ports
  for (const instr of instructions) {
    if (instr.text.startsWith('ld bc, 0x0030') || instr.text.startsWith('ld bc, 0x0031')) {
      return 'lcd-port-io';
    }
  }

  return 'unknown';
}

// ---------------------------------------------------------------------------
// Dispatch table decode (0x005D00 - 0x005F88)
// ---------------------------------------------------------------------------
function decodeDispatchTable(rom) {
  const start = 0x005D00;
  const end = 0x005F88;
  const entries = [];

  for (let off = start; off < end; off += 6) {
    const opcode = rom[off];
    if (opcode === 0xC3) {
      // jp nn
      const target = read24LE(rom, off + 1);
      const trailing = rom.slice(off + 4, off + 6);
      entries.push({
        addr: off,
        opcode: 'jp',
        target,
        trailing: Array.from(trailing).map(b => b.toString(16).padStart(2, '0')).join(' ')
      });
    } else {
      const raw = Array.from(rom.slice(off, off + 6)).map(b => b.toString(16).padStart(2, '0')).join(' ');
      entries.push({ addr: off, opcode: 'raw', raw });
    }
  }

  return entries;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function main() {
  console.log('Reading ROM...');
  const rom = fs.readFileSync(romPath);
  console.log(`ROM size: ${rom.length} bytes`);

  // Analyze each PC
  const results = [];
  for (const pc of PCS) {
    const { instructions, operandAddrs } = decodeLeading(rom, pc);
    const allAddrs = scanAllAddresses(rom, pc);
    const classification = classify(operandAddrs, instructions, allAddrs);
    const hexBytes = Array.from(rom.slice(pc, pc + 12)).map(b => b.toString(16).padStart(2, '0')).join(' ');
    const decoded = instructions.map(i => i.text).join('; ');
    results.push({ pc, hexBytes, decoded, classification, operandAddrs, allAddrs });
  }

  // Dispatch table
  const dispatchEntries = decodeDispatchTable(rom);

  // Summary counts
  const counts = {};
  for (const r of results) {
    counts[r.classification] = (counts[r.classification] || 0) + 1;
  }

  // Build report
  const lines = [];
  lines.push('# Phase 202c: Routine Map for 0x04xxxx Graph-Trace PCs');
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push('');

  // Summary
  lines.push('## Summary');
  lines.push('');
  lines.push(`Total routines analyzed: ${results.length}`);
  lines.push('');
  lines.push('| Classification | Count |');
  lines.push('|----------------|-------|');
  for (const [cls, cnt] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    lines.push(`| ${cls} | ${cnt} |`);
  }
  lines.push('');

  // Main table
  lines.push('## Routine Analysis');
  lines.push('');
  lines.push('| PC | Hex Bytes | Decoded | Classification |');
  lines.push('|-----|-----------|---------|----------------|');
  for (const r of results) {
    const pcStr = `0x${r.pc.toString(16).padStart(6, '0')}`;
    lines.push(`| ${pcStr} | \`${r.hexBytes}\` | ${r.decoded} | **${r.classification}** |`);
  }
  lines.push('');

  // Operand address details for interesting ones
  lines.push('## Notable Operand Addresses');
  lines.push('');
  for (const r of results) {
    if (r.operandAddrs.length === 0) continue;
    if (r.classification === 'unknown') continue;
    const pcStr = `0x${r.pc.toString(16).padStart(6, '0')}`;
    const addrs = r.operandAddrs.map(a => {
      const hex = `0x${a.toString(16).padStart(6, '0')}`;
      let label = '';
      if (isVRAM(a)) label = ' (VRAM)';
      else if (isGraphRAM(a)) label = ' (graph RAM)';
      else if (isFontTable(a)) label = ' (font table)';
      else if (isFgColor(a)) label = ' (fg color)';
      else if (isROM04(a)) label = ' (ROM 04)';
      else if (isRAM(a)) label = ' (RAM)';
      return hex + label;
    }).join(', ');
    lines.push(`- **${pcStr}** [${r.classification}]: ${addrs}`);
  }
  lines.push('');

  // Dispatch table
  lines.push('## Dispatch Table (0x005D00 - 0x005F88)');
  lines.push('');
  lines.push(`Entries: ${dispatchEntries.length} (every 6 bytes)`);
  lines.push('');
  lines.push('| Address | Opcode | Target/Data |');
  lines.push('|---------|--------|-------------|');
  for (const e of dispatchEntries) {
    const addrStr = `0x${e.addr.toString(16).padStart(6, '0')}`;
    if (e.opcode === 'jp') {
      const targetStr = `0x${e.target.toString(16).padStart(6, '0')}`;
      let label = '';
      if (isROM04(e.target)) label = ' (ROM 04)';
      lines.push(`| ${addrStr} | jp | ${targetStr}${label} [+${e.trailing}] |`);
    } else {
      lines.push(`| ${addrStr} | raw | ${e.raw} |`);
    }
  }
  lines.push('');

  // Graph-specific vs generic breakdown
  lines.push('## Graph-Specific vs Generic');
  lines.push('');
  const graphSpecific = results.filter(r => ['renderer', 'graph-setup', 'text-renderer', 'graph-state', 'graph-flags'].includes(r.classification));
  const dispatchers = results.filter(r => r.classification === 'dispatch');
  const lcdIO = results.filter(r => r.classification === 'lcd-port-io');
  const unknowns = results.filter(r => r.classification === 'unknown');
  lines.push(`- **Graph-specific** (renderer + graph-setup + graph-state + graph-flags + text-renderer): ${graphSpecific.length}`);
  lines.push(`- **Dispatch/trampoline**: ${dispatchers.length}`);
  lines.push(`- **LCD port I/O**: ${lcdIO.length}`);
  lines.push(`- **Unknown/generic**: ${unknowns.length}`);
  lines.push('');

  if (graphSpecific.length > 0) {
    lines.push('### Graph-specific routines:');
    for (const r of graphSpecific) {
      const pcStr = `0x${r.pc.toString(16).padStart(6, '0')}`;
      lines.push(`- ${pcStr} [${r.classification}]: ${r.decoded}`);
    }
    lines.push('');
  }

  if (dispatchers.length > 0) {
    lines.push('### Dispatch/trampoline routines:');
    for (const r of dispatchers) {
      const pcStr = `0x${r.pc.toString(16).padStart(6, '0')}`;
      lines.push(`- ${pcStr}: ${r.decoded}`);
    }
    lines.push('');
  }

  if (lcdIO.length > 0) {
    lines.push('### LCD port I/O routines:');
    for (const r of lcdIO) {
      const pcStr = `0x${r.pc.toString(16).padStart(6, '0')}`;
      lines.push(`- ${pcStr}: ${r.decoded}`);
    }
    lines.push('');
  }

  const report = lines.join('\n');
  fs.writeFileSync(reportPath, report);
  console.log(`Report written to ${reportPath}`);
  console.log('');
  console.log('=== SUMMARY ===');
  console.log(`Total: ${results.length} routines`);
  for (const [cls, cnt] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${cls}: ${cnt}`);
  }
  console.log(`Graph-specific: ${graphSpecific.length}`);
  console.log(`Dispatch/trampoline: ${dispatchers.length}`);
  console.log(`Unknown/generic: ${unknowns.length}`);
}

main();
