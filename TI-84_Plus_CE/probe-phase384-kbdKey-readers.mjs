// probe-phase384-kbdKey-readers.mjs
// Scan ROM for all instructions referencing kbdKey (0xD0058C) and surrounding keyboard state block

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const romPath = join(__dirname, 'ROM.rom');
const rom = readFileSync(romPath);

console.log(`ROM loaded: ${rom.length} bytes (0x${rom.length.toString(16)})`);
console.log('');

// Keyboard state block addresses and their meanings
const kbdAddresses = [
  { addr: 0xD00587, name: 'scan code' },
  { addr: 0xD00588, name: 'last key' },
  { addr: 0xD00589, name: 'previous key' },
  { addr: 0xD0058A, name: 'repeat counter' },
  { addr: 0xD0058B, name: 'debounce counter' },
  { addr: 0xD0058C, name: 'kbdKey' },
  { addr: 0xD0058D, name: 'kbd+0x06' },
  { addr: 0xD0058E, name: 'kbd+0x07' },
  { addr: 0xD0058F, name: 'kbd+0x08' },
];

// eZ80 opcode classification for 3-byte absolute address instructions
function classifyOpcode(rom, pos) {
  if (pos < 1) return { op: '??', type: 'UNKNOWN' };
  const prevByte = rom[pos - 1];

  // Standard LD with absolute address (eZ80 long mode)
  // These are the .LIL suffix variants (3-byte address)
  switch (prevByte) {
    case 0x3A: return { op: `LD A,(nn)`, type: 'READ', byte: prevByte };
    case 0x32: return { op: `LD (nn),A`, type: 'WRITE', byte: prevByte };
    case 0x2A: return { op: `LD HL,(nn)`, type: 'READ', byte: prevByte };
    case 0x22: return { op: `LD (nn),HL`, type: 'WRITE', byte: prevByte };
    default:
      break;
  }

  // Check 2 bytes back for prefixed instructions
  if (pos >= 2) {
    const prev2 = rom[pos - 2];
    // ED-prefixed instructions
    if (prev2 === 0xED) {
      switch (prevByte) {
        case 0x4B: return { op: `LD BC,(nn)`, type: 'READ', byte: prevByte, prefix: 0xED };
        case 0x5B: return { op: `LD DE,(nn)`, type: 'READ', byte: prevByte, prefix: 0xED };
        case 0x6B: return { op: `LD HL,(nn) [ED]`, type: 'READ', byte: prevByte, prefix: 0xED };
        case 0x7B: return { op: `LD SP,(nn)`, type: 'READ', byte: prevByte, prefix: 0xED };
        case 0x43: return { op: `LD (nn),BC`, type: 'WRITE', byte: prevByte, prefix: 0xED };
        case 0x53: return { op: `LD (nn),DE`, type: 'WRITE', byte: prevByte, prefix: 0xED };
        case 0x63: return { op: `LD (nn),HL [ED]`, type: 'WRITE', byte: prevByte, prefix: 0xED };
        case 0x73: return { op: `LD (nn),SP`, type: 'WRITE', byte: prevByte, prefix: 0xED };
        default:
          break;
      }
    }
    // DD-prefixed (IX)
    if (prev2 === 0xDD) {
      switch (prevByte) {
        case 0x2A: return { op: `LD IX,(nn)`, type: 'READ', byte: prevByte, prefix: 0xDD };
        case 0x22: return { op: `LD (nn),IX`, type: 'WRITE', byte: prevByte, prefix: 0xDD };
        default:
          break;
      }
    }
    // FD-prefixed (IY)
    if (prev2 === 0xFD) {
      switch (prevByte) {
        case 0x2A: return { op: `LD IY,(nn)`, type: 'READ', byte: prevByte, prefix: 0xFD };
        case 0x22: return { op: `LD (nn),IY`, type: 'WRITE', byte: prevByte, prefix: 0xFD };
        default:
          break;
      }
    }
  }

  // Check for CALL nn and JP nn (these reference code addresses, but could be coincidental)
  switch (prevByte) {
    case 0xCD: return { op: `CALL nn`, type: 'CALL?', byte: prevByte };
    case 0xC3: return { op: `JP nn`, type: 'JUMP?', byte: prevByte };
    case 0xC2: return { op: `JP NZ,nn`, type: 'JUMP?', byte: prevByte };
    case 0xCA: return { op: `JP Z,nn`, type: 'JUMP?', byte: prevByte };
    case 0xD2: return { op: `JP NC,nn`, type: 'JUMP?', byte: prevByte };
    case 0xDA: return { op: `JP C,nn`, type: 'JUMP?', byte: prevByte };
    case 0xC4: return { op: `CALL NZ,nn`, type: 'CALL?', byte: prevByte };
    case 0xCC: return { op: `CALL Z,nn`, type: 'CALL?', byte: prevByte };
    case 0xD4: return { op: `CALL NC,nn`, type: 'CALL?', byte: prevByte };
    case 0xDC: return { op: `CALL C,nn`, type: 'CALL?', byte: prevByte };
    default:
      break;
  }

  return { op: `?? (prev=0x${prevByte.toString(16).padStart(2, '0')})`, type: 'OTHER', byte: prevByte };
}

