import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const romPath = path.join(__dirname, 'ROM.rom');
const rom = fs.readFileSync(romPath);

const TARGET = 0xD02032;
const TARGET_LOW = 0x2032;
const CONTEXT = 20;

const directPatterns = [
  {
    kind: 'write',
    pattern: [0x32, 0x32, 0x20, 0xD0],
    decode: 'LD (D02032),A',
  },
  {
    kind: 'write',
    pattern: [0x22, 0x32, 0x20, 0xD0],
    decode: 'LD (D02032),HL',
  },
  {
    kind: 'write',
    pattern: [0x40, 0x32, 0x32, 0x20],
    decode: '.SIS LD (2032),A ; MBASE-composed D02032',
  },
  {
    kind: 'write',
    pattern: [0x40, 0x22, 0x32, 0x20],
    decode: '.SIS LD (2032),HL ; MBASE-composed D02032',
  },
  {
    kind: 'read',
    pattern: [0x3A, 0x32, 0x20, 0xD0],
    decode: 'LD A,(D02032)',
  },
  {
    kind: 'read',
    pattern: [0x40, 0x3A, 0x32, 0x20],
    decode: '.SIS LD A,(2032) ; MBASE-composed D02032',
  },
];

function hex(value, width = 6) {
  return '0x' + value.toString(16).toUpperCase().padStart(width, '0');
}

function byteHex(value) {
  return value.toString(16).toUpperCase().padStart(2, '0');
}

function bytes(start, length) {
  return Array.from(rom.subarray(start, start + length), byteHex).join(' ');
}

function bytesAround(offset, radius = CONTEXT) {
  const start = Math.max(0, offset - radius);
  const end = Math.min(rom.length, offset + radius + 1);
  return {
    start,
    end,
    text: bytes(start, end - start),
  };
}

function matchesPattern(offset, pattern) {
  if (offset + pattern.length > rom.length) return false;
  for (let i = 0; i < pattern.length; i++) {
    if (rom[offset + i] !== pattern[i]) return false;
  }
  return true;
}

function readU24(offset) {
  if (offset + 2 >= rom.length) return null;
  return rom[offset] | (rom[offset + 1] << 8) | (rom[offset + 2] << 16);
}

function readU16(offset) {
  if (offset + 1 >= rom.length) return null;
  return rom[offset] | (rom[offset + 1] << 8);
}

function isPushOpcode(op) {
  return op === 0xF5 || op === 0xC5 || op === 0xD5 || op === 0xE5;
}

function isLikelyBoundary(offset) {
  const op = rom[offset];
  if (isPushOpcode(op) || op === 0xF3) return true; // PUSH r or DI.
  if (op === 0xDD || op === 0xFD) {
    const next = rom[offset + 1];
    return next === 0xE5; // PUSH IX/IY.
  }
  return false;
}

function isPreviousFunctionEnd(offset) {
  const op = rom[offset];
  if (
    op === 0xC9 || // RET
    op === 0xD9 || // EXX, often seen around return stubs; weak boundary
    op === 0xC3 || // JP nn
    op === 0x18 || // JR e
    op === 0xE9 // JP (HL)
  ) {
    return true;
  }
  if (op === 0xDD || op === 0xFD) {
    return rom[offset + 1] === 0xE9; // JP (IX/IY)
  }
  return false;
}

function estimateFunction(offset) {
  const scanStart = Math.max(0, offset - 0x300);
  let bestPrologue = null;
  let nearestEnd = null;

  for (let pos = offset - 1; pos >= scanStart; pos--) {
    if (nearestEnd === null && isPreviousFunctionEnd(pos)) {
      nearestEnd = pos;
    }
    if (isLikelyBoundary(pos)) {
      bestPrologue = pos;
      break;
    }
  }

  const start = bestPrologue ?? (nearestEnd === null ? scanStart : nearestEnd + 1);
  const reason = bestPrologue !== null
    ? 'backward prologue scan'
    : nearestEnd !== null
      ? 'after previous RET/JP/JR'
      : 'scan window start';
  return { start, reason };
}

function addMatch(matches, offset, kind, decode, extra = {}) {
  const context = bytesAround(offset);
  const fn = estimateFunction(offset);
  matches.push({
    offset,
    kind,
    decode,
    context,
    functionStart: fn.start,
    functionReason: fn.reason,
    ...extra,
  });
}

