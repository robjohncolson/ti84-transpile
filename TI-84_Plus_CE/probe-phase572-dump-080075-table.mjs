import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TABLE_ADDR = 0x080075;
const TABLE_LEN = 11;
const ROM_BASE = 0x000000;

const PREFIX_CLASSES = new Map([
  [0x5c, 'List prefix'],
  [0x5d, 'Matrix prefix'],
  [0x5e, 'Y-var prefix'],
  [0x60, 'Pic prefix'],
  [0x61, 'GDB prefix'],
  [0x62, 'String prefix'],
  [0x63, 'Statistics prefix'],
  [0x7e, 'Window/Table prefix'],
  [0xbb, 'Extended tokens'],
  [0xaa, 'Statistics commands'],
  [0xef, 'Graph format tokens'],
]);

const TOKEN_NAME_HINTS = [
  'L1', 'L2', 'L3', 'L4', 'L5', 'L6',
  '[A]', '[B]', '[C]', '[D]',
  'Y1', 'Y2', 'Y3', 'Y4',
  'Pic1', 'Pic2', 'Pic3',
  'GDB1', 'GDB2', 'GDB3',
  'Str1', 'Str2', 'Str3',
  'RegEQ',
  'Xmin', 'Xmax', 'Ymin', 'Ymax',
  'randInt',
  '1-Var Stats',
  'ZXmin',
];

const SEARCH_WINDOWS = [
  [0x09f000, 0x0a1000, 'near 0x09F79B key/scan-code area'],
  [0x0a0000, 0x0c0000, '0x0Axxxx-0x0Bxxxx token/string region'],
];

function hex(value, width = 2) {
  return `0x${value.toString(16).toUpperCase().padStart(width, '0')}`;
}

function romOffset(address) {
  return address - ROM_BASE;
}

function isPrintableAscii(byte) {
  return byte >= 0x20 && byte <= 0x7e;
}

function readCString(rom, offset, maxLen = 64) {
  const bytes = [];
  for (let i = offset; i < rom.length && bytes.length < maxLen; i += 1) {
    const byte = rom[i];
    if (byte === 0) break;
    if (!isPrintableAscii(byte)) return null;
    bytes.push(byte);
  }

  if (bytes.length === 0 || bytes.length === maxLen) return null;
  return Buffer.from(bytes).toString('ascii');
}

function findAsciiOccurrences(rom, needle, windows = SEARCH_WINDOWS) {
  const pattern = Buffer.from(needle, 'ascii');
  const matches = [];

  for (const [startAddr, endAddr, label] of windows) {
    const start = Math.max(0, romOffset(startAddr));
    const end = Math.min(rom.length, romOffset(endAddr));

    for (let offset = start; offset <= end - pattern.length; offset += 1) {
      let found = true;
      for (let i = 0; i < pattern.length; i += 1) {
        if (rom[offset + i] !== pattern[i]) {
          found = false;
          break;
        }
      }
      if (found) {
        matches.push({ address: offset + ROM_BASE, label, needle });
      }
    }
  }

  return matches;
}

function extractStringTable(rom, address) {
  const startOffset = romOffset(address);
  const strings = [];
  let cursor = startOffset;

  for (let count = 0; count < 32 && cursor < rom.length; count += 1) {
    const value = readCString(rom, cursor);
    if (!value) break;
    strings.push({ address: cursor + ROM_BASE, value });
    cursor += value.length + 1;
  }

  return strings;
}

function findLikelyStringTables(rom) {
  const byAddress = new Map();

  for (const hint of TOKEN_NAME_HINTS) {
    for (const match of findAsciiOccurrences(rom, hint)) {
      const strings = extractStringTable(rom, match.address);
      if (strings.length >= 2) {
        byAddress.set(match.address, {
          address: match.address,
          label: match.label,
          matchedHint: hint,
          strings,
        });
      }
    }
  }

  return [...byAddress.values()].sort((a, b) => a.address - b.address);
}

function instructionText(instruction) {
  if (!instruction) return '';
  if (typeof instruction === 'string') return instruction;
  return [
    instruction.mnemonic,
    instruction.operands,
    instruction.opStr,
    instruction.text,
    instruction.disasm,
  ].filter(Boolean).join(' ');
}

