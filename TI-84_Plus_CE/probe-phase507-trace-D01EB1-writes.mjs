import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const romPath = path.join(__dirname, 'ROM.rom');
const rom = fs.readFileSync(romPath);

const descriptorAddresses = [
  0xD01EB1,
  0xD01EBA,
  0xD01ECC,
  0xD01ED5,
  0xD01EDE,
  0xD01EF9,
];

const rangeStart = 0xD01EB0;
const rangeEnd = 0xD01F00;

function hex(value, width) {
  return value.toString(16).toUpperCase().padStart(width, '0');
}

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => hex(byte, 2)).join(' ');
}

function patternForAddress(opcode, address) {
  return [
    opcode,
    address & 0xFF,
    (address >> 8) & 0xFF,
    (address >> 16) & 0xFF,
  ];
}

function sisPatternForAddress(opcode, address) {
  return [
    0x40,
    opcode,
    address & 0xFF,
    (address >> 8) & 0xFF,
  ];
}

function buildStorePatterns(address) {
  return [
    {
      label: `LD (${hex(address, 6)}),A`,
      bytes: patternForAddress(0x32, address),
    },
    {
      label: `LD (${hex(address, 6)}),HL`,
      bytes: patternForAddress(0x22, address),
    },
    {
      label: `LD (${hex(address, 6)}),DE`,
      bytes: [0xED, 0x53, address & 0xFF, (address >> 8) & 0xFF, (address >> 16) & 0xFF],
    },
    {
      label: `.SIS LD (${hex(address, 6)}),HL`,
      bytes: sisPatternForAddress(0x22, address),
    },
    {
      label: `.SIS LD (${hex(address, 6)}),A`,
      bytes: sisPatternForAddress(0x32, address),
    },
  ];
}

function matchesAt(offset, bytes) {
  if (offset + bytes.length > rom.length) {
    return false;
  }
  for (let i = 0; i < bytes.length; i += 1) {
    if (rom[offset + i] !== bytes[i]) {
      return false;
    }
  }
  return true;
}

function findPattern(bytes) {
  const matches = [];
  const last = rom.length - bytes.length;
  for (let offset = 0; offset <= last; offset += 1) {
    if (matchesAt(offset, bytes)) {
      matches.push(offset);
    }
  }
  return matches;
}

function readU24(offset) {
  if (offset + 2 >= rom.length) {
    return null;
  }
  return rom[offset] | (rom[offset + 1] << 8) | (rom[offset + 2] << 16);
}

function readU16WithMbase(offset) {
  if (offset + 1 >= rom.length) {
    return null;
  }
  return 0xD00000 | rom[offset] | (rom[offset + 1] << 8);
}

function decodeOne(offset) {
  if (offset >= rom.length) {
    return { size: 1, text: '<eof>' };
  }

  const op = rom[offset];
  const op1 = rom[offset + 1];

  if (op === 0x40) {
    if (op1 === 0x21) {
      return { size: 5, text: `.SIS LD HL,${hex(readU16WithMbase(offset + 2), 6)}` };
    }
    if (op1 === 0x11) {
      return { size: 5, text: `.SIS LD DE,${hex(readU16WithMbase(offset + 2), 6)}` };
    }
    if (op1 === 0x01) {
      return { size: 5, text: `.SIS LD BC,${hex(readU16WithMbase(offset + 2), 6)}` };
    }
    if (op1 === 0x22) {
      return { size: 4, text: `.SIS LD (${hex(readU16WithMbase(offset + 2), 6)}),HL` };
    }
    if (op1 === 0x32) {
      return { size: 4, text: `.SIS LD (${hex(readU16WithMbase(offset + 2), 6)}),A` };
    }
    return { size: 1, text: '.SIS prefix' };
  }

  if (op === 0x21) {
    return { size: 4, text: `LD HL,${hex(readU24(offset + 1), 6)}` };
  }
  if (op === 0x11) {
    return { size: 4, text: `LD DE,${hex(readU24(offset + 1), 6)}` };
  }
  if (op === 0x01) {
    return { size: 4, text: `LD BC,${hex(readU24(offset + 1), 6)}` };
  }
  if (op === 0x32) {
    return { size: 4, text: `LD (${hex(readU24(offset + 1), 6)}),A` };
  }
  if (op === 0x22) {
    return { size: 4, text: `LD (${hex(readU24(offset + 1), 6)}),HL` };
  }
  if (op === 0x3E) {
    return { size: 2, text: `LD A,${hex(rom[offset + 1], 2)}` };
  }
  if (op === 0x36) {
    return { size: 2, text: `LD (HL),${hex(rom[offset + 1], 2)}` };
  }
  if (op === 0x23) {
    return { size: 1, text: 'INC HL' };
  }
  if (op === 0x13) {
    return { size: 1, text: 'INC DE' };
  }
  if (op === 0x12) {
    return { size: 1, text: 'LD (DE),A' };
  }
  if (op === 0x77) {
    return { size: 1, text: 'LD (HL),A' };
  }
  if (op === 0xED) {
    const ed = rom[offset + 1];
    if (ed === 0x53) {
      return { size: 5, text: `LD (${hex(readU24(offset + 2), 6)}),DE` };
    }
    if (ed === 0xB0) {
      return { size: 2, text: 'LDIR' };
    }
    if (ed === 0xB8) {
      return { size: 2, text: 'LDDR' };
    }
    return { size: 2, text: `ED ${hex(ed, 2)}` };
  }

  return { size: 1, text: `DB ${hex(op, 2)}` };
}