function hexDump(buf, offset, length) {
  const start = Math.max(0, offset);
  const end = Math.min(buf.length, offset + length);
  const bytes = [];
  for (let i = start; i < end; i++) {
    bytes.push(buf[i].toString(16).padStart(2, '0'));
  }
  return bytes.join(' ');
}

// Scan for all references
console.log('=== Scanning ROM for keyboard state block references ===');
console.log('');

const allResults = new Map();

for (const { addr, name } of kbdAddresses) {
  const lo = addr & 0xFF;
  const mid = (addr >> 8) & 0xFF;
  const hi = (addr >> 16) & 0xFF;

  const hits = [];

  for (let i = 0; i < rom.length - 2; i++) {
    if (rom[i] === lo && rom[i + 1] === mid && rom[i + 2] === hi) {
      const info = classifyOpcode(rom, i);
      hits.push({
        romOffset: i,
        ...info,
      });
    }
  }

  allResults.set(addr, { name, hits });
}

// Summary table
console.log('--- Summary: references per address ---');
console.log('');
console.log('Address      Name               Total  READ  WRITE  CALL/JP  OTHER');
console.log('-'.repeat(75));

for (const [addr, { name, hits }] of allResults) {
  const reads = hits.filter(h => h.type === 'READ').length;
  const writes = hits.filter(h => h.type === 'WRITE').length;
  const calls = hits.filter(h => h.type === 'CALL?' || h.type === 'JUMP?').length;
  const other = hits.filter(h => h.type === 'OTHER' || h.type === 'UNKNOWN').length;
  console.log(
    `0x${addr.toString(16).toUpperCase().padStart(6, '0')}   ${name.padEnd(19)} ${String(hits.length).padStart(5)}  ${String(reads).padStart(4)}  ${String(writes).padStart(5)}  ${String(calls).padStart(7)}  ${String(other).padStart(5)}`
  );
}

console.log('');

// Detailed listing per address
for (const [addr, { name, hits }] of allResults) {
  if (hits.length === 0) continue;
  console.log(`=== 0x${addr.toString(16).toUpperCase()} (${name}) — ${hits.length} references ===`);
  console.log('');
  for (const hit of hits) {
    const romHex = `0x${hit.romOffset.toString(16).padStart(6, '0')}`;
    const prefixStr = hit.prefix ? `[${hit.prefix.toString(16).toUpperCase()}] ` : '';
    console.log(`  ${romHex}: ${prefixStr}${hit.op}  [${hit.type}]`);
  }
  console.log('');
}

// Top 5 most interesting kbdKey (0xD0058C) references with context
const kbdKeyHits = allResults.get(0xD0058C).hits;

// Prioritize: READs and WRITEs first, then others
const prioritized = [
  ...kbdKeyHits.filter(h => h.type === 'READ'),
  ...kbdKeyHits.filter(h => h.type === 'WRITE'),
  ...kbdKeyHits.filter(h => h.type !== 'READ' && h.type !== 'WRITE'),
];

const top5 = prioritized.slice(0, 5);

console.log('=== Top 5 most interesting kbdKey (0xD0058C) references with context ===');
console.log('');

for (const hit of top5) {
  const patternOffset = hit.romOffset;
  const instrStart = patternOffset - (hit.prefix ? 2 : 1);
  const contextStart = patternOffset - 16;
  const contextEnd = patternOffset + 16 + 3; // +3 for the address bytes themselves

  console.log(`--- ROM offset 0x${patternOffset.toString(16).padStart(6, '0')} | instruction at ~0x${instrStart.toString(16).padStart(6, '0')} | ${hit.op} [${hit.type}] ---`);
  console.log('');

  // Show hex dump with marker
  const dumpStart = Math.max(0, contextStart);
  const dumpEnd = Math.min(rom.length, contextEnd);

  // Print in rows of 16
  for (let row = dumpStart; row < dumpEnd; row += 16) {
    const rowEnd = Math.min(row + 16, dumpEnd);
    const addrStr = `0x${row.toString(16).padStart(6, '0')}:`;
    const hexParts = [];
    for (let j = row; j < rowEnd; j++) {
      const byteHex = rom[j].toString(16).padStart(2, '0');
      // Mark the 3 pattern bytes and the opcode byte
      if (j >= patternOffset && j < patternOffset + 3) {
        hexParts.push(`[${byteHex}]`);
      } else if (j === instrStart) {
        hexParts.push(`*${byteHex}*`);
      } else {
        hexParts.push(` ${byteHex} `);
      }
    }
    console.log(`  ${addrStr} ${hexParts.join('')}`);
  }
  console.log('');
}

console.log('Done.');
