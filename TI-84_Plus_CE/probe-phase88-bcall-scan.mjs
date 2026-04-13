#!/usr/bin/env node
// Phase 88: Scan raw ROM bytes for BCALL (RST 0x08 = 0xCF) call sites
// Goal: Find which ROM addresses call slots 627, 639, 629, 631, 632, etc.
// BCALL encoding: 0xCF <lo_byte> <hi_byte>  (slot = lo | hi<<8, little-endian)
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
console.log(`ROM size: ${romBytes.length} bytes (0x${romBytes.length.toString(16)})`);

// Jump table: slot N lives at ROM address 0x020104 + N*4 (24-bit LE + 1 pad)
const JT_BASE = 0x020104;
function slotToRomAddr(slot) {
  const jtEntry = JT_BASE + slot * 4;
  return romBytes[jtEntry] | (romBytes[jtEntry+1] << 8) | (romBytes[jtEntry+2] << 16);
}

// Known targets — slot number → address mapping (verify from ROM)
const KNOWN_SLOTS = {
  627: 0x0a29ec,  // home row strip renderer (5652px r17-34)
  628: null,
  629: null,
  630: null,
  631: 0x0a2a3e,
  632: null,
  639: 0x0a2b72,  // home status bar fill (5692px r0-34)
  21:  0x08c366,  // confirmed from Phase 71
};

// Verify slot→address from ROM
console.log('\nSlot verification from ROM jump table:');
for (const [slot, expected] of Object.entries(KNOWN_SLOTS)) {
  const actual = slotToRomAddr(Number(slot));
  const ok = expected === null ? '(unknown)' : (actual === expected ? 'OK' : `MISMATCH expected 0x${expected.toString(16)}`);
  console.log(`  Slot ${slot} (0x${Number(slot).toString(16).padStart(4,'0')}): 0x${actual.toString(16).padStart(6,'0')} ${ok}`);
}

// Build reverse map: ROM address → slot numbers (some addresses may map to multiple slots)
// Scan all slots 0..1023 to find slots that point to our target addresses
const TARGET_ADDRS = new Set([0x0a29ec, 0x0a2b72, 0x09cb14, 0x0a2812, 0x0a2a3e, 0x0a2b46]);
const addrToSlots = new Map();
const SLOT_COUNT = 1024;
for (let slot = 0; slot < SLOT_COUNT; slot++) {
  const addr = slotToRomAddr(slot);
  if (TARGET_ADDRS.has(addr)) {
    if (!addrToSlots.has(addr)) addrToSlots.set(addr, []);
    addrToSlots.get(addr).push(slot);
  }
}
console.log('\nTarget address → slot mapping:');
for (const [addr, slots] of addrToSlots) {
  console.log(`  0x${addr.toString(16)}: slots [${slots.join(', ')}]`);
}

// Scan all ROM bytes for 0xCF (RST 0x08) followed by 2-byte slot
// Collect all call sites grouped by slot
const callSites = new Map(); // slot → [callerPc, ...]
let totalBcalls = 0;
for (let i = 0; i < romBytes.length - 2; i++) {
  if (romBytes[i] === 0xCF) {
    const slot = romBytes[i+1] | (romBytes[i+2] << 8);
    totalBcalls++;
    if (!callSites.has(slot)) callSites.set(slot, []);
    callSites.get(slot).push(i);
  }
}
console.log(`\nTotal 0xCF patterns found: ${totalBcalls}`);

// Report call sites for target slots
const targetSlots = new Set();
for (const slots of addrToSlots.values()) {
  for (const s of slots) targetSlots.add(s);
}
// Also always check slots 627, 639, 21 directly
[627, 639, 21, 519, 523].forEach(s => targetSlots.add(s));

console.log('\n=== BCALL call sites for target slots ===');
const lines = ['# Phase 88 — BCALL Scanner Results\n'];
lines.push(`ROM size: ${romBytes.length} bytes\n`);
lines.push(`Total 0xCF (RST 0x08) patterns: ${totalBcalls}\n\n`);

// Also find which slot maps to 0x09cb14 (Y= char renderer)
console.log('\nSlot scan for 0x09cb14 and 0x0a2812:');
for (let slot = 0; slot < 2048 && JT_BASE + slot*4 + 2 < romBytes.length; slot++) {
  const addr = slotToRomAddr(slot);
  if (addr === 0x09cb14 || addr === 0x0a2812 || addr === 0x0a29ec || addr === 0x0a2b72) {
    console.log(`  Slot ${slot} (0x${slot.toString(16)}): 0x${addr.toString(16)}`);
    targetSlots.add(slot);
  }
}

for (const slot of [...targetSlots].sort((a,b) => a-b)) {
  const addr = slotToRomAddr(slot);
  const sites = callSites.get(slot) || [];
  console.log(`\nSlot ${slot} (0x${slot.toString(16).padStart(4,'0')}) → ROM 0x${addr.toString(16).padStart(6,'0')}: ${sites.length} call sites`);
  lines.push(`## Slot ${slot} (0x${slot.toString(16)}) → 0x${addr.toString(16)}\n`);
  lines.push(`${sites.length} call sites:\n`);
  if (sites.length > 0) {
    lines.push('| caller PC | hex bytes |');
    lines.push('|-----------|-----------|');
    for (const pc of sites.slice(0, 50)) {
      const hex = `CF ${romBytes[pc+1].toString(16).padStart(2,'0')} ${romBytes[pc+2].toString(16).padStart(2,'0')}`;
      console.log(`  0x${pc.toString(16).padStart(6,'0')}: ${hex}`);
      lines.push(`| 0x${pc.toString(16).padStart(6,'0')} | \`${hex}\` |`);
    }
    if (sites.length > 50) lines.push(`| ... (${sites.length-50} more) | |`);
  }
  lines.push('');
}

// Also scan for BCALL to 0x09c000-page targets even if slot unknown
// Find all slots pointing into 0x09cXXX range
console.log('\n\nSlots pointing into 0x09c000-0x09cfff:');
const page09c = [];
for (let slot = 0; slot < 2048 && JT_BASE + slot*4 + 2 < romBytes.length; slot++) {
  const addr = slotToRomAddr(slot);
  if (addr >= 0x09c000 && addr < 0x09d000) {
    const sites = callSites.get(slot) || [];
    page09c.push({ slot, addr, count: sites.length });
    console.log(`  Slot ${slot}: 0x${addr.toString(16)} (${sites.length} callers)`);
    if (sites.length > 0) {
      for (const pc of sites.slice(0, 5)) console.log(`    called from 0x${pc.toString(16)}`);
    }
  }
}

lines.push('\n## Slots into 0x09c000-page\n');
lines.push('| slot | addr | callers |');
lines.push('|------|------|---------|');
for (const { slot, addr, count } of page09c) {
  lines.push(`| ${slot} | 0x${addr.toString(16)} | ${count} |`);
}

const reportPath = path.join(__dirname, 'phase88-bcall-scan-report.md');
fs.writeFileSync(reportPath, lines.join('\n'));
console.log('\nReport:', reportPath);
