import fs from 'fs';

const rom = fs.readFileSync('TI-84_Plus_CE/ROM.rom');
const TABLE_BASE = 0x062245;
const NUM_ENTRIES = 44;
const ENTRY_SIZE = 3;
const STRING_LIMIT = 50;

const tableBytes = rom.subarray(TABLE_BASE, TABLE_BASE + NUM_ENTRIES * ENTRY_SIZE);
const rawHex = Array.from(tableBytes, (byte) => byte.toString(16).padStart(2, '0')).join(' ');

console.log(`Error string pointer table @ 0x${TABLE_BASE.toString(16).padStart(6, '0')}`);
console.log(`Raw bytes (${tableBytes.length}): ${rawHex}`);
console.log('');

for (let i = 0; i < NUM_ENTRIES; i++) {
  const offset = TABLE_BASE + i * ENTRY_SIZE;
  const ptr = rom[offset] | (rom[offset + 1] << 8) | (rom[offset + 2] << 16);

  let str = '';
  for (let j = 0; j < STRING_LIMIT; j++) {
    const ch = rom[ptr + j];
    if (ch === 0) break;
    str += String.fromCharCode(ch);
  }

  console.log(`Index ${i}: 0x${ptr.toString(16).padStart(6, '0')} -> "${str}"`);
}
