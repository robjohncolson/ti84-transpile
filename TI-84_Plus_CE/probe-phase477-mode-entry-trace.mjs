#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rom = fs.readFileSync(path.join(__dirname, 'ROM.rom'));

function hex(v, w = 2) { return '0x' + (v >>> 0).toString(16).toUpperCase().padStart(w, '0'); }

// Hex dump region 0x02FF80 to 0x030030
console.log('=== ROM hex dump 0x02FF80 - 0x030030 ===');
for (let addr = 0x02FF80; addr < 0x030030; addr += 16) {
  const bytes = [];
  for (let i = 0; i < 16 && addr + i < 0x030030; i++) {
    bytes.push(rom[addr + i].toString(16).padStart(2, '0'));
  }
  console.log(hex(addr, 6) + ': ' + bytes.join(' '));
}

// Search ROM for CALL/JP to addresses in 0x02FFE0-0x030030
console.log('\n=== References to 0x02FFE0-0x030030 ===');
const targets = [];
for (let t = 0x02FFE0; t <= 0x030030; t++) {
  targets.push(t);
}

for (let addr = 0; addr < rom.length - 3; addr++) {
  const b = rom[addr];
  // CALL nn (CD xx xx xx in ADL mode = 4 bytes)
  if (b === 0xCD) {
    const target = rom[addr+1] | (rom[addr+2] << 8) | (rom[addr+3] << 16);
    if (target >= 0x02FFE0 && target <= 0x030030) {
      console.log(`  CALL ${hex(target, 6)} at ${hex(addr, 6)}`);
    }
  }
  // JP nn (C3 xx xx xx in ADL mode = 4 bytes)
  if (b === 0xC3) {
    const target = rom[addr+1] | (rom[addr+2] << 8) | (rom[addr+3] << 16);
    if (target >= 0x02FFE0 && target <= 0x030030) {
      console.log(`  JP ${hex(target, 6)} at ${hex(addr, 6)}`);
    }
  }
  // JP cc,nn (C2/CA/D2/DA/E2/EA/F2/FA xx xx xx)
  if ((b & 0xC7) === 0xC2) {
    const target = rom[addr+1] | (rom[addr+2] << 8) | (rom[addr+3] << 16);
    if (target >= 0x02FFE0 && target <= 0x030030) {
      const cc = (b >> 3) & 7;
      const ccNames = ['NZ','Z','NC','C','PO','PE','P','M'];
      console.log(`  JP ${ccNames[cc]},${hex(target, 6)} at ${hex(addr, 6)}`);
    }
  }
  // CALL cc,nn (C4/CC/D4/DC/E4/EC/F4/FC xx xx xx)
  if ((b & 0xC7) === 0xC4) {
    const target = rom[addr+1] | (rom[addr+2] << 8) | (rom[addr+3] << 16);
    if (target >= 0x02FFE0 && target <= 0x030030) {
      const cc = (b >> 3) & 7;
      const ccNames = ['NZ','Z','NC','C','PO','PE','P','M'];
      console.log(`  CALL ${ccNames[cc]},${hex(target, 6)} at ${hex(addr, 6)}`);
    }
  }
}

// Also search for JR relative branches targeting our area
// JR = 0x18 + signed offset; JR cc = 0x20/0x28/0x30/0x38
console.log('\n=== JR branches targeting 0x030000-0x030020 ===');
for (let addr = 0x02FF80; addr < 0x030040; addr++) {
  const b = rom[addr];
  if (b === 0x18 || b === 0x20 || b === 0x28 || b === 0x30 || b === 0x38) {
    const offset = rom[addr+1];
    const signedOffset = offset > 127 ? offset - 256 : offset;
    const target = addr + 2 + signedOffset;
    if (target >= 0x030000 && target <= 0x030020) {
      const names = {0x18:'JR', 0x20:'JR NZ', 0x28:'JR Z', 0x30:'JR NC', 0x38:'JR C'};
      console.log(`  ${names[b] || 'JR'} ${hex(target, 6)} at ${hex(addr, 6)} (offset ${signedOffset})`);
    }
  }
}

// Specifically search for CALL 0x03002E (known call target from session 471)
console.log('\n=== Callers of 0x03002E specifically ===');
for (let addr = 0; addr < rom.length - 3; addr++) {
  const b = rom[addr];
  if (b === 0xCD || b === 0xC3 || (b & 0xC7) === 0xC2 || (b & 0xC7) === 0xC4) {
    const target = rom[addr+1] | (rom[addr+2] << 8) | (rom[addr+3] << 16);
    if (target === 0x03002E) {
      console.log(`  ${hex(b)} ${hex(target, 6)} at ${hex(addr, 6)}`);
    }
  }
}

console.log('\nDone.');
