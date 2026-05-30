import { readFileSync } from 'fs';

const ROM_PATH = new URL('./ROM.rom', import.meta.url);
const rom = readFileSync(ROM_PATH);

const TABLE_START = 0x021ab8;
const NEAR_START = 0x021ab0;
const NEAR_END = 0x021b00;
const PAGE_START = 0x021a00;
const PAGE_END = 0x021aff;

const exactPatterns = [
  { label: 'addr 0x021AB8', bytes: [0xb8, 0x1a, 0x02] },
  { label: 'addr 0x021AB0', bytes: [0xb0, 0x1a, 0x02] },
  { label: 'addr 0x021AA8', bytes: [0xa8, 0x1a, 0x02] },
  { label: 'addr 0x021AA0', bytes: [0xa0, 0x1a, 0x02] },
  { label: 'LD HL,0x021AB8', bytes: [0x21, 0xb8, 0x1a, 0x02] },
  { label: 'LD IX,0x021AB8', bytes: [0xdd, 0x21, 0xb8, 0x1a, 0x02] },
  { label: 'LD IY,0x021AB8', bytes: [0xfd, 0x21, 0xb8, 0x1a, 0x02] },
  { label: 'LD HL,0x021AB0', bytes: [0x21, 0xb0, 0x1a, 0x02] },
  { label: 'LD IX,0x021AB0', bytes: [0xdd, 0x21, 0xb0, 0x1a, 0x02] },
  { label: 'LD IY,0x021AB0', bytes: [0xfd, 0x21, 0xb0, 0x1a, 0x02] },
  { label: 'LD HL,0x021AA8', bytes: [0x21, 0xa8, 0x1a, 0x02] },
  { label: 'LD IX,0x021AA8', bytes: [0xdd, 0x21, 0xa8, 0x1a, 0x02] },
  { label: 'LD IY,0x021AA8', bytes: [0xfd, 0x21, 0xa8, 0x1a, 0x02] },
  { label: 'LD HL,0x021AA0', bytes: [0x21, 0xa0, 0x1a, 0x02] },
  { label: 'LD IX,0x021AA0', bytes: [0xdd, 0x21, 0xa0, 0x1a, 0x02] },
  { label: 'LD IY,0x021AA0', bytes: [0xfd, 0x21, 0xa0, 0x1a, 0x02] },
];

const loadOpcodes = new Map([
  [0x21, 'LD HL,nnn'],
  [0x01, 'LD BC,nnn'],
  [0x11, 'LD DE,nnn'],
  [0xcd, 'CALL nnn'],
  [0xc3, 'JP nnn'],
]);

const prefixedLoadOpcodes = new Map([
  ['dd21', 'LD IX,nnn'],
  ['fd21', 'LD IY,nnn'],
]);

function hex(value, width = 6) {
  return `0x${value.toString(16).toUpperCase().padStart(width, '0')}`;
}

function byteHex(value) {
  return value.toString(16).toUpperCase().padStart(2, '0');
}

function bytesToHex(bytes) {
  return Array.from(bytes, byteHex).join(' ');
}

function read24(offset) {
  return rom[offset] | (rom[offset + 1] << 8) | (rom[offset + 2] << 16);
}

function contextBytes(offset, before = 16, after = 16) {
  const start = Math.max(0, offset - before);
  const end = Math.min(rom.length, offset + after + 1);
  return {
    start,
    end: end - 1,
    bytes: rom.subarray(start, end),
  };
}

function printContext(offset, before = 16, after = 16) {
  const context = contextBytes(offset, before, after);
  console.log(`    context ${hex(context.start)}..${hex(context.end)}: ${bytesToHex(context.bytes)}`);
}

function patternMatchesAt(offset, pattern) {
  if (offset + pattern.length > rom.length) return false;
  for (let i = 0; i < pattern.length; i += 1) {
    if (rom[offset + i] !== pattern[i]) return false;
  }
  return true;
}

function findPattern(pattern) {
  const matches = [];
  for (let offset = 0; offset <= rom.length - pattern.length; offset += 1) {
    if (patternMatchesAt(offset, pattern)) matches.push(offset);
  }
  return matches;
}

function findIndirectJumpsNear(offset, radius = 64) {
  const start = Math.max(0, offset - radius);
  const end = Math.min(rom.length - 1, offset + radius);
  const jumps = [];

  for (let cursor = start; cursor <= end; cursor += 1) {
    if (rom[cursor] === 0xe9) {
      jumps.push({ offset: cursor, mnemonic: 'JP (HL)', bytes: 'E9' });
    }

    if (cursor + 1 <= end && rom[cursor] === 0xdd && rom[cursor + 1] === 0xe9) {
      jumps.push({ offset: cursor, mnemonic: 'JP (IX)', bytes: 'DD E9' });
    }

    if (cursor + 1 <= end && rom[cursor] === 0xfd && rom[cursor + 1] === 0xe9) {
      jumps.push({ offset: cursor, mnemonic: 'JP (IY)', bytes: 'FD E9' });
    }
  }

  return jumps;
}

