// probe-phase314-scrapmem.mjs
// Scans ROM.rom for all references to scrapMem (0xD02AD7-0xD02AD9)
// and categorizes them by ROM region, access type, and safety context.

import fs from 'fs';

const rom = fs.readFileSync('TI-84_Plus_CE/ROM.rom');
console.log(`ROM size: ${rom.length} bytes`);
console.log();

// --- Scan for all 3-byte address patterns targeting D02AD7, D02AD8, D02AD9 ---

const refs = [];

for (const targetLow of [0xD7, 0xD8, 0xD9]) {
  const targetAddr = targetLow | (0x2A << 8) | (0xD0 << 16);
  const targetHex = '0x' + targetAddr.toString(16).toUpperCase();

  for (let i = 0; i < rom.length - 2; i++) {
    if (rom[i] !== targetLow || rom[i + 1] !== 0x2A || rom[i + 2] !== 0xD0) continue;

    const b1 = i >= 1 ? rom[i - 1] : 0;
    const b2 = i >= 2 ? rom[i - 2] : 0;

    let type = 'unknown';
    let instrStart = i;

    // Decode the instruction opcode that precedes the 3-byte address
    if (b1 === 0x32) { type = 'write8(a)';    instrStart = i - 1; }
    else if (b1 === 0x3A) { type = 'read8(a)';     instrStart = i - 1; }
    else if (b1 === 0x22) { type = 'write24(hl)';  instrStart = i - 1; }
    else if (b1 === 0x2A) { type = 'read24(hl)';   instrStart = i - 1; }
    else if (b2 === 0xED && b1 === 0x43) { type = 'write24(bc)'; instrStart = i - 2; }
    else if (b2 === 0xED && b1 === 0x4B) { type = 'read24(bc)';  instrStart = i - 2; }
    else if (b2 === 0xED && b1 === 0x53) { type = 'write24(de)'; instrStart = i - 2; }
    else if (b2 === 0xED && b1 === 0x5B) { type = 'read24(de)';  instrStart = i - 2; }
    else if (b2 === 0xED && b1 === 0x73) { type = 'write24(sp)'; instrStart = i - 2; }
    else if (b2 === 0xED && b1 === 0x7B) { type = 'read24(sp)';  instrStart = i - 2; }
    else if (b2 === 0xDD && b1 === 0x22) { type = 'write24(ix)'; instrStart = i - 2; }
    else if (b2 === 0xDD && b1 === 0x2A) { type = 'read24(ix)';  instrStart = i - 2; }
    else if (b2 === 0xFD && b1 === 0x22) { type = 'write24(iy)'; instrStart = i - 2; }
    else if (b2 === 0xFD && b1 === 0x2A) { type = 'read24(iy)';  instrStart = i - 2; }

    const isWrite = type.startsWith('write');
    const isRead = type.startsWith('read');

    refs.push({
      instrAddr: instrStart,
      addrOffset: i,
      target: targetHex,
      type,
      isWrite,
      isRead,
    });
  }
}

refs.sort((a, b) => a.instrAddr - b.instrAddr);

// --- Categorize ---

const UTIL_LO = 0x04C800;
const UTIL_HI = 0x04CA40;
const ISR_RANGES = [
  [0x000038, 0x000060],  // RST 38h (mode 1 interrupt)
  [0x000066, 0x000080],  // NMI
  [0x001401, 0x001500],  // keyboard scan ISR chain
];

function classify(addr) {
  if (addr >= UTIL_LO && addr <= UTIL_HI) return 'utility';
  for (const [lo, hi] of ISR_RANGES) {
    if (addr >= lo && addr <= hi) return 'isr';
  }
  return 'other';
}

const categories = { utility: [], isr: [], other: [] };
for (const r of refs) {
  categories[classify(r.instrAddr)].push(r);
}

// --- Print summary ---

console.log('=== scrapMem (0xD02AD7) Reference Summary ===');
console.log(`Total references: ${refs.length}`);
console.log(`  Utility family (0x04C800-0x04CA40): ${categories.utility.length}`);
console.log(`  ISR context: ${categories.isr.length}`);
console.log(`  Other ROM functions: ${categories.other.length}`);
console.log();

// --- Break down by region ---

function hexAddr(n) {
  return '0x' + n.toString(16).padStart(6, '0');
}

function regionLabel(addr) {
  if (addr < 0x001000) return 'OS kernel/init';
  if (addr < 0x002000) return 'syscall/event dispatch';
  if (addr < 0x008500) return 'math/expression eval';
  if (addr < 0x030000) return 'token/parser';
  if (addr < 0x03E000) return 'string/conversion';
  if (addr < 0x041000) return 'FP arithmetic';
  if (addr < 0x047000) return 'misc OS';
  if (addr < 0x04C800) return 'soft-float library';
  if (addr < 0x04CA41) return 'utility family';
  if (addr < 0x050000) return 'FP conversion';
  if (addr < 0x080000) return 'USB/cert';
  if (addr < 0x090000) return 'cert/crypto';
  return 'flash/archive';
}

console.log('=== Other ROM References (non-utility, non-ISR) ===');
const regionGroups = {};
for (const r of categories.other) {
  const label = regionLabel(r.instrAddr);
  if (!regionGroups[label]) regionGroups[label] = [];
  regionGroups[label].push(r);
}

for (const [label, group] of Object.entries(regionGroups)) {
  const writes = group.filter(r => r.isWrite).length;
  const reads = group.filter(r => r.isRead).length;
  console.log(`  ${label}: ${group.length} refs (${writes}W/${reads}R)`);
  for (const r of group) {
    console.log(`    ${hexAddr(r.instrAddr)}  ${r.type.padEnd(16)}  ${r.target}`);
  }
}

console.log();
console.log('=== ISR References ===');
for (const r of categories.isr) {
  console.log(`  ${hexAddr(r.instrAddr)}  ${r.type.padEnd(16)}  ${r.target}`);
}

console.log();
console.log('=== Safety Assessment ===');
const isrWrites = categories.isr.filter(r => r.isWrite);
const isrReads = categories.isr.filter(r => r.isRead);
console.log(`ISR writes to scrapMem: ${isrWrites.length}`);
console.log(`ISR reads from scrapMem: ${isrReads.length}`);
if (isrWrites.length > 0) {
  console.log('WARNING: ISR can clobber scrapMem during utility function execution!');
  console.log('  ISR write locations:');
  for (const r of isrWrites) {
    console.log(`    ${hexAddr(r.instrAddr)}  ${r.type}  ${r.target}`);
  }
  console.log('  Mitigation: utility functions must disable interrupts (DI) or');
  console.log('  the OS must ensure ISR path only runs when scrapMem is not in use.');
} else {
  console.log('ISR does not write to scrapMem - safe from ISR clobbering.');
}
