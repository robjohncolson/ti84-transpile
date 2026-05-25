#!/usr/bin/env node
// Phase 437 — Map all port 0x3080 (OTG_CSR) I/O sites in the ROM.
//
// Scans for LD BC,0x3080 patterns (ADL and SIL modes), then traces forward
// to find ALL IN A,(C) and OUT (C),A instructions (not just the first).
// For each OUT, inspects the instructions between the preceding IN and the
// OUT to identify SET/RES/AND/OR bit manipulations (read-modify-write).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const REPORT_PATH = path.join(__dirname, 'phase437-port-3080-report.md');

const rom = fs.readFileSync(ROM_PATH);
const ROM_SIZE = rom.length;

const PORT = 0x3080;
const PORT_LO = PORT & 0xFF;        // 0x80
const PORT_HI = (PORT >> 8) & 0xFF; // 0x30

// ─── helpers ────────────────────────────────────────────────────────

function hex(n, w = 6) { return '0x' + n.toString(16).toUpperCase().padStart(w, '0'); }

// Search backward from addr for a plausible function prologue.
function findPrologue(addr) {
  const prologueOps = new Set([0xF5, 0xC5, 0xD5, 0xE5]);
  for (let off = 1; off <= 256 && (addr - off) >= 0; off++) {
    const a = addr - off;
    const b = rom[a];
    if (prologueOps.has(b)) return a;
    if (a > 0 && (rom[a - 1] === 0xDD || rom[a - 1] === 0xFD) && b === 0xE5) return a - 1;
    if (b === 0xC9) return a + 1;
  }
  return addr;
}

// Decode bit-manipulation instructions between two addresses.
function decodeBitOps(startAddr, endAddr) {
  const ops = [];
  let i = startAddr;

  while (i < endAddr && i < ROM_SIZE) {
    const b = rom[i];

    // CB prefix — bit manipulation
    if (b === 0xCB && i + 1 < endAddr) {
      const cb = rom[i + 1];
      const bitOp = (cb >> 6) & 3;
      const bitNum = (cb >> 3) & 7;
      const reg = cb & 7;
      const regName = ['B','C','D','E','H','L','(HL)','A'][reg];
      if (bitOp === 2) ops.push({ type: 'RES', bit: bitNum, reg: regName, addr: i });
      if (bitOp === 3) ops.push({ type: 'SET', bit: bitNum, reg: regName, addr: i });
      if (bitOp === 1) ops.push({ type: 'BIT', bit: bitNum, reg: regName, addr: i });
      i += 2;
      continue;
    }

    if (b === 0xE6 && i + 1 < endAddr) { ops.push({ type: 'AND', value: rom[i + 1], addr: i }); i += 2; continue; }
    if (b === 0xF6 && i + 1 < endAddr) { ops.push({ type: 'OR', value: rom[i + 1], addr: i }); i += 2; continue; }
    if (b === 0xEE && i + 1 < endAddr) { ops.push({ type: 'XOR', value: rom[i + 1], addr: i }); i += 2; continue; }
    if (b === 0x3E && i + 1 < endAddr) { ops.push({ type: 'LD_A', value: rom[i + 1], addr: i }); i += 2; continue; }

    i += 1;
  }

  return ops;
}

// Summarize bits affected from a list of bit ops
function summarizeBits(bitOps) {
  const bitsAffected = [];
  for (const op of bitOps) {
    if (op.type === 'SET') bitsAffected.push(`SET ${op.bit}`);
    if (op.type === 'RES') bitsAffected.push(`RES ${op.bit}`);
    if (op.type === 'BIT') bitsAffected.push(`BIT ${op.bit}`);
    if (op.type === 'AND') {
      for (let b = 0; b < 8; b++) {
        if (!(op.value & (1 << b))) bitsAffected.push(`CLR ${b} (AND ${hex(op.value, 2)})`);
      }
    }
    if (op.type === 'OR') {
      for (let b = 0; b < 8; b++) {
        if (op.value & (1 << b)) bitsAffected.push(`SET ${b} (OR ${hex(op.value, 2)})`);
      }
    }
    if (op.type === 'LD_A') bitsAffected.push(`LD A,${hex(op.value, 2)}`);
  }
  return bitsAffected;
}

// ─── scan: find all LD BC,0x3080 sites ──────────────────────────────

const ldSites = []; // { addr, len }

