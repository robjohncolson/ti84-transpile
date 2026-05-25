#!/usr/bin/env node
// Phase 438 — Map all port 0x3082 I/O sites in the ROM.
//
// Scans for LD BC,0x3082 patterns (ADL, SIL, LIL modes), then traces forward
// to find ALL IN A,(C) and OUT (C),A instructions.
// For each IN, inspects the ~20 bytes after for bit tests (BIT n,A, AND mask, shifts, CP).
// For each OUT, inspects the bytes between the preceding IN and the OUT for
// SET/RES/AND/OR bit manipulations (read-modify-write).
//
// Also checks for BC set to a nearby port (0x3080, 0x3081) and incremented to 0x3082.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');

const rom = fs.readFileSync(ROM_PATH);
const ROM_SIZE = rom.length;

const PORT = 0x3082;
const PORT_LO = PORT & 0xFF;        // 0x82
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
    if (b === 0xC9) return a + 1;   // RET — next function starts after
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

    // Shift/rotate on A
    if (b === 0x1F) { ops.push({ type: 'RRA', addr: i }); i += 1; continue; }
    if (b === 0x07) { ops.push({ type: 'RLCA', addr: i }); i += 1; continue; }
    if (b === 0x0F) { ops.push({ type: 'RRCA', addr: i }); i += 1; continue; }
    if (b === 0x17) { ops.push({ type: 'RLA', addr: i }); i += 1; continue; }

    // CP imm8
    if (b === 0xFE && i + 1 < endAddr) { ops.push({ type: 'CP', value: rom[i + 1], addr: i }); i += 2; continue; }

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
    if (op.type === 'RRA') bitsAffected.push('RRA');
    if (op.type === 'RLCA') bitsAffected.push('RLCA');
    if (op.type === 'RRCA') bitsAffected.push('RRCA');
    if (op.type === 'RLA') bitsAffected.push('RLA');
    if (op.type === 'CP') bitsAffected.push(`CP ${hex(op.value, 2)}`);
  }
  return bitsAffected;
}

// Extract which bit numbers are touched by a set of ops
function extractBitNumbers(bitOps) {
  const bits = new Set();
  for (const op of bitOps) {
    if (op.type === 'SET' || op.type === 'RES' || op.type === 'BIT') {
      bits.add(op.bit);
    }
    if (op.type === 'AND') {
      for (let b = 0; b < 8; b++) {
        if (!(op.value & (1 << b))) bits.add(b);
      }
    }
    if (op.type === 'OR') {
      for (let b = 0; b < 8; b++) {
        if (op.value & (1 << b)) bits.add(b);
      }
    }
  }
  return bits;
}

// ─── scan: find all LD BC,0x3082 sites ──────────────────────────────

const ldSites = []; // { addr, len, source }

for (let addr = 0; addr < ROM_SIZE - 5; addr++) {
  // ADL: 01 82 30 00
  if (rom[addr] === 0x01 && rom[addr + 1] === PORT_LO && rom[addr + 2] === PORT_HI && rom[addr + 3] === 0x00) {
    ldSites.push({ addr, len: 4, source: 'LD BC,imm24 (ADL)' });
    continue;
  }
  // SIL: 40 01 82 30
  if (rom[addr] === 0x40 && rom[addr + 1] === 0x01 && rom[addr + 2] === PORT_LO && rom[addr + 3] === PORT_HI) {
    ldSites.push({ addr, len: 4, source: 'LD BC,imm16 (SIL)' });
    continue;
  }
  // LIL: 49 01 82 30 00
  if (rom[addr] === 0x49 && rom[addr + 1] === 0x01 && rom[addr + 2] === PORT_LO && rom[addr + 3] === PORT_HI) {
    ldSites.push({ addr, len: 5, source: 'LD BC,imm24 (LIL)' });
    continue;
  }
  // 52 prefix: 52 01 82 30 00
  if (rom[addr] === 0x52 && rom[addr + 1] === 0x01 && rom[addr + 2] === PORT_LO && rom[addr + 3] === PORT_HI) {
    ldSites.push({ addr, len: 5, source: 'LD BC,imm24 (52 prefix)' });
    continue;
  }
}

