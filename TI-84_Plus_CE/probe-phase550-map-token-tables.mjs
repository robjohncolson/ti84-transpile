import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const romPath = path.join(__dirname, "ROM.rom");
const rom = fs.readFileSync(romPath);

const ROM_LIMIT = 0x400000;
const BASE_TABLE = 0x09f87d;
const FIRST_TABLE_LIMIT = 0xff;
const SAMPLE_LIMIT = 8;

const tables = [
  { name: "D=0x00 base 1-byte tokens", base: 0x09f87d, entries: FIRST_TABLE_LIMIT },
  { name: "D=0x5D", base: 0x09fb7d, entries: 16 },
  { name: "D=0x5D exact JR Z target", base: 0x09fb9b, entries: 16 },
  { name: "D<0x60 sub-page", base: 0x09fbcb, entries: 16 },
  { name: "D<0x60 sub-page", base: 0x09fbef, entries: 16 },
  { name: "D<0x60 sub-page", base: 0x09fc01, entries: 16 },
  { name: "D=0x60", base: 0x09fbad, entries: 16 },
  { name: "D=0x61", base: 0x09fc0a, entries: 16 },
  { name: "D=0x61", base: 0x09fc28, entries: 16 },
  { name: "D=0x63", base: 0x09fc64, entries: 16 },
  { name: "D=0x7E", base: 0x09fdc6, entries: 16 },
  { name: "D=0xBB", base: 0x09fc46, entries: 16 },
  { name: "D=0xBB", base: 0x09fdff, entries: 16 },
  { name: "D=0xBB", base: 0x0a00e1, entries: 16 },
];

function hex(value, width = 6) {
  return `0x${value.toString(16).toUpperCase().padStart(width, "0")}`;
}

function readPtr24LE(offset) {
  if (offset < 0 || offset + 2 >= rom.length) {
    return null;
  }
  return rom[offset] | (rom[offset + 1] << 8) | (rom[offset + 2] << 16);
}

function isInRom(ptr) {
  return Number.isInteger(ptr) && ptr > 0 && ptr < rom.length && ptr < ROM_LIMIT;
}

function printableByte(byte) {
  return byte >= 0x20 && byte <= 0x7e ? String.fromCharCode(byte) : ".";
}

function ascii(bytes) {
  return Array.from(bytes, printableByte).join("");
}

function readNullTerminated(ptr, maxLen = 48) {
  const bytes = [];
  for (let offset = ptr; offset < rom.length && bytes.length < maxLen; offset += 1) {
    const byte = rom[offset];
    if (byte === 0x00) {
      break;
    }
    bytes.push(byte);
  }
  return bytes;
}

function readLengthPrefixed(ptr, maxLen = 48) {
  if (ptr >= rom.length) {
    return [];
  }
  const len = rom[ptr];
  if (len === 0 || len > maxLen || ptr + len >= rom.length) {
    return [];
  }
  return Array.from(rom.subarray(ptr + 1, ptr + 1 + len));
}

function scoreBytes(bytes) {
  if (bytes.length === 0) {
    return -1;
  }
  let score = 0;
  for (const byte of bytes) {
    if (byte >= 0x20 && byte <= 0x7e) {
      score += 2;
    } else if (byte === 0x09 || byte === 0x0a || byte === 0x0d) {
      score += 1;
    } else {
      score -= 1;
    }
  }
  return score;
}

function readTokenString(ptr) {
  const lengthPrefixed = readLengthPrefixed(ptr);
  const nullTerminated = readNullTerminated(ptr);
  const preferLength = scoreBytes(lengthPrefixed) >= scoreBytes(nullTerminated);
  const bytes = preferLength ? lengthPrefixed : nullTerminated;
  const format = preferLength ? "len" : "nul";

  return {
    format,
    text: ascii(bytes),
    length: bytes.length,
  };
}

function dumpTable(table) {
  const entries = [];
  const samples = [];
  let valid = 0;

  console.log("");
  console.log(`== ${table.name} @ ${hex(table.base)} ==`);

  for (let index = 0; index < table.entries; index += 1) {
    const entryOffset = table.base + index * 3;
    const ptr = readPtr24LE(entryOffset);
    const tokenCode = index;

    if (ptr === null) {
      console.log(`${hex(tokenCode, 2)} entry=${hex(entryOffset)} ptr=<outside table> invalid`);
      break;
    }

    if (!isInRom(ptr)) {
      console.log(`${hex(tokenCode, 2)} entry=${hex(entryOffset)} ptr=${hex(ptr)} invalid`);
      entries.push({ index, ptr, valid: false });
      continue;
    }

    const tokenString = readTokenString(ptr);
    valid += 1;
    if (samples.length < SAMPLE_LIMIT && tokenString.text.length > 0) {
      samples.push(`${hex(tokenCode, 2)}:${tokenString.text}`);
    }

    console.log(
      `${hex(tokenCode, 2)} entry=${hex(entryOffset)} ptr=${hex(ptr)} ` +
        `fmt=${tokenString.format} len=${tokenString.length} "${tokenString.text}"`,
    );
    entries.push({ index, ptr, valid: true, tokenString });

    if (table.base === BASE_TABLE && ptr === 0) {
      break;
    }
  }

  return {
    name: table.name,
    base: table.base,
    valid,
    total: entries.length,
    samples,
  };
}

console.log(`ROM: ${romPath}`);
console.log(`Size: ${hex(rom.length)} bytes`);

const summaries = tables.map(dumpTable);

console.log("");
console.log("== Summary ==");
for (const summary of summaries) {
  const sampleText = summary.samples.length > 0 ? summary.samples.join(" | ") : "(none)";
  console.log(
    `${summary.name} @ ${hex(summary.base)}: ` +
      `${summary.valid}/${summary.total} valid entries; samples: ${sampleText}`,
  );
}
