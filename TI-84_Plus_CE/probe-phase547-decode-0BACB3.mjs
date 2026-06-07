import fs from 'node:fs';
import path from 'node:path';

const ROM_PATH = path.join('TI-84_Plus_CE', 'ROM.rom');
const ROM_LIMIT = 0x3fffff;
const RAW_LEN = 128;
const MAX_ENTRIES = 40;
const STRING_LIMIT = 16;

const TABLES = [
  { name: 'error system type string table', addr: 0x03ecad, knownCount: 27 },
  { name: 'unknown second table', addr: 0x03ed55 },
  { name: 'graph/app type string table', addr: 0x0bacb3 },
];

const rom = fs.readFileSync(ROM_PATH);

function hex(value, width = 6) {
  return `0x${value.toString(16).toUpperCase().padStart(width, '0')}`;
}

function dumpRaw(addr, length = RAW_LEN) {
  const bytes = rom.slice(addr, addr + length);

  console.log(`Raw bytes at ${hex(addr)} (${bytes.length} bytes):`);
  for (let i = 0; i < bytes.length; i += 16) {
    const chunk = bytes.slice(i, i + 16);
    const text = Array.from(chunk, (byte) => byte.toString(16).padStart(2, '0')).join(' ');
    console.log(`${hex(addr + i)}: ${text}`);
  }
}

function decodeAscii(addr, limit = STRING_LIMIT) {
  const bytes = rom.slice(addr, addr + limit);
  let string = '';
  const raw = [];
  let terminated = false;

  for (const byte of bytes) {
    raw.push(byte);
    if (byte === 0) {
      terminated = true;
      break;
    }
    string += String.fromCharCode(byte);
  }

  const printable = /^[\x20-\x7E]*$/.test(string);

  return {
    string,
    printable,
    terminated,
    raw: raw.map((byte) => byte.toString(16).padStart(2, '0')).join(' '),
  };
}

function readPointer(addr) {
  if (addr + 2 >= rom.length) {
    return undefined;
  }

  return rom[addr] | (rom[addr + 1] << 8) | (rom[addr + 2] << 16);
}

function pointerStopReason(ptr) {
  if (ptr === undefined) return 'entry extends past ROM file';
  if (ptr > ROM_LIMIT) return `pointer ${hex(ptr)} exceeds ROM address limit ${hex(ROM_LIMIT)}`;
  if (ptr >= rom.length) return `pointer ${hex(ptr)} exceeds ROM file length ${hex(rom.length - 1)}`;
  return null;
}

function decodeTable({ addr, knownCount }) {
  const entries = [];
  let stopReason = null;
  const maxEntries = knownCount ?? MAX_ENTRIES;

  for (let index = 0; index < maxEntries; index++) {
    const entryAddr = addr + index * 3;
    const ptr = readPointer(entryAddr);
    stopReason = pointerStopReason(ptr);

    if (stopReason) {
      break;
    }

    const decoded = decodeAscii(ptr);
    entries.push({
      index,
      entryAddr,
      ptr,
      ...decoded,
    });
  }

  if (!stopReason) {
    if (knownCount) {
      stopReason = `used known count ${knownCount}`;
    } else {
      const nextPtr = readPointer(addr + maxEntries * 3);
      const nextStop = pointerStopReason(nextPtr);
      stopReason = nextStop ?? `reached probe cap of ${MAX_ENTRIES} entries`;
    }
  }

  return { entries, stopReason };
}

function printTable(table, decoded) {
  console.log(`\n=== ${table.name} @ ${hex(table.addr)} ===`);
  dumpRaw(table.addr);
  console.log(`\nDecoded entries: ${decoded.entries.length}`);
  console.log(`Stop reason: ${decoded.stopReason}`);
  console.log('index  entry     pointer   term  printable  string  raw');

  for (const entry of decoded.entries) {
    const display = JSON.stringify(entry.string);
    console.log(
      `${String(entry.index).padStart(5)}  ${hex(entry.entryAddr)}  ${hex(entry.ptr)}  ` +
        `${String(entry.terminated).padEnd(5)} ${String(entry.printable).padEnd(9)} ${display.padEnd(18)} ${entry.raw}`,
    );
  }

  const unique = [...new Set(decoded.entries.map((entry) => entry.string))];
  console.log(`Unique strings (${unique.length}): ${unique.map((value) => JSON.stringify(value)).join(', ')}`);
}

function compareTables(decodedByName) {
  const baseName = 'error system type string table';
  const base = decodedByName.get(baseName).entries.map((entry) => entry.string);
  const baseSet = new Set(base);

  console.log('\n=== Comparison with 0x03ECAD ===');

  for (const table of TABLES) {
    if (table.name === baseName) continue;

    const strings = decodedByName.get(table.name).entries.map((entry) => entry.string);
    const set = new Set(strings);
    const sameOrder = strings.length === base.length && strings.every((value, index) => value === base[index]);
    const sameSet = set.size === baseSet.size && [...set].every((value) => baseSet.has(value));
    const onlyInBase = [...baseSet].filter((value) => !set.has(value));
    const onlyInTable = [...set].filter((value) => !baseSet.has(value));

    console.log(`\n${table.name} @ ${hex(table.addr)}`);
    console.log(`Same order as 0x03ECAD: ${sameOrder}`);
    console.log(`Same unique string set as 0x03ECAD: ${sameSet}`);
    console.log(`Only in 0x03ECAD (${onlyInBase.length}): ${onlyInBase.map((value) => JSON.stringify(value)).join(', ') || '(none)'}`);
    console.log(`Only in this table (${onlyInTable.length}): ${onlyInTable.map((value) => JSON.stringify(value)).join(', ') || '(none)'}`);
  }
}

console.log(`ROM: ${ROM_PATH}`);
console.log(`ROM size: ${rom.length} bytes (${hex(rom.length - 1)} last offset)`);

const decodedByName = new Map();

for (const table of TABLES) {
  const decoded = decodeTable(table);
  decodedByName.set(table.name, decoded);
  printTable(table, decoded);
}

compareTables(decodedByName);