// Also scan for LD C,0x82 / LD B,0x30 pairs (split loads)
for (let addr = 0; addr < ROM_SIZE - 6; addr++) {
  // LD C,0x82 = 0x0E 0x82, then LD B,0x30 = 0x06 0x30 within 6 bytes
  if (rom[addr] === 0x0E && rom[addr + 1] === PORT_LO) {
    for (let off = 2; off <= 6 && addr + off + 1 < ROM_SIZE; off++) {
      if (rom[addr + off] === 0x06 && rom[addr + off + 1] === PORT_HI) {
        ldSites.push({ addr, len: off + 2, source: 'LD C,imm8 + LD B,imm8' });
        break;
      }
    }
  }
  // Reverse order: LD B,0x30 then LD C,0x82
  if (rom[addr] === 0x06 && rom[addr + 1] === PORT_HI) {
    for (let off = 2; off <= 6 && addr + off + 1 < ROM_SIZE; off++) {
      if (rom[addr + off] === 0x0E && rom[addr + off + 1] === PORT_LO) {
        ldSites.push({ addr, len: off + 2, source: 'LD B,imm8 + LD C,imm8' });
        break;
      }
    }
  }
}

// Also scan for INC BC after LD BC,0x3081 (increment from nearby port)
for (let addr = 0; addr < ROM_SIZE - 6; addr++) {
  // LD BC,0x3081 then INC BC
  if (rom[addr] === 0x01 && rom[addr + 1] === 0x81 && rom[addr + 2] === 0x30 && rom[addr + 3] === 0x00) {
    for (let off = 4; off <= 10 && addr + off < ROM_SIZE; off++) {
      if (rom[addr + off] === 0x03) { // INC BC
        ldSites.push({ addr, len: off + 1, source: 'LD BC,0x3081 + INC BC' });
        break;
      }
    }
  }
  // LD BC,0x3080 then INC BC twice
  if (rom[addr] === 0x01 && rom[addr + 1] === 0x80 && rom[addr + 2] === 0x30 && rom[addr + 3] === 0x00) {
    let incCount = 0;
    for (let off = 4; off <= 12 && addr + off < ROM_SIZE; off++) {
      if (rom[addr + off] === 0x03) { // INC BC
        incCount++;
        if (incCount === 2) {
          ldSites.push({ addr, len: off + 1, source: 'LD BC,0x3080 + INC BC x2' });
          break;
        }
      } else if (rom[addr + off] === 0xED) {
        break; // hit an I/O instruction before enough increments
      }
    }
  }
}

// Deduplicate LD sites by addr
const ldSiteMap = new Map();
for (const ld of ldSites) {
  if (!ldSiteMap.has(ld.addr)) ldSiteMap.set(ld.addr, ld);
}
const uniqueLdSites = [...ldSiteMap.values()].sort((a, b) => a.addr - b.addr);

// ─── for each LD BC site, trace forward for IN/OUT ──────────────────

const allSites = []; // { ldAddr, ioAddr, ioType, prologue, bitOps, bitsAffected, isRMW, rawBytes, rawStart, source }
const ioAddrsSeen = new Set();