function findPageAddressLoads() {
  const matches = [];

  for (let offset = 0; offset <= rom.length - 4; offset += 1) {
    const opcode = rom[offset];
    const directMnemonic = loadOpcodes.get(opcode);

    if (directMnemonic && rom[offset + 2] === 0x1a && rom[offset + 3] === 0x02) {
      const address = read24(offset + 1);
      if (address >= PAGE_START && address <= PAGE_END) {
        matches.push({
          offset,
          mnemonic: directMnemonic,
          address,
          bytes: bytesToHex(rom.subarray(offset, offset + 4)),
        });
      }
    }

    if (offset <= rom.length - 5) {
      const prefixKey = `${byteHex(rom[offset]).toLowerCase()}${byteHex(rom[offset + 1]).toLowerCase()}`;
      const prefixedMnemonic = prefixedLoadOpcodes.get(prefixKey);

      if (prefixedMnemonic && rom[offset + 3] === 0x1a && rom[offset + 4] === 0x02) {
        const address = read24(offset + 2);
        if (address >= PAGE_START && address <= PAGE_END) {
          matches.push({
            offset,
            mnemonic: prefixedMnemonic,
            address,
            bytes: bytesToHex(rom.subarray(offset, offset + 5)),
          });
        }
      }
    }
  }

  return matches;
}

function uniqueByOffsetAndLabel(matches) {
  const seen = new Set();
  const unique = [];

  for (const match of matches) {
    const key = `${match.offset}:${match.label ?? match.mnemonic}:${match.address ?? ''}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(match);
    }
  }

  return unique;
}

console.log('Probe: phase469 jump table dispatcher search');
console.log(`ROM: ${ROM_PATH.pathname}`);
console.log(`Size: ${rom.length} bytes`);
console.log(`Target table: ${hex(TABLE_START)}`);
console.log(`Nearby range: ${hex(NEAR_START)}..${hex(NEAR_END)}`);
console.log('');

const exactMatches = [];

console.log('== Exact and nearby base address patterns ==');
for (const pattern of exactPatterns) {
  const matches = findPattern(pattern.bytes);
  console.log(`${pattern.label} (${bytesToHex(pattern.bytes)}): ${matches.length} match(es)`);

  for (const offset of matches) {
    exactMatches.push({ offset, label: pattern.label });
    console.log(`  ${hex(offset)}`);
    printContext(offset);

    const jumps = findIndirectJumpsNear(offset);
    if (jumps.length > 0) {
      for (const jump of jumps) {
        console.log(`    nearby indirect jump ${jump.mnemonic} at ${hex(jump.offset)} (${jump.bytes})`);
      }
    } else {
      console.log('    nearby indirect jump: none within +/-64 bytes');
    }
  }
}
console.log('');

console.log('== Broad 0x021Axx address-load references ==');
const pageLoadMatches = uniqueByOffsetAndLabel(findPageAddressLoads());
console.log(`Recognized address-load/CALL/JP references to ${hex(PAGE_START)}..${hex(PAGE_END)}: ${pageLoadMatches.length}`);

for (const match of pageLoadMatches) {
  console.log(`  ${hex(match.offset)}: ${match.mnemonic} ${hex(match.address)} (${match.bytes})`);
  printContext(match.offset);

  const jumps = findIndirectJumpsNear(match.offset);
  if (jumps.length > 0) {
    for (const jump of jumps) {
      console.log(`    nearby indirect jump ${jump.mnemonic} at ${hex(jump.offset)} (${jump.bytes})`);
    }
  } else {
    console.log('    nearby indirect jump: none within +/-64 bytes');
  }
}
console.log('');

console.log('== Raw 0x021Axx byte-pattern references ==');
const rawPageMatches = [];
for (let offset = 0; offset <= rom.length - 3; offset += 1) {
  if (rom[offset + 1] === 0x1a && rom[offset + 2] === 0x02) {
    const address = read24(offset);
    if (address >= PAGE_START && address <= PAGE_END) {
      rawPageMatches.push({ offset, address });
    }
  }
}

console.log(`Raw little-endian 0x021Axx triples found anywhere: ${rawPageMatches.length}`);
for (const match of rawPageMatches) {
  console.log(`  ${hex(match.offset)}: ${hex(match.address)} (${bytesToHex(rom.subarray(match.offset, match.offset + 3))})`);
  printContext(match.offset);
}
console.log('');

const allReferenceOffsets = uniqueByOffsetAndLabel([
  ...exactMatches,
  ...pageLoadMatches,
  ...rawPageMatches.map((match) => ({ ...match, label: 'raw 0x021Axx' })),
]).map((match) => match.offset);

const allNearbyJumps = [];
for (const offset of allReferenceOffsets) {
  for (const jump of findIndirectJumpsNear(offset)) {
    allNearbyJumps.push({ reference: offset, ...jump });
  }
}

const uniqueNearbyJumps = [];
const seenJumps = new Set();
for (const jump of allNearbyJumps) {
  const key = `${jump.reference}:${jump.offset}:${jump.mnemonic}`;
  if (!seenJumps.has(key)) {
    seenJumps.add(key);
    uniqueNearbyJumps.push(jump);
  }
}

console.log('== Summary ==');
console.log(`Exact/nearby pattern matches: ${exactMatches.length}`);
console.log(`Broad recognized 0x021Axx load/CALL/JP references: ${pageLoadMatches.length}`);
console.log(`Raw 0x021Axx triples: ${rawPageMatches.length}`);
console.log(`Indirect jumps within +/-64 bytes of references: ${uniqueNearbyJumps.length}`);

if (uniqueNearbyJumps.length > 0) {
  for (const jump of uniqueNearbyJumps) {
    console.log(`  ref ${hex(jump.reference)} -> ${jump.mnemonic} at ${hex(jump.offset)} (${jump.bytes})`);
  }
}
