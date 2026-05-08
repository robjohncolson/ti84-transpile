/**
 * probe-phase251-cxmain-callers.mjs
 *
 * Static ROM scan to find all callers of the cxMain dispatch chain.
 * Searches for CALL/JP instructions targeting key addresses in the
 * event loop / home-screen handler path.
 */

import { readFileSync } from 'fs';

const rom = readFileSync('TI-84_Plus_CE/ROM.rom');
const romLen = rom.length;

console.log(`ROM loaded: ${romLen} bytes (0x${romLen.toString(16)})`);

// --- Section 1: Search for CALL/JP to specific targets ---

const targets = [
  { name: 'JP(HL) dispatch site', addr: 0x0585D3 },
  { name: 'pre-handler entry',    addr: 0x058241 },
  { name: 'cxMain direct',        addr: 0x0585E9 },
  { name: 'home body [3]',        addr: 0x0582BC },
];

// CALL nn = CD lo mid hi
// JP nn   = C3 lo mid hi
// JP cc   = C2/CA/D2/DA/E2/EA/F2/FA lo mid hi
const callOpcodes = [0xCD];
const jpOpcodes = [0xC3, 0xC2, 0xCA, 0xD2, 0xDA, 0xE2, 0xEA, 0xF2, 0xFA];
const allOpcodes = new Set([...callOpcodes, ...jpOpcodes]);

function opName(byte) {
  if (byte === 0xCD) return 'CALL';
  if (byte === 0xC3) return 'JP';
  const ccNames = {
    0xC2: 'JP NZ', 0xCA: 'JP Z', 0xD2: 'JP NC', 0xDA: 'JP C',
    0xE2: 'JP PO', 0xEA: 'JP PE', 0xF2: 'JP P', 0xFA: 'JP M',
  };
  return ccNames[byte] || `JP cc(0x${byte.toString(16)})`;
}

function hex(n, pad = 6) {
  return '0x' + n.toString(16).padStart(pad, '0');
}

console.log('\n========================================');
console.log('SECTION 1: CALL/JP to key targets');
console.log('========================================');

for (const { name, addr } of targets) {
  const lo  = addr & 0xFF;
  const mid = (addr >> 8) & 0xFF;
  const hi  = (addr >> 16) & 0xFF;
  let count = 0;

  console.log(`\n--- ${name} (${hex(addr)}) ---`);

  for (let i = 0; i < romLen - 3; i++) {
    if (allOpcodes.has(rom[i]) &&
        rom[i + 1] === lo &&
        rom[i + 2] === mid &&
        rom[i + 3] === hi) {
      console.log(`  ${hex(i)}: ${opName(rom[i])} ${hex(addr)}`);
      count++;
    }
  }

  if (count === 0) {
    console.log('  (none found)');
  } else {
    console.log(`  total: ${count}`);
  }
}

// --- Section 2: LD HL, dispatch table pointer ---

console.log('\n========================================');
console.log('SECTION 2: LD HL,imm24 pointing to dispatch area');
console.log('========================================');

// LD HL,imm24 = 21 lo mid hi
const ldTargets = [
  { name: 'LD HL,0x0585D3', lo: 0xD3, mid: 0x85, hi: 0x05 },
  { name: 'LD HL,0x0585D4', lo: 0xD4, mid: 0x85, hi: 0x05 },
  { name: 'LD HL,0x0585E9', lo: 0xE9, mid: 0x85, hi: 0x05 },
  { name: 'LD HL,0x058241', lo: 0x41, mid: 0x82, hi: 0x05 },
  { name: 'LD HL,0x0582BC', lo: 0xBC, mid: 0x82, hi: 0x05 },
];

for (const { name, lo, mid, hi } of ldTargets) {
  let count = 0;
  console.log(`\n--- ${name} ---`);

  for (let i = 0; i < romLen - 3; i++) {
    if (rom[i] === 0x21 && rom[i + 1] === lo && rom[i + 2] === mid && rom[i + 3] === hi) {
      console.log(`  ${hex(i)}: ${name}`);
      count++;
    }
  }

  if (count === 0) {
    console.log('  (none found)');
  } else {
    console.log(`  total: ${count}`);
  }
}

// --- Section 3: Broader scan for CALL/JP into 0x058240-0x0585FF ---

console.log('\n========================================');
console.log('SECTION 3: All CALL/JP into range 0x058240-0x0585FF');
console.log('========================================');

const rangeStart = 0x058240;
const rangeEnd   = 0x0585FF;
const hits = [];

for (let i = 0; i < romLen - 3; i++) {
  if (allOpcodes.has(rom[i])) {
    const target = rom[i + 1] | (rom[i + 2] << 8) | (rom[i + 3] << 16);
    if (target >= rangeStart && target <= rangeEnd) {
      hits.push({ from: i, op: rom[i], target });
    }
  }
}

// Group by target
const byTarget = new Map();
for (const hit of hits) {
  const key = hit.target;
  if (!byTarget.has(key)) byTarget.set(key, []);
  byTarget.get(key).push(hit);
}

// Sort by target address
const sortedTargets = [...byTarget.keys()].sort((a, b) => a - b);

for (const target of sortedTargets) {
  const callers = byTarget.get(target);
  console.log(`\n  Target ${hex(target)} (${callers.length} reference${callers.length > 1 ? 's' : ''}):`);
  for (const c of callers) {
    console.log(`    ${hex(c.from)}: ${opName(c.op)} ${hex(c.target)}`);
  }
}

console.log(`\nTotal references into range: ${hits.length}`);

// --- Section 4: Search for indirect references via LD instructions ---

console.log('\n========================================');
console.log('SECTION 4: 3-byte LE patterns for key addresses (any context)');
console.log('========================================');

// Search for raw 3-byte LE patterns of our key addresses appearing anywhere
// (could be in data tables, LD instructions, etc.)
const keyAddrs = [
  { name: 'JP(HL) dispatch', addr: 0x0585D3 },
  { name: 'cxMain',          addr: 0x0585E9 },
  { name: 'pre-handler',     addr: 0x058241 },
  { name: 'home body',       addr: 0x0582BC },
];

for (const { name, addr } of keyAddrs) {
  const lo  = addr & 0xFF;
  const mid = (addr >> 8) & 0xFF;
  const hi  = (addr >> 16) & 0xFF;
  let count = 0;

  console.log(`\n--- Raw bytes for ${name} (${hex(addr)}): ${hex(lo,2)} ${hex(mid,2)} ${hex(hi,2)} ---`);

  for (let i = 0; i < romLen - 2; i++) {
    if (rom[i] === lo && rom[i + 1] === mid && rom[i + 2] === hi) {
      // Show context: the byte before (if any) and the match
      const before = i > 0 ? hex(rom[i - 1], 2) : '  ';
      console.log(`  ${hex(i)}: [${before}] ${hex(lo,2)} ${hex(mid,2)} ${hex(hi,2)}  (prev byte at ${hex(i-1)})`);
      count++;
    }
  }

  if (count === 0) {
    console.log('  (none found)');
  } else {
    console.log(`  total: ${count} occurrences`);
  }
}

// --- Summary ---

console.log('\n========================================');
console.log('SUMMARY');
console.log('========================================');
console.log(`ROM size: ${romLen} bytes`);
console.log(`Key addresses searched:`);
for (const { name, addr } of targets) {
  console.log(`  ${name}: ${hex(addr)}`);
}
console.log(`Broad range scan: ${hex(rangeStart)}-${hex(rangeEnd)} found ${hits.length} references`);
console.log('\nDone.');