for (const ld of uniqueLdSites) {
  const scanEnd = Math.min(ld.addr + ld.len + 96, ROM_SIZE - 1);
  let lastInAddr = -1;

  for (let scan = ld.addr + ld.len; scan < scanEnd; scan++) {
    if (rom[scan] !== 0xED) continue;
    if (scan + 1 >= ROM_SIZE) continue;

    const next = rom[scan + 1];
    if (next !== 0x78 && next !== 0x79) continue;

    // Check if BC might have been reloaded between LD and here
    let bcReloaded = false;
    for (let chk = ld.addr + ld.len; chk < scan; chk++) {
      if (rom[chk] === 0x01 && chk + 3 < scan) {
        if (!(rom[chk + 1] === PORT_LO && rom[chk + 2] === PORT_HI)) {
          bcReloaded = true;
          break;
        }
      }
    }
    if (bcReloaded) break;

    const ioType = next === 0x78 ? 'IN' : 'OUT';

    if (ioAddrsSeen.has(scan)) continue;
    ioAddrsSeen.add(scan);

    const prologue = findPrologue(ld.addr);

    let bitOps = [];
    let isRMW = false;

    if (ioType === 'OUT') {
      // Decode bit ops between the last IN (or LD BC) and this OUT
      const traceStart = lastInAddr !== -1 ? lastInAddr + 2 : ld.addr + ld.len;
      bitOps = decodeBitOps(traceStart, scan);
      isRMW = lastInAddr !== -1;
    }

    if (ioType === 'IN') {
      lastInAddr = scan;
      // Scan AFTER the IN for bit tests, AND masks, shifts, CP
      const afterEnd = Math.min(scan + 22, ROM_SIZE);
      bitOps = decodeBitOps(scan + 2, afterEnd);
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
      source: ld.source,
    });
  }
}

allSites.sort((a, b) => a.ioAddr - b.ioAddr);

// ─── build bit map ──────────────────────────────────────────────────

const bitMap = {};
for (let b = 0; b < 8; b++) bitMap[b] = { reads: [], writes: [] };