for (let addr = 0; addr < ROM_SIZE - 5; addr++) {
  // ADL: 01 80 30 00
  if (rom[addr] === 0x01 && rom[addr + 1] === PORT_LO && rom[addr + 2] === PORT_HI && rom[addr + 3] === 0x00) {
    ldSites.push({ addr, len: 4 });
    continue;
  }
  // SIL: 40 01 80 30
  if (rom[addr] === 0x40 && rom[addr + 1] === 0x01 && rom[addr + 2] === PORT_LO && rom[addr + 3] === PORT_HI) {
    ldSites.push({ addr, len: 4 });
    continue;
  }
  // LIL: 49 01 80 30 00
  if (rom[addr] === 0x49 && rom[addr + 1] === 0x01 && rom[addr + 2] === PORT_LO && rom[addr + 3] === PORT_HI) {
    ldSites.push({ addr, len: 5 });
    continue;
  }
  // 52 prefix: 52 01 80 30 00
  if (rom[addr] === 0x52 && rom[addr + 1] === 0x01 && rom[addr + 2] === PORT_LO && rom[addr + 3] === PORT_HI) {
    ldSites.push({ addr, len: 5 });
    continue;
  }
}

// For each LD BC site, trace forward up to 96 bytes for ALL IN/OUT instructions.
// BC stays loaded until something overwrites it, so multiple I/O ops can follow one LD BC.

const allSites = []; // { ldAddr, ioAddr, ioType, prologue, bitOps, bitsAffected, isRMW, rawBytes }
const ioAddrsSeen = new Set();

for (const ld of ldSites) {
  const scanEnd = Math.min(ld.addr + ld.len + 96, ROM_SIZE - 1);
  let lastInAddr = -1; // track last IN for read-modify-write detection

  for (let scan = ld.addr + ld.len; scan < scanEnd; scan++) {
    if (rom[scan] !== 0xED) continue;
    if (scan + 1 >= ROM_SIZE) continue;

    const next = rom[scan + 1];
    if (next !== 0x78 && next !== 0x79) continue;

    // Check if BC might have been reloaded (another LD BC in between)
    let bcReloaded = false;
    for (let chk = ld.addr + ld.len; chk < scan; chk++) {
      if (rom[chk] === 0x01 && chk + 3 < scan) {
        // Another LD BC — check if it's NOT 0x3080
        if (!(rom[chk + 1] === PORT_LO && rom[chk + 2] === PORT_HI && rom[chk + 3] === 0x00)) {
          bcReloaded = true;
          break;
        }
      }
    }
    if (bcReloaded) break; // BC was reloaded with a different port, stop scanning

    const ioType = next === 0x78 ? 'IN' : 'OUT';

    if (ioAddrsSeen.has(scan)) continue; // already recorded
    ioAddrsSeen.add(scan);

    const prologue = findPrologue(ld.addr);

    // For OUT: decode bit ops between the last IN (or LD BC) and this OUT
    let bitOps = [];
    let isRMW = false;
    if (ioType === 'OUT') {
      const traceStart = lastInAddr !== -1 ? lastInAddr + 2 : ld.addr + ld.len;
      bitOps = decodeBitOps(traceStart, scan);
      isRMW = lastInAddr !== -1;
    }

    // For IN: no bit ops to decode (it's a read)
    if (ioType === 'IN') {
      lastInAddr = scan;
    }

    const bitsAffected = summarizeBits(bitOps);

    // Raw bytes from LD BC through this I/O instruction
    const rawStart = ld.addr;
    const rawEnd = scan + 2;
    const rawBytes = [];
    for (let a = rawStart; a < rawEnd && a < ROM_SIZE; a++) {
      rawBytes.push(rom[a].toString(16).padStart(2, '0'));
    }

    allSites.push({
      ldAddr: ld.addr,
      ioAddr: scan,
      ioType,
      prologue,
      bitOps,
      bitsAffected,
      isRMW,
      rawBytes: rawBytes.join(' '),
      rawStart,
    });
  }
}

allSites.sort((a, b) => a.ioAddr - b.ioAddr);

// ─── build bit map ──────────────────────────────────────────────────

const bitMap = {};
for (let b = 0; b < 8; b++) bitMap[b] = [];

for (const s of allSites) {
  if (s.ioType !== 'OUT') continue;
  for (const op of s.bitOps) {
    if (op.type === 'SET' || op.type === 'RES' || op.type === 'BIT') {
      bitMap[op.bit].push({
        func: hex(s.prologue),
        ioAddr: hex(s.ioAddr),
        action: op.type,
      });
    }
    if (op.type === 'AND') {
      for (let b = 0; b < 8; b++) {
        if (!(op.value & (1 << b))) {
          bitMap[b].push({ func: hex(s.prologue), ioAddr: hex(s.ioAddr), action: `CLR (AND ${hex(op.value, 2)})` });
        }
      }
    }
    if (op.type === 'OR') {
      for (let b = 0; b < 8; b++) {
        if (op.value & (1 << b)) {
          bitMap[b].push({ func: hex(s.prologue), ioAddr: hex(s.ioAddr), action: `SET (OR ${hex(op.value, 2)})` });
        }
      }
    }
  }
}

