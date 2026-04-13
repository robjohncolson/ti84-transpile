#!/usr/bin/env node
// Inspect bytes at 0x09fb7d, 0x09fb9b, 0x09fbad — tables referenced by
// the 0x0a2a68 token dispatcher.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romPath = path.join(__dirname, 'ROM.rom');
const romBytes = fs.readFileSync(romPath);

function dumpRegion(addr, len) {
  console.log(`\n## 0x${addr.toString(16)} (${len} bytes)`);
  console.log('Hex:');
  for (let i = 0; i < len; i += 16) {
    const row = Array.from(romBytes.slice(addr + i, addr + i + 16))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join(' ');
    const ascii = Array.from(romBytes.slice(addr + i, addr + i + 16))
      .map((b) => (b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : '.'))
      .join('');
    console.log(`${'0x' + (addr + i).toString(16).padStart(6, '0')}  ${row}  |${ascii}|`);
  }

  // Also try interpreting as length-prefixed entries: <byte_code><len><name>
  console.log('\nAs length-prefixed table (starting byte=code, next=len, then name):');
  let pc = addr;
  const end = addr + len;
  while (pc < end) {
    const code = romBytes[pc];
    const nameLen = romBytes[pc + 1];
    if (nameLen === 0 || nameLen > 30) { pc += 1; continue; }
    const name = Array.from(romBytes.slice(pc + 2, pc + 2 + nameLen));
    const allPrintable = name.every((b) => b >= 0x20 && b < 0x7f);
    if (!allPrintable) { pc += 1; continue; }
    const str = name.map((b) => String.fromCharCode(b)).join('');
    console.log(`  ${'0x' + pc.toString(16).padStart(6, '0')}  code=0x${code.toString(16)} len=${nameLen} name="${str}"`);
    pc += 2 + nameLen;
  }
}

dumpRegion(0x09fb7d, 128);
dumpRegion(0x09fb9b, 64);
dumpRegion(0x09fbad, 128);

// Also check the main token table area for comparison
dumpRegion(0x0a0450, 256);