for (const s of allSites) {
  for (const op of s.bitOps) {
    if (op.type === 'SET' || op.type === 'RES' || op.type === 'BIT') {
      const entry = { func: hex(s.prologue), ioAddr: hex(s.ioAddr), action: op.type, ioType: s.ioType };
      if (s.ioType === 'IN') {
        bitMap[op.bit].reads.push(entry);
      } else {
        bitMap[op.bit].writes.push(entry);
      }
    }
    if (op.type === 'AND') {
      for (let b = 0; b < 8; b++) {
        if (!(op.value & (1 << b))) {
          const entry = { func: hex(s.prologue), ioAddr: hex(s.ioAddr), action: `CLR (AND ${hex(op.value, 2)})`, ioType: s.ioType };
          if (s.ioType === 'IN') bitMap[b].reads.push(entry);
          else bitMap[b].writes.push(entry);
        }
      }
    }
    if (op.type === 'OR') {
      for (let b = 0; b < 8; b++) {
        if (op.value & (1 << b)) {
          const entry = { func: hex(s.prologue), ioAddr: hex(s.ioAddr), action: `SET (OR ${hex(op.value, 2)})`, ioType: s.ioType };
          if (s.ioType === 'IN') bitMap[b].reads.push(entry);
          else bitMap[b].writes.push(entry);
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
const funcCount = Object.keys(byFunc).length;

out('# Port 0x3082 — Complete Bitfield Map');
out('');
out('## Summary');
out(`- Total I/O sites: ${allSites.length} (${reads.length} reads + ${writes.length} writes)`);
out(`- LD BC,0x3082 load sites: ${uniqueLdSites.length}`);
out(`- Distinct functions accessing: ${funcCount}`);
out('');

// ─── bitfield map ───────────────────────────────────────────────────

out('## Bitfield Map');
out('');
out('| Bit | Name/Role | Evidence | Read sites | Write sites |');
out('|-----|-----------|----------|------------|-------------|');
for (let b = 7; b >= 0; b--) {
  const r = bitMap[b].reads;
  const w = bitMap[b].writes;
  const totalRefs = r.length + w.length;

  let role = '(no direct bit access observed)';
  // Try to infer role from known context
  if (b === 7 || b === 6) role = 'USB speed/mode (2-bit field, stored to D141E6)';
  if (b === 4) role = 'device-connected status (mirrored to D14073)';
  if (b === 3) role = 'OTG transition trigger (0x012456)';
  if (b === 1) role = 'port-ready gate (0x0125EA, 0x01253F)';

  if (totalRefs === 0) {
    out(`| ${b} | ${role} | no direct bit-level access found | — | — |`);
  } else {
    const readFuncs = [...new Set(r.map(e => e.func))].join(', ') || '—';
    const writeFuncs = [...new Set(w.map(e => e.func))].join(', ') || '—';
    const readActions = [...new Set(r.map(e => e.action))].join(', ') || '—';
    const writeActions = [...new Set(w.map(e => e.action))].join(', ') || '—';
    const evidence = [...new Set([...r, ...w].map(e => e.action))].join(', ');
    out(`| ${b} | ${role} | ${evidence} | ${readFuncs} (${readActions}) | ${writeFuncs} (${writeActions}) |`);
  }
}
out('');

// ─── all I/O sites table ────────────────────────────────────────────

out('## All I/O Sites');
out('');
out('| # | Address | Function | Direction | RMW | Bits Accessed | Context |');
out('|---|---------|----------|-----------|-----|---------------|---------|');
for (let i = 0; i < allSites.length; i++) {
  const s = allSites[i];
  const rmw = s.isRMW ? 'yes' : '';
  const bits = s.bitsAffected.length > 0
    ? s.bitsAffected.join(', ')
    : (s.ioType === 'IN' ? '(full byte read)' : '(raw write)');
  out(`| ${i + 1} | ${hex(s.ioAddr)} | ${hex(s.prologue)} | ${s.ioType} | ${rmw} | ${bits} | ${s.source} |`);
}
out('');

// ─── by function ────────────────────────────────────────────────────

out('## By Function');
out('');
const funcKeys = Object.keys(byFunc).sort();
for (const fk of funcKeys) {
  const entries = byFunc[fk];
  const ri = entries.filter(e => e.ioType === 'IN').length;
  const wo = entries.filter(e => e.ioType === 'OUT').length;
  const allBits = entries.flatMap(e => e.bitsAffected);
  const bitsStr = allBits.length > 0 ? allBits.join(', ') : '(read-only / full byte)';
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
      } else if (op.type === 'CP') {
        out(`  - CP ${hex(op.value, 2)} at ${hex(op.addr)}`);
      } else if (op.type === 'RRA' || op.type === 'RLCA' || op.type === 'RRCA' || op.type === 'RLA') {
        out(`  - ${op.type} at ${hex(op.addr)}`);
      }
    }
  }
  out('');
}

// ─── analysis section ───────────────────────────────────────────────

out('## Analysis');
out('');
out(`Port 0x3082 has ${allSites.length} I/O sites (${reads.length} reads, ${writes.length} writes) across ${funcCount} functions.`);
out('');
out('### Register Type');
if (writes.length === 0) {
  out('- **Read-only status register**: no writes observed.');
} else if (reads.length === 0) {
  out('- **Write-only control register**: no reads observed.');
} else if (writes.filter(w => w.isRMW).length > writes.length / 2) {
  out('- **Mixed status/control register**: majority of writes are read-modify-write, indicating controlled bit manipulation.');
} else {
  out('- **Mixed register**: both reads and writes observed.');
}
out('');

out('### Comparison with Port 0x3080 (OTG_CSR)');
out('- Port 0x3080: 106 I/O sites, 8-bit bitfield, OTG control/status register');
out(`- Port 0x3082: ${allSites.length} I/O sites — ${allSites.length < 106 ? 'lower traffic, likely more specialized' : 'comparable traffic'}`);
out('');

out('### Known Bit Assignments (from prior sessions)');
out('- Bits 7:6 — USB speed/mode (2-bit value stored to D141E6, session 429)');
out('- Bit 4 — device-connected status (mirrored to D14073 dynamically, session 437)');
out('- Bit 3 — referenced by 0x008527 (session 432, triggers OTG transition via 0x012456)');
out('- Bit 1 — checked by 0x0125EA and 0x01253F (port-ready gates, session 433)');
out('');

// Write report
const reportPath = path.join(__dirname, 'phase438-port3082-report.md');
fs.writeFileSync(reportPath, lines.join('\n'), 'utf8');
console.log(`\nReport written to ${reportPath}`);
