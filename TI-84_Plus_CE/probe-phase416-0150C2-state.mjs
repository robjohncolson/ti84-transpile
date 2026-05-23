#!/usr/bin/env node
/**
 * Phase 416 — Map D176BD/D176F2/D176FB/D176FC/D1772D
 * (0x0150C2 completion dispatcher state variables)
 *
 * Pure static ROM scan. Searches 0x000000-0x0BFFFF for all references
 * to each RAM address, classifies read/write/address-load, disassembles
 * context around write sites.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');

const rom = fs.readFileSync(ROM_PATH);
const SCAN_END = Math.min(rom.length, 0x0C0000);

// ── Helpers ──────────────────────────────────────────────────────────

function hex(n, w = 6) {
  return '0x' + n.toString(16).padStart(w, '0').toUpperCase();
}

function hexByte(b) {
  return b.toString(16).padStart(2, '0').toUpperCase();
}

function hexDump(start, len) {
  const parts = [];
  for (let i = 0; i < len; i++) {
    const a = start + i;
    parts.push(a >= 0 && a < rom.length ? hexByte(rom[a]) : '??');
  }
  return parts.join(' ');
}

// ── Target addresses ────────────────────────────────────────────────

const targets = [
  { name: 'D176BD', addr: 0xD176BD, bytes: [0xBD, 0x76, 0xD1], desc: 'callback pointer (3-byte)' },
  { name: 'D176F2', addr: 0xD176F2, bytes: [0xF2, 0x76, 0xD1], desc: 'state value' },
  { name: 'D176FB', addr: 0xD176FB, bytes: [0xFB, 0x76, 0xD1], desc: 'cleared flag' },
  { name: 'D176FC', addr: 0xD176FC, bytes: [0xFC, 0x76, 0xD1], desc: 'gate flag' },
  { name: 'D1772D', addr: 0xD1772D, bytes: [0x2D, 0x77, 0xD1], desc: 'secondary gate' },
];

// Opcode classification: opcode byte(s) immediately before the 3-byte address
// Map from "bytes before address" to classification
const OPCODE_CLASSES = [
  // 2-byte prefixed opcodes (check these first)
  { prefix: [0xED, 0x4B], label: 'LD BC,(nn)', type: 'READ', prefixLen: 2 },
  { prefix: [0xED, 0x43], label: 'LD (nn),BC', type: 'WRITE', prefixLen: 2 },
  { prefix: [0xED, 0x5B], label: 'LD DE,(nn)', type: 'READ', prefixLen: 2 },
  { prefix: [0xED, 0x53], label: 'LD (nn),DE', type: 'WRITE', prefixLen: 2 },
  { prefix: [0xFD, 0x2A], label: 'LD IY,(nn)', type: 'READ', prefixLen: 2 },
  { prefix: [0xFD, 0x22], label: 'LD (nn),IY', type: 'WRITE', prefixLen: 2 },
  { prefix: [0xDD, 0x2A], label: 'LD IX,(nn)', type: 'READ', prefixLen: 2 },
  { prefix: [0xDD, 0x22], label: 'LD (nn),IX', type: 'WRITE', prefixLen: 2 },
  // 1-byte opcodes
  { prefix: [0x3A], label: 'LD A,(nn)', type: 'READ', prefixLen: 1 },
  { prefix: [0x32], label: 'LD (nn),A', type: 'WRITE', prefixLen: 1 },
  { prefix: [0x2A], label: 'LD HL,(nn)', type: 'READ', prefixLen: 1 },
  { prefix: [0x22], label: 'LD (nn),HL', type: 'WRITE', prefixLen: 1 },
  { prefix: [0x21], label: 'LD HL,nn', type: 'ADDR_LOAD', prefixLen: 1 },
  { prefix: [0x01], label: 'LD BC,nn', type: 'ADDR_LOAD', prefixLen: 1 },
  { prefix: [0x11], label: 'LD DE,nn', type: 'ADDR_LOAD', prefixLen: 1 },
];

function classifyHit(pos) {
  // pos is where the 3-byte address pattern starts in ROM
  // Check 2-byte prefixes first, then 1-byte
  for (const oc of OPCODE_CLASSES) {
    const start = pos - oc.prefixLen;
    if (start < 0) continue;
    let match = true;
    for (let i = 0; i < oc.prefixLen; i++) {
      if (rom[start + i] !== oc.prefix[i]) { match = false; break; }
    }
    if (match) {
      return { instrAddr: start, label: oc.label, type: oc.type };
    }
  }
  return { instrAddr: pos, label: 'UNKNOWN', type: 'UNKNOWN' };
}

// Simple eZ80 disassembler for context display
function disasmLine(addr) {
  if (addr < 0 || addr >= rom.length) return { text: '???', len: 1 };
  const b0 = rom[addr];

  // Handle some common instructions for display
  const r3 = (addr + 3 < rom.length)
    ? (rom[addr + 1] | (rom[addr + 2] << 8) | (rom[addr + 3] << 16))
    : 0;
  const r2 = (addr + 2 < rom.length)
    ? (rom[addr + 1] | (rom[addr + 2] << 8))
    : 0;

  // 2-byte prefix instructions
  if (b0 === 0xED && addr + 1 < rom.length) {
    const b1 = rom[addr + 1];
    if (b1 === 0x4B) return { text: `LD BC,(${hex(r3)})`, len: 5 };
    if (b1 === 0x43) return { text: `LD (${hex(r3)}),BC`, len: 5 };
    if (b1 === 0x5B) return { text: `LD DE,(${hex(r3)})`, len: 5 };
    if (b1 === 0x53) return { text: `LD (${hex(r3)}),DE`, len: 5 };
    return { text: `ED ${hexByte(b1)}`, len: 2 };
  }
  if ((b0 === 0xFD || b0 === 0xDD) && addr + 1 < rom.length) {
    const pfx = b0 === 0xFD ? 'IY' : 'IX';
    const b1 = rom[addr + 1];
    if (b1 === 0x2A) return { text: `LD ${pfx},(${hex(r3)})`, len: 5 };
    if (b1 === 0x22) return { text: `LD (${hex(r3)}),${pfx}`, len: 5 };
    // IY+d instructions
    if (b1 === 0x36 && addr + 3 < rom.length) {
      return { text: `LD (${pfx}+${hexByte(rom[addr+2])}),${hexByte(rom[addr+3])}`, len: 4 };
    }
    return { text: `${hexByte(b0)} ${hexByte(b1)}`, len: 2 };
  }

  // 1-byte opcode with 3-byte immediate/address
  if (b0 === 0x3A) return { text: `LD A,(${hex(r3)})`, len: 4 };
  if (b0 === 0x32) return { text: `LD (${hex(r3)}),A`, len: 4 };
  if (b0 === 0x2A) return { text: `LD HL,(${hex(r3)})`, len: 4 };
  if (b0 === 0x22) return { text: `LD (${hex(r3)}),HL`, len: 4 };
  if (b0 === 0x21) return { text: `LD HL,${hex(r3)}`, len: 4 };
  if (b0 === 0x01) return { text: `LD BC,${hex(r3)}`, len: 4 };
  if (b0 === 0x11) return { text: `LD DE,${hex(r3)}`, len: 4 };
  if (b0 === 0xCD) return { text: `CALL ${hex(r3)}`, len: 4 };
  if (b0 === 0xC3) return { text: `JP ${hex(r3)}`, len: 4 };
  if (b0 === 0xC2) return { text: `JP NZ,${hex(r3)}`, len: 4 };
  if (b0 === 0xCA) return { text: `JP Z,${hex(r3)}`, len: 4 };
  if (b0 === 0xD2) return { text: `JP NC,${hex(r3)}`, len: 4 };
  if (b0 === 0xDA) return { text: `JP C,${hex(r3)}`, len: 4 };

  // Relative jumps
  if (b0 === 0x18) return { text: `JR ${hex(addr + 2 + ((rom[addr+1] << 24) >> 24))}`, len: 2 };
  if (b0 === 0x20) return { text: `JR NZ,${hex(addr + 2 + ((rom[addr+1] << 24) >> 24))}`, len: 2 };
  if (b0 === 0x28) return { text: `JR Z,${hex(addr + 2 + ((rom[addr+1] << 24) >> 24))}`, len: 2 };
  if (b0 === 0x30) return { text: `JR NC,${hex(addr + 2 + ((rom[addr+1] << 24) >> 24))}`, len: 2 };
  if (b0 === 0x38) return { text: `JR C,${hex(addr + 2 + ((rom[addr+1] << 24) >> 24))}`, len: 2 };

  // Simple 1-byte
  if (b0 === 0xC9) return { text: 'RET', len: 1 };
  if (b0 === 0xC0) return { text: 'RET NZ', len: 1 };
  if (b0 === 0xC8) return { text: 'RET Z', len: 1 };
  if (b0 === 0xD0) return { text: 'RET NC', len: 1 };
  if (b0 === 0xD8) return { text: 'RET C', len: 1 };
  if (b0 === 0xAF) return { text: 'XOR A', len: 1 };
  if (b0 === 0xA7) return { text: 'AND A', len: 1 };
  if (b0 === 0xB7) return { text: 'OR A', len: 1 };
  if (b0 === 0x00) return { text: 'NOP', len: 1 };
  if (b0 === 0xF5) return { text: 'PUSH AF', len: 1 };
  if (b0 === 0xC5) return { text: 'PUSH BC', len: 1 };
  if (b0 === 0xD5) return { text: 'PUSH DE', len: 1 };
  if (b0 === 0xE5) return { text: 'PUSH HL', len: 1 };
  if (b0 === 0xF1) return { text: 'POP AF', len: 1 };
  if (b0 === 0xC1) return { text: 'POP BC', len: 1 };
  if (b0 === 0xD1) return { text: 'POP DE', len: 1 };
  if (b0 === 0xE1) return { text: 'POP HL', len: 1 };
  if (b0 === 0x3C) return { text: 'INC A', len: 1 };
  if (b0 === 0x3D) return { text: 'DEC A', len: 1 };
  if (b0 === 0xFE) return { text: `CP ${hexByte(rom[addr+1])}`, len: 2 };
  if (b0 === 0xE6) return { text: `AND ${hexByte(rom[addr+1])}`, len: 2 };
  if (b0 === 0xF6) return { text: `OR ${hexByte(rom[addr+1])}`, len: 2 };
  if (b0 === 0x3E) return { text: `LD A,${hexByte(rom[addr+1])}`, len: 2 };
  if (b0 === 0x06) return { text: `LD B,${hexByte(rom[addr+1])}`, len: 2 };
  if (b0 === 0x0E) return { text: `LD C,${hexByte(rom[addr+1])}`, len: 2 };
  if (b0 === 0x16) return { text: `LD D,${hexByte(rom[addr+1])}`, len: 2 };
  if (b0 === 0x1E) return { text: `LD E,${hexByte(rom[addr+1])}`, len: 2 };
  if (b0 === 0x26) return { text: `LD H,${hexByte(rom[addr+1])}`, len: 2 };
  if (b0 === 0x2E) return { text: `LD L,${hexByte(rom[addr+1])}`, len: 2 };
  if (b0 === 0x77) return { text: 'LD (HL),A', len: 1 };
  if (b0 === 0x7E) return { text: 'LD A,(HL)', len: 1 };
  if (b0 === 0x23) return { text: 'INC HL', len: 1 };
  if (b0 === 0x2B) return { text: 'DEC HL', len: 1 };
  if (b0 === 0x03) return { text: 'INC BC', len: 1 };
  if (b0 === 0x0B) return { text: 'DEC BC', len: 1 };
  if (b0 === 0x13) return { text: 'INC DE', len: 1 };
  if (b0 === 0x1B) return { text: 'DEC DE', len: 1 };
  if (b0 === 0xEB) return { text: 'EX DE,HL', len: 1 };
  if (b0 === 0xF3) return { text: 'DI', len: 1 };
  if (b0 === 0xFB) return { text: 'EI', len: 1 };
  if (b0 === 0x76) return { text: 'HALT', len: 1 };

  // Fallback: show raw byte
  return { text: hexByte(b0), len: 1 };
}

function disasmContext(center, before = 10, after = 10) {
  // Disassemble ~before bytes before center, ~after bytes after
  const lines = [];
  let addr = Math.max(0, center - before);
  const end = Math.min(rom.length, center + after);
  while (addr < end) {
    const { text, len } = disasmLine(addr);
    const marker = (addr === center) ? ' <<<' : '';
    lines.push(`  ${hex(addr)}: ${hexDump(addr, len).padEnd(15)} ${text}${marker}`);
    addr += len;
  }
  return lines.join('\n');
}

// ── Main scan ───────────────────────────────────────────────────────

console.log('=== Phase 416: 0x0150C2 State Variable Reference Map ===\n');

const allResults = {};

for (const target of targets) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`  ${target.name} (${hex(target.addr)}) — ${target.desc}`);
  console.log(`  Search pattern: ${target.bytes.map(hexByte).join(' ')}`);
  console.log(`${'='.repeat(70)}\n`);

  const hits = [];

  // Scan ROM for the 3-byte LE pattern
  for (let i = 0; i < SCAN_END - 2; i++) {
    if (rom[i] === target.bytes[0] &&
        rom[i + 1] === target.bytes[1] &&
        rom[i + 2] === target.bytes[2]) {
      const cls = classifyHit(i);
      hits.push({ patternAddr: i, ...cls });
    }
  }

  const reads = hits.filter(h => h.type === 'READ');
  const writes = hits.filter(h => h.type === 'WRITE');
  const addrLoads = hits.filter(h => h.type === 'ADDR_LOAD');
  const unknowns = hits.filter(h => h.type === 'UNKNOWN');

  console.log(`  Total references: ${hits.length}`);
  console.log(`    READs:        ${reads.length}`);
  console.log(`    WRITEs:       ${writes.length}`);
  console.log(`    ADDR_LOADs:   ${addrLoads.length}`);
  console.log(`    UNKNOWN:      ${unknowns.length}`);

  // List all references
  console.log(`\n  All references:`);
  for (const h of hits) {
    console.log(`    ${hex(h.instrAddr)}: ${h.label} [${h.type}]`);
  }

  // Disassemble context around write sites (up to 5)
  const writeSites = [...writes, ...addrLoads.filter(h => {
    // Check if addr load is followed by a store pattern (LD (HL),A etc)
    return true; // include all addr loads for context
  })];

  const contextSites = writes.slice(0, 5);
  if (contextSites.length > 0) {
    console.log(`\n  Write site context (up to 5):`);
    for (const w of contextSites) {
      console.log(`\n  --- ${hex(w.instrAddr)}: ${w.label} ---`);
      console.log(disasmContext(w.instrAddr, 12, 12));
    }
  }

  // Also show addr load context (up to 3) since these often set up indirect writes
  const addrCtx = addrLoads.slice(0, 3);
  if (addrCtx.length > 0) {
    console.log(`\n  Address load site context (up to 3):`);
    for (const a of addrCtx) {
      console.log(`\n  --- ${hex(a.instrAddr)}: ${a.label} ---`);
      console.log(disasmContext(a.instrAddr, 8, 16));
    }
  }

  // Show unknown context (up to 3)
  const unkCtx = unknowns.slice(0, 3);
  if (unkCtx.length > 0) {
    console.log(`\n  Unknown reference context (up to 3):`);
    for (const u of unkCtx) {
      console.log(`\n  --- ${hex(u.patternAddr)}: pattern at ${hex(u.patternAddr)} ---`);
      console.log(disasmContext(u.patternAddr, 8, 12));
    }
  }

  allResults[target.name] = { hits, reads, writes, addrLoads, unknowns };
}

// ── Summary ─────────────────────────────────────────────────────────

console.log(`\n\n${'='.repeat(70)}`);
console.log('  SUMMARY');
console.log(`${'='.repeat(70)}\n`);

console.log('  Variable     | Total | Reads | Writes | AddrLoad | Unknown');
console.log('  -------------|-------|-------|--------|----------|--------');
for (const target of targets) {
  const r = allResults[target.name];
  console.log(`  ${target.name.padEnd(13)}| ${String(r.hits.length).padEnd(6)}| ${String(r.reads.length).padEnd(6)}| ${String(r.writes.length).padEnd(7)}| ${String(r.addrLoads.length).padEnd(9)}| ${r.unknowns.length}`);
}

console.log('\nDone.');
