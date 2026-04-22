import { readFileSync } from 'fs';
const rom = readFileSync('TI-84_Plus_CE/ROM.rom');
function dump(label, start, len) {
  console.log(`\n=== ${label} at 0x${start.toString(16)} ===`);
  for (let i = 0; i < len; i += 16) {
    const addr = start + i;
    const bytes = [];
    for (let j = 0; j < 16 && i+j < len; j++) bytes.push(rom[addr+j].toString(16).padStart(2, '0'));
    console.log(`${addr.toString(16).padStart(6,'0')}: ${bytes.join(' ')}`);
  }
}
dump('0x082BBE pointer/slot helper', 0x082BBE, 192);
dump('0x0821B9 heap/VAT move', 0x0821B9, 128);
