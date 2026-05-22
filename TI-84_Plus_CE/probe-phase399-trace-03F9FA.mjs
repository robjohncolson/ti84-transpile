// Probe: Trace all callers of 0x03F9FA (key result producer)
// Searches entire ROM for CALL/JP/conditional variants targeting 0x03F9FA

import { readFileSync } from 'fs';

const rom = readFileSync('TI-84_Plus_CE/ROM.rom');
const TARGET = 0x03F9FA;
const targetBytes = [0xFA, 0xF9, 0x03]; // little-endian 24-bit address

function hexDump(buf, offset, len) {
  const bytes = [];
  for (let i = 0; i < len && offset + i < buf.length; i++) {
    bytes.push(buf[offset + i].toString(16).padStart(2, '0'));
  }
  return bytes.join(' ');
}

function searchPattern(rom, prefixBytes, targetBytes, label) {
  const results = [];
  const pattern = [...prefixBytes, ...targetBytes];
  for (let i = 0; i <= rom.length - pattern.length; i++) {
    let match = true;
    for (let j = 0; j < pattern.length; j++) {
      if (rom[i + j] !== pattern[j]) { match = false; break; }
    }
    if (match) {
      results.push({ addr: i, label });
    }
  }
  return results;
}

console.log(`=== Tracing callers of 0x${TARGET.toString(16).toUpperCase()} ===\n`);

// CALL nn (CD)
let allResults = [];
allResults.push(...searchPattern(rom, [0xCD], targetBytes, 'CALL nn'));

// JP nn (C3)
allResults.push(...searchPattern(rom, [0xC3], targetBytes, 'JP nn'));

// JP cc,nn: C2/CA/D2/DA/E2/EA/F2/FA
const jpCcOpcodes = [0xC2, 0xCA, 0xD2, 0xDA, 0xE2, 0xEA, 0xF2, 0xFA];
const ccNames = ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'];
for (let idx = 0; idx < jpCcOpcodes.length; idx++) {
  allResults.push(...searchPattern(rom, [jpCcOpcodes[idx]], targetBytes, `JP ${ccNames[idx]},nn`));
}

// CALL cc,nn: C4/CC/D4/DC/E4/EC/F4/FC
const callCcOpcodes = [0xC4, 0xCC, 0xD4, 0xDC, 0xE4, 0xEC, 0xF4, 0xFC];
for (let idx = 0; idx < callCcOpcodes.length; idx++) {
  allResults.push(...searchPattern(rom, [callCcOpcodes[idx]], targetBytes, `CALL ${ccNames[idx]},nn`));
}

// Indirect: LD HL,nn (21) and LD DE,nn (11)
allResults.push(...searchPattern(rom, [0x21], targetBytes, 'LD HL,nn'));
allResults.push(...searchPattern(rom, [0x11], targetBytes, 'LD DE,nn'));

// Sort by address
allResults.sort((a, b) => a.addr - b.addr);

console.log(`Found ${allResults.length} references to 0x${TARGET.toString(16).toUpperCase()}:\n`);

for (const r of allResults) {
  const addr = r.addr;
  console.log(`--- ${r.label} at 0x${addr.toString(16).padStart(6, '0').toUpperCase()} ---`);
  // Show 32 bytes before the call site for context
  const contextStart = Math.max(0, addr - 32);
  console.log(`  Context (32 bytes before):`);
  console.log(`    0x${contextStart.toString(16).padStart(6, '0').toUpperCase()}: ${hexDump(rom, contextStart, 32)}`);
  // Show the instruction itself + a few bytes after
  console.log(`  Instruction + after:`);
  console.log(`    0x${addr.toString(16).padStart(6, '0').toUpperCase()}: ${hexDump(rom, addr, 16)}`);
  console.log('');
}

// Disassemble 0x03F9FA itself (64 bytes)
console.log(`\n=== Hex dump of 0x${TARGET.toString(16).toUpperCase()} (64 bytes) ===`);
for (let i = 0; i < 64; i += 16) {
  const addr = TARGET + i;
  console.log(`  0x${addr.toString(16).padStart(6, '0').toUpperCase()}: ${hexDump(rom, addr, 16)}`);
}

console.log('\n=== Done ===');
