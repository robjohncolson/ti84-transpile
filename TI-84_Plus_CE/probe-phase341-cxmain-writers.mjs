#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const rom = new Uint8Array(fs.readFileSync(ROM_PATH));
const ROM_SIZE = rom.length;

const KNOWN_HANDLERS = new Map([
  [0x058241, 'HOME_HANDLER (home screen)'],
]);

function hex(value, width = 6) {
  if (!Number.isFinite(value)) return 'n/a';
  return '0x' + (value >>> 0).toString(16).toUpperCase().padStart(width, '0');
}

function safeDecode(pc) {
  try {
    const inst = decodeInstruction(rom, pc, 'adl');
    if (inst && Number.isInteger(inst.length) && inst.length > 0) {
      return inst;
    }
  } catch {}
  return null;
}

// Search patterns for writes to 0xD007CA:
// LD (0xD007CA), HL  => 22 CA 07 D0
// LD (0xD007CA), IX  => DD 22 CA 07 D0
// LD (0xD007CA), IY  => FD 22 CA 07 D0
function findWriteSites() {
  const sites = [];

  for (let i = 0; i <= ROM_SIZE - 4; i++) {
    // Pattern 1: 22 CA 07 D0  (LD (imm24), HL)
    if (rom[i] === 0x22 && rom[i+1] === 0xCA && rom[i+2] === 0x07 && rom[i+3] === 0xD0) {
      sites.push({ addr: i, length: 4, register: 'HL', prefix: null });
    }
    // Pattern 2: DD 22 CA 07 D0  (LD (imm24), IX)
    if (i <= ROM_SIZE - 5 && rom[i] === 0xDD && rom[i+1] === 0x22 && rom[i+2] === 0xCA && rom[i+3] === 0x07 && rom[i+4] === 0xD0) {
      sites.push({ addr: i, length: 5, register: 'IX', prefix: 0xDD });
    }
    // Pattern 3: FD 22 CA 07 D0  (LD (imm24), IY)
    if (i <= ROM_SIZE - 5 && rom[i] === 0xFD && rom[i+1] === 0x22 && rom[i+2] === 0xCA && rom[i+3] === 0x07 && rom[i+4] === 0xD0) {
      sites.push({ addr: i, length: 5, register: 'IY', prefix: 0xFD });
    }
  }

  return sites;
}

// Walk backward from the write site looking for LD HL/IX/IY, imm24
function findHandlerLoad(site) {
  const searchStart = Math.max(0, site.addr - 32);
  const targetReg = site.register;

  // Walk backward byte by byte looking for the immediate load
  for (let pos = site.addr - 1; pos >= searchStart; pos--) {
    if (targetReg === 'HL' && rom[pos] === 0x21 && pos + 4 <= site.addr) {
      // LD HL, imm24: 21 xx xx xx
      const addr = rom[pos+1] | (rom[pos+2] << 8) | (rom[pos+3] << 16);
      return { loadAddr: pos, handlerAddr: addr, loadLength: 4 };
    }
    if (targetReg === 'IX' && pos >= 1 && rom[pos-1] === 0xDD && rom[pos] === 0x21 && (pos - 1) + 5 <= site.addr) {
      const addr = rom[pos+1] | (rom[pos+2] << 8) | (rom[pos+3] << 16);
      return { loadAddr: pos - 1, handlerAddr: addr, loadLength: 5 };
    }
    if (targetReg === 'IY' && pos >= 1 && rom[pos-1] === 0xFD && rom[pos] === 0x21 && (pos - 1) + 5 <= site.addr) {
      const addr = rom[pos+1] | (rom[pos+2] << 8) | (rom[pos+3] << 16);
      return { loadAddr: pos - 1, handlerAddr: addr, loadLength: 5 };
    }
  }

  // Fallback: use decoder to find pair-imm loads
  for (let pos = site.addr - 4; pos >= searchStart; pos--) {
    const inst = safeDecode(pos);
    if (!inst) continue;
    if (inst.tag === 'ld-pair-imm' && inst.pair === 'hl' && targetReg === 'HL') {
      return { loadAddr: pos, handlerAddr: inst.value >>> 0, loadLength: inst.length };
    }
    if (inst.tag === 'ld-pair-imm' && inst.pair === 'ix' && targetReg === 'IX') {
      return { loadAddr: pos, handlerAddr: inst.value >>> 0, loadLength: inst.length };
    }
    if (inst.tag === 'ld-pair-imm' && inst.pair === 'iy' && targetReg === 'IY') {
      return { loadAddr: pos, handlerAddr: inst.value >>> 0, loadLength: inst.length };
    }
  }

  return null;
}

function contextBytes(addr, before, after) {
  const start = Math.max(0, addr - before);
  const end = Math.min(ROM_SIZE, addr + after);
  return Array.from(rom.subarray(start, end), b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

function main() {
  console.log('Phase 341: cxMain (0xD007CA) write-site classification');
  console.log(`ROM: ${ROM_PATH}`);
  console.log(`ROM size: ${ROM_SIZE} bytes (${hex(ROM_SIZE, 8)})`);
  console.log('');

  const sites = findWriteSites();
  console.log(`Found ${sites.length} write sites to cxMain (0xD007CA)`);
  console.log('');

  const results = [];

  for (const site of sites) {
    const load = findHandlerLoad(site);
    results.push({ site, load });
  }

  // Print detailed table
  console.log('=== Write Site -> Handler Address Map ===');
  console.log('');
  console.log('Write Site   | Register | Handler Addr | Known Name');
  console.log('-------------|----------|--------------|-----------------------------------');

  for (const { site, load } of results) {
    const writeAddr = hex(site.addr);
    const reg = site.register.padEnd(2);
    let handlerStr = '(not found)  ';
    let nameStr = '';

    if (load) {
      handlerStr = hex(load.handlerAddr);
      const known = KNOWN_HANDLERS.get(load.handlerAddr);
      if (known) {
        nameStr = known;
      }
    }

    console.log(`${writeAddr}   | ${reg}       | ${handlerStr}   | ${nameStr}`);
  }

  console.log('');

  // Summary: unique handler addresses
  const handlerMap = new Map();
  for (const { site, load } of results) {
    if (load) {
      const key = load.handlerAddr;
      if (!handlerMap.has(key)) {
        handlerMap.set(key, []);
      }
      handlerMap.get(key).push(site.addr);
    }
  }

  console.log('=== Unique Handler Addresses ===');
  console.log('');
  const sortedHandlers = Array.from(handlerMap.entries()).sort((a, b) => a[0] - b[0]);
  for (const [handlerAddr, writeSites] of sortedHandlers) {
    const known = KNOWN_HANDLERS.get(handlerAddr);
    const label = known ? ` = ${known}` : '';
    const writers = writeSites.map(a => hex(a)).join(', ');
    console.log(`  ${hex(handlerAddr)}${label}`);
    console.log(`    written by: ${writers}`);
  }

  console.log('');

  // Unresolved sites
  const unresolved = results.filter(r => !r.load);
  if (unresolved.length > 0) {
    console.log('=== Unresolved Write Sites (no LD found in preceding 32 bytes) ===');
    console.log('');
    for (const { site } of unresolved) {
      console.log(`  ${hex(site.addr)} (${site.register}) -- context: ${contextBytes(site.addr, 8, site.length + 4)}`);
    }
    console.log('');
  }

  console.log(`Total write sites: ${sites.length}`);
  console.log(`Resolved handlers: ${results.filter(r => r.load).length}`);
  console.log(`Unresolved: ${unresolved.length}`);
  console.log(`Unique handler addresses: ${handlerMap.size}`);
}

main();