// ─── group by function ──────────────────────────────────────────────

const byFunc = {};
for (const s of allSites) {
  const key = hex(s.prologue);
  if (!byFunc[key]) byFunc[key] = [];
  byFunc[key].push(s);
}

// ─── output ─────────────────────────────────────────────────────────

const lines = [];
function out(s = '') { console.log(s); lines.push(s); }

const reads = allSites.filter(s => s.ioType === 'IN');
const writes = allSites.filter(s => s.ioType === 'OUT');

out('# Phase 437 — Port 0x3080 (OTG_CSR) Bitfield Map');
out('');
out(`Total I/O sites: ${allSites.length} (${reads.length} reads, ${writes.length} writes)`);
out(`LD BC,0x3080 sites: ${ldSites.length}`);
out(`Distinct functions: ${Object.keys(byFunc).length}`);
out('');

// ─── bitfield map (the main deliverable) ────────────────────────────

out('## Bitfield Map');
out('');
out('| Bit | Role | Writers | Actions |');
out('|-----|------|---------|---------|');
for (let b = 7; b >= 0; b--) {
  const entries = bitMap[b];
  if (entries.length === 0) {
    out(`| ${b} | (read-only or unused) | — | — |`);
  } else {
    // Deduplicate by func+action
    const uniq = [...new Map(entries.map(e => [`${e.func}:${e.action}`, e])).values()];
    const funcs = [...new Set(uniq.map(e => e.func))].join(', ');
    const actions = [...new Set(uniq.map(e => e.action))].join(', ');
    out(`| ${b} | see details | ${funcs} | ${actions} |`);
  }
}
out('');

// ─── all I/O sites table ────────────────────────────────────────────

out('## All I/O Sites');
out('');
out('| # | I/O addr | Type | Function | RMW | Bits affected |');
out('|---|----------|------|----------|-----|---------------|');
for (let i = 0; i < allSites.length; i++) {
  const s = allSites[i];
  const rmw = s.isRMW ? 'yes' : '';
  const bits = s.bitsAffected.length > 0 ? s.bitsAffected.join(', ') : (s.ioType === 'IN' ? '(read)' : '(raw write)');
  out(`| ${i + 1} | ${hex(s.ioAddr)} | ${s.ioType} | ${hex(s.prologue)} | ${rmw} | ${bits} |`);
}
out('');

// ─── summary by function ────────────────────────────────────────────

out('## By Function');
out('');
const funcKeys = Object.keys(byFunc).sort();
for (const fk of funcKeys) {
  const entries = byFunc[fk];
  const ri = entries.filter(e => e.ioType === 'IN').length;
  const wo = entries.filter(e => e.ioType === 'OUT').length;
  const allBits = entries.flatMap(e => e.bitsAffected);
  const bitsStr = allBits.length > 0 ? allBits.join(', ') : '(read-only)';
  out(`### ${fk} — ${ri}R ${wo}W`);
  out(`Bits: ${bitsStr}`);
  out('');
}

// ─── detailed traces ────────────────────────────────────────────────

out('## Detailed Instruction Traces');
out('');
for (const s of allSites) {
  out(`### ${hex(s.ioAddr)} (${s.ioType}) — function ~${hex(s.prologue)}`);
  out('');
  out('```');
  out(`${hex(s.rawStart)}: ${s.rawBytes}`);
  out('```');
  if (s.bitOps.length > 0) {
    out('');
    out('Decoded operations:');
    for (const op of s.bitOps) {
      if (op.type === 'SET' || op.type === 'RES' || op.type === 'BIT') {
        out(`  - ${op.type} ${op.bit},${op.reg} at ${hex(op.addr)}`);
      } else if (op.type === 'AND' || op.type === 'OR' || op.type === 'XOR') {
        out(`  - ${op.type} ${hex(op.value, 2)} at ${hex(op.addr)}`);
      } else if (op.type === 'LD_A') {
        out(`  - LD A,${hex(op.value, 2)} at ${hex(op.addr)}`);
      }
    }
  }
  out('');
}

// Write report
fs.writeFileSync(REPORT_PATH, lines.join('\n'), 'utf8');
console.log(`\nReport written to ${REPORT_PATH}`);