function disassembleWindow(start, end, markOffset = null) {
  let offset = start;
  while (offset < end) {
    const decoded = decodeOne(offset);
    const size = Math.max(1, Math.min(decoded.size, end - offset));
    const marker = offset === markOffset ? '>>' : '  ';
    console.log(`${marker} ${hex(offset, 6)}  ${bytesToHex(rom.subarray(offset, offset + size)).padEnd(15)}  ${decoded.text}`);
    offset += size;
  }
}

function printContext(title, offset, length) {
  const start = Math.max(0, offset - 20);
  const end = Math.min(rom.length, offset + length + 10);

  console.log('');
  console.log(title);
  console.log(`match=0x${hex(offset, 6)} context=0x${hex(start, 6)}..0x${hex(end - 1, 6)}`);
  console.log(`raw: ${bytesToHex(rom.subarray(start, end))}`);
  disassembleWindow(start, end, offset);
}

function collectStoreMatches() {
  const matches = [];
  for (const address of descriptorAddresses) {
    for (const pattern of buildStorePatterns(address)) {
      for (const offset of findPattern(pattern.bytes)) {
        matches.push({
          kind: 'direct-store',
          offset,
          length: pattern.bytes.length,
          label: pattern.label,
          pattern: bytesToHex(pattern.bytes),
        });
      }
    }
  }
  return matches;
}

function instructionLoadsDescriptorAddress(offset) {
  const op = rom[offset];
  const op1 = rom[offset + 1];

  if (op === 0x21 || op === 0x11 || op === 0x01) {
    const value = readU24(offset + 1);
    if (value !== null && value >= rangeStart && value <= rangeEnd) {
      return { size: 4, reg: op === 0x21 ? 'HL' : op === 0x11 ? 'DE' : 'BC', value };
    }
  }

  if (op === 0x40 && (op1 === 0x21 || op1 === 0x11 || op1 === 0x01)) {
    const value = readU16WithMbase(offset + 2);
    if (value !== null && value >= rangeStart && value <= rangeEnd) {
      return { size: 5, reg: op1 === 0x21 ? 'HL' : op1 === 0x11 ? 'DE' : 'BC', value };
    }
  }

  return null;
}

function collectBlockCopyMatches() {
  const matches = [];
  for (let offset = 0; offset < rom.length; offset += 1) {
    const load = instructionLoadsDescriptorAddress(offset);
    if (!load) {
      continue;
    }

    const searchStart = offset + load.size;
    const searchEnd = Math.min(rom.length - 1, searchStart + 20);
    for (let cursor = searchStart; cursor <= searchEnd; cursor += 1) {
      if (rom[cursor] === 0xED && (rom[cursor + 1] === 0xB0 || rom[cursor + 1] === 0xB8)) {
        const copy = rom[cursor + 1] === 0xB0 ? 'LDIR' : 'LDDR';
        matches.push({
          kind: 'block-copy-near-descriptor',
          offset,
          length: load.size,
          label: `LD ${load.reg},${hex(load.value, 6)} then ${copy} at 0x${hex(cursor, 6)}`,
          pattern: copy,
        });
      }
    }
  }
  return matches;
}

function printMatches(sectionTitle, matches) {
  console.log('');
  console.log(`=== ${sectionTitle} ===`);
  console.log(`matches: ${matches.length}`);

  matches
    .sort((a, b) => a.offset - b.offset || a.label.localeCompare(b.label))
    .forEach((match, index) => {
      printContext(
        `[${index + 1}/${matches.length}] ${match.kind}: ${match.label} pattern=${match.pattern}`,
        match.offset,
        match.length,
      );
    });
}

console.log('Probe phase 507: trace D01EB1-D01EF9 write sites');
console.log(`ROM path: ${romPath}`);
console.log(`ROM size: 0x${hex(rom.length, 6)} bytes`);
console.log(`Descriptor starts: ${descriptorAddresses.map((address) => `0x${hex(address, 6)}`).join(', ')}`);
console.log(`Block-copy address range: 0x${hex(rangeStart, 6)}..0x${hex(rangeEnd, 6)}`);

printMatches('Direct stores to descriptor starts', collectStoreMatches());
printMatches('Descriptor-range loads followed by LDIR/LDDR within 20 bytes', collectBlockCopyMatches());