function findDirectMatches() {
  const matches = [];
  for (let offset = 0; offset < rom.length; offset++) {
    for (const candidate of directPatterns) {
      if (matchesPattern(offset, candidate.pattern)) {
        addMatch(matches, offset, candidate.kind, candidate.decode, {
          length: candidate.pattern.length,
        });
      }
    }
  }
  return matches;
}

function findHlBitMatches() {
  const matches = [];
  for (let offset = 0; offset <= rom.length - 4; offset++) {
    if (!matchesPattern(offset, [0x21, 0x32, 0x20, 0xD0])) continue;

    const windowEnd = Math.min(rom.length - 1, offset + 64);
    for (let pos = offset + 4; pos <= windowEnd - 1; pos++) {
      if (rom[pos] !== 0xCB) continue;
      const subop = rom[pos + 1];
      if ((subop & 0xC7) !== 0x46) continue; // BIT n,(HL)

      const bit = (subop >> 3) & 7;
      addMatch(matches, pos, 'read', `BIT ${bit},(HL) after LD HL,D02032 at ${hex(offset)}`, {
        length: 2,
        hlSetup: offset,
      });
    }
  }
  return matches;
}

function classifyLdDeBefore(offset) {
  const start = Math.max(0, offset - 48);
  const notes = [];
  for (let pos = start; pos < offset; pos++) {
    if (rom[pos] === 0x11) {
      const value = readU24(pos + 1);
      if (value === TARGET) {
        notes.push(`LD DE,D02032 at ${hex(pos)}`);
      }
    }
    if (rom[pos] === 0x40 && rom[pos + 1] === 0x11) {
      const value = readU16(pos + 2);
      if (value === TARGET_LOW) {
        notes.push(`.SIS LD DE,2032 at ${hex(pos)}`);
      }
    }
  }
  return notes;
}

function findBulkMatches() {
  const matches = [];
  for (let offset = 0; offset <= rom.length - 2; offset++) {
    if (rom[offset] !== 0xED) continue;
    const op = rom[offset + 1];
    if (op !== 0xB0 && op !== 0xB8) continue; // LDIR/LDDR

    const deNotes = classifyLdDeBefore(offset);
    if (deNotes.length === 0) continue;
    addMatch(matches, offset, 'write', `${op === 0xB0 ? 'LDIR' : 'LDDR'} with nearby ${deNotes.join(', ')}`, {
      length: 2,
      bulkCopy: true,
    });
  }
  return matches;
}

function printMatch(match) {
  console.log(`${match.kind.toUpperCase()} ${hex(match.offset)}  ${match.decode}`);
  console.log(`  function estimate: ${hex(match.functionStart)} (${match.functionReason})`);
  console.log(`  context @ ${hex(match.context.start)}..${hex(match.context.end - 1)}:`);
  console.log(`  ${match.context.text}`);
  console.log('');
}

const matches = [
  ...findDirectMatches(),
  ...findHlBitMatches(),
  ...findBulkMatches(),
].sort((a, b) => a.offset - b.offset || a.decode.localeCompare(b.decode));

const writeMatches = matches.filter((match) => match.kind === 'write');
const readMatches = matches.filter((match) => match.kind === 'read');
const touchedFunctions = new Map();

for (const match of matches) {
  const key = match.functionStart;
  if (!touchedFunctions.has(key)) {
    touchedFunctions.set(key, { reads: 0, writes: 0, touches: [] });
  }
  const bucket = touchedFunctions.get(key);
  if (match.kind === 'write') bucket.writes++;
  if (match.kind === 'read') bucket.reads++;
  bucket.touches.push(match.offset);
}

console.log(`D02032 probe over ${rom.length} bytes`);
console.log(`Target: ${hex(TARGET)}`);
console.log('');

for (const match of matches) {
  printMatch(match);
}

console.log('Summary');
console.log(`  write sites: ${writeMatches.length}`);
console.log(`  read sites: ${readMatches.length}`);
console.log(`  functions touching D02032: ${touchedFunctions.size}`);

for (const [functionStart, info] of [...touchedFunctions.entries()].sort((a, b) => a[0] - b[0])) {
  const touchList = info.touches.map((offset) => hex(offset)).join(', ');
  console.log(`  ${hex(functionStart)}: writes=${info.writes} reads=${info.reads} touches=${touchList}`);
}