function instructionSize(instruction) {
  if (!instruction || typeof instruction !== 'object') return 1;
  return instruction.size || instruction.length || instruction.bytes?.length || 1;
}

function scanInstructionRefs(rom, prefix) {
  const refs = [];
  const cpOpcode = 0xfe;
  const ldAOpcode = 0x3e;

  for (let offset = 0; offset < rom.length - 1; offset += 1) {
    const opcode = rom[offset];
    if ((opcode !== cpOpcode && opcode !== ldAOpcode) || rom[offset + 1] !== prefix) {
      continue;
    }

    let decoded = null;
    try {
      decoded = decodeInstruction(rom, offset, true);
    } catch {
      decoded = null;
    }

    refs.push({
      address: offset + ROM_BASE,
      kind: opcode === cpOpcode ? 'CP' : 'LD A',
      text: instructionText(decoded),
      size: instructionSize(decoded),
    });
  }

  return refs;
}

function scanRawRefs(rom, prefix) {
  const refs = [];
  for (let offset = 0; offset < rom.length; offset += 1) {
    if (rom[offset] === prefix) refs.push(offset + ROM_BASE);
  }
  return refs;
}

function printTable(prefixes, xrefs) {
  console.log('Prefix byte -> TI token class -> ROM instruction references');
  console.log('-----------------------------------------------------------');

  for (const prefix of prefixes) {
    const className = PREFIX_CLASSES.get(prefix) || 'Unknown';
    const refs = xrefs.get(prefix) || [];
    console.log(`${hex(prefix)} -> ${className} -> ${refs.length}`);
  }
}

function printDetailedRefs(prefixes, xrefs) {
  console.log('\nInstruction cross-references');
  console.log('----------------------------');

  for (const prefix of prefixes) {
    const refs = xrefs.get(prefix) || [];
    console.log(`\n${hex(prefix)} ${PREFIX_CLASSES.get(prefix) || 'Unknown'} (${refs.length})`);
    for (const ref of refs.slice(0, 40)) {
      const decoded = ref.text ? ` ${ref.text}` : '';
      console.log(`  ${hex(ref.address, 6)} ${ref.kind}${decoded}`);
    }
    if (refs.length > 40) {
      console.log(`  ... ${refs.length - 40} more`);
    }
  }
}

function printStringTables(tables) {
  console.log('\nLikely token name string tables');
  console.log('-------------------------------');

  if (tables.length === 0) {
    console.log('No null-terminated ASCII token-name tables found in the searched windows.');
    return;
  }

  for (const table of tables.slice(0, 24)) {
    console.log(`\n${hex(table.address, 6)} (${table.label}; matched "${table.matchedHint}")`);
    for (const entry of table.strings.slice(0, 24)) {
      console.log(`  ${hex(entry.address, 6)} "${entry.value}"`);
    }
    if (table.strings.length > 24) {
      console.log(`  ... ${table.strings.length - 24} more strings`);
    }
  }

  if (tables.length > 24) {
    console.log(`\n... ${tables.length - 24} more candidate tables`);
  }
}

function main() {
  const rom = fs.readFileSync(ROM_PATH);
  const tableOffset = romOffset(TABLE_ADDR);
  const prefixes = [...rom.subarray(tableOffset, tableOffset + TABLE_LEN)];

  console.log(`ROM: ${ROM_PATH}`);
  console.log(`0x080075 prefix table (${TABLE_LEN} bytes): ${prefixes.map((b) => hex(b)).join(' ')}`);
  console.log('');

  const xrefs = new Map();
  for (const prefix of prefixes) {
    xrefs.set(prefix, scanInstructionRefs(rom, prefix));
  }

  printTable(prefixes, xrefs);
  printDetailedRefs(prefixes, xrefs);

  console.log('\nRaw byte occurrence counts');
  console.log('--------------------------');
  for (const prefix of prefixes) {
    console.log(`${hex(prefix)} -> ${scanRawRefs(rom, prefix).length}`);
  }

  printStringTables(findLikelyStringTables(rom));
}

main();
