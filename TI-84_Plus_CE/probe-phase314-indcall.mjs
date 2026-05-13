#!/usr/bin/env node
/**
 * probe-phase314-indcall.mjs
 *
 * Scans ROM.rom for all _indcall dispatch sites (JP (IY) trampoline at 0x00015C / 0x002288),
 * extracts callback slot addresses from preceding LD IY,(addr) instructions,
 * finds writers to each slot, and prints a full summary.
 *
 * Usage:  node TI-84_Plus_CE/probe-phase314-indcall.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rom = fs.readFileSync(path.join(__dirname, 'ROM.rom'));

// ---------------------------------------------------------------------------
// 1. Find the JP (IY) trampoline(s)
// ---------------------------------------------------------------------------

const jpIYSites = [];
for (let i = 0; i < rom.length - 1; i++) {
  if (rom[i] === 0xFD && rom[i + 1] === 0xE9) {
    jpIYSites.push(i);
  }
}

console.log('=== JP (IY) trampoline sites ===');
console.log(`Found ${jpIYSites.length} JP (IY) instruction(s):`);
for (const addr of jpIYSites) {
  console.log(`  0x${addr.toString(16).padStart(6, '0')}`);
}

// ---------------------------------------------------------------------------
// 2. Find all CALL sites to the two _indcall entry points
// ---------------------------------------------------------------------------

const INDCALL_TARGETS = [0x00015C, 0x002288]; // JP 0x002288 and JP (IY) directly

function findCallSites(target) {
  const lo = target & 0xFF;
  const mi = (target >> 8) & 0xFF;
  const hi = (target >> 16) & 0xFF;
  const sites = [];
  for (let i = 0; i < rom.length - 3; i++) {
    if (rom[i] === 0xCD && rom[i + 1] === lo && rom[i + 2] === mi && rom[i + 3] === hi) {
      sites.push(i);
    }
  }
  return sites;
}

const allIndcallSites = new Map(); // callPC -> { target, slotAddr, slotSource }

for (const target of INDCALL_TARGETS) {
  const sites = findCallSites(target);
  console.log(`\nCALL 0x${target.toString(16).padStart(6, '0')}: ${sites.length} site(s)`);

  for (const callPC of sites) {
    let slotAddr = null;
    let slotSource = 'unknown';

    // Look backwards up to 30 bytes for LD IY,(addr) = FD 2A xx xx xx
    for (let j = callPC - 1; j >= Math.max(0, callPC - 30); j--) {
      if (rom[j] === 0xFD && rom[j + 1] === 0x2A) {
        slotAddr = rom[j + 2] | (rom[j + 3] << 8) | (rom[j + 4] << 16);
        slotSource = 'LD IY,(addr)';
        break;
      }
    }

    // If no direct slot, check for IX-frame load (FD 37 = LD IY,(IY+d))
    if (slotAddr === null) {
      for (let j = callPC - 1; j >= Math.max(0, callPC - 20); j--) {
        if (rom[j] === 0xFD && rom[j + 1] === 0x37) {
          slotSource = 'IX-frame (C function pointer)';
          break;
        }
      }
    }

    allIndcallSites.set(callPC, { target, slotAddr, slotSource });

    const slotStr = slotAddr !== null
      ? `slot=0x${slotAddr.toString(16).padStart(6, '0')}`
      : slotSource;
    console.log(`  0x${callPC.toString(16).padStart(6, '0')}  ${slotStr}`);
  }
}

// ---------------------------------------------------------------------------
// 3. Find wrapper function callers (0x01322D and 0x041E95 both use slot 0xD14026)
// ---------------------------------------------------------------------------

const WRAPPER_TARGETS = [0x01322D, 0x041E95];
const wrapperCallers = [];

console.log('\n=== Wrapper function callers (implicit slot 0xD14026) ===');

for (const target of WRAPPER_TARGETS) {
  const sites = findCallSites(target);
  console.log(`\nCALL 0x${target.toString(16).padStart(6, '0')}: ${sites.length} caller(s)`);

  for (const callPC of sites) {
    // Extract bit-flag argument: pattern 01 xx xx xx C5 CD ...
    let bitFlag = null;
    if (callPC >= 2 && rom[callPC - 1] === 0xC5 && callPC >= 6 && rom[callPC - 5] === 0x01) {
      bitFlag = rom[callPC - 4] | (rom[callPC - 3] << 8) | (rom[callPC - 2] << 16);
    }

    const flagStr = bitFlag !== null
      ? `flag=0x${bitFlag.toString(16).padStart(6, '0')} (bit ${Math.log2(bitFlag)})`
      : 'flag=dynamic';
    console.log(`  0x${callPC.toString(16).padStart(6, '0')}  ${flagStr}`);

    wrapperCallers.push({ callPC, target, bitFlag });
  }
}

// ---------------------------------------------------------------------------
// 4. Collect all unique callback slots
// ---------------------------------------------------------------------------

const slotMap = new Map(); // slotAddr -> { dispatchCount, wrapperCount }

for (const [, info] of allIndcallSites) {
  if (info.slotAddr !== null) {
    if (!slotMap.has(info.slotAddr)) slotMap.set(info.slotAddr, { dispatchPCs: [], wrapperPCs: [] });
    slotMap.get(info.slotAddr).dispatchPCs.push(info);
  }
}

// Wrapper callers all go through 0xD14026
const WRAPPER_SLOT = 0xD14026;
if (!slotMap.has(WRAPPER_SLOT)) slotMap.set(WRAPPER_SLOT, { dispatchPCs: [], wrapperPCs: [] });
for (const wc of wrapperCallers) {
  slotMap.get(WRAPPER_SLOT).wrapperPCs.push(wc);
}

// ---------------------------------------------------------------------------
// 5. Find writers (LD (slot),BC and LD (slot),HL) for each slot
// ---------------------------------------------------------------------------

function findWriters(slot) {
  const lo = slot & 0xFF;
  const mi = (slot >> 8) & 0xFF;
  const hi = (slot >> 16) & 0xFF;
  const writers = [];

  for (let i = 0; i < rom.length - 4; i++) {
    // LD (slot),BC = ED 43 lo mi hi
    if (rom[i] === 0xED && rom[i + 1] === 0x43 && rom[i + 2] === lo && rom[i + 3] === mi && rom[i + 4] === hi) {
      let val = null;
      // LD BC,nn = 01 xx xx xx (4 bytes). Immediately before the store (at i-4)
      // or with at most one short intervening instruction (up to i-8).
      // Tight window avoids false matches on address bytes from unrelated instructions.
      for (let j = i - 4; j >= Math.max(0, i - 8); j--) {
        if (rom[j] === 0x01) {
          val = rom[j + 1] | (rom[j + 2] << 8) | (rom[j + 3] << 16);
          break;
        }
      }
      writers.push({ pc: i, reg: 'BC', val });
    }
    // LD (slot),HL = 22 lo mi hi
    if (rom[i] === 0x22 && rom[i + 1] === lo && rom[i + 2] === mi && rom[i + 3] === hi) {
      let val = null;
      for (let j = i - 4; j >= Math.max(0, i - 8); j--) {
        if (rom[j] === 0x21) {
          val = rom[j + 1] | (rom[j + 2] << 8) | (rom[j + 3] << 16);
          break;
        }
      }
      writers.push({ pc: i, reg: 'HL', val });
    }
  }
  return writers;
}

console.log('\n=== Callback Slot Catalog ===');
console.log('');

const sortedSlots = [...slotMap.entries()].sort((a, b) => a[0] - b[0]);

for (const [slot, info] of sortedSlots) {
  const writers = findWriters(slot);
  const directCount = info.dispatchPCs.length;
  const wrapperCount = info.wrapperPCs.length;

  console.log(`Slot 0x${slot.toString(16).padStart(6, '0')}:`);
  console.log(`  Direct dispatch sites: ${directCount}`);
  console.log(`  Wrapper dispatch sites: ${wrapperCount}`);
  console.log(`  Total dispatch: ${directCount + wrapperCount}`);
  console.log(`  Writers: ${writers.length}`);

  for (const w of writers) {
    const valStr = w.val !== null
      ? `0x${w.val.toString(16).padStart(6, '0')}`
      : 'dynamic';
    console.log(`    PC=0x${w.pc.toString(16).padStart(6, '0')}  ${w.reg}=${valStr}`);
  }
  console.log('');
}

// ---------------------------------------------------------------------------
// 6. Count IX-frame-based dispatch sites (C function pointer calls)
// ---------------------------------------------------------------------------

let frameBasedCount = 0;
for (const [, info] of allIndcallSites) {
  if (info.slotAddr === null) frameBasedCount++;
}

console.log('=== Summary ===');
console.log(`JP (IY) trampoline locations: ${jpIYSites.length} (at 0x002288)`);
console.log(`Entry points: 0x00015C (JP 0x002288), 0x002288 (JP (IY))`);
console.log(`Total CALL _indcall sites: ${allIndcallSites.size}`);
console.log(`  Slot-based (LD IY,(fixed_addr)): ${allIndcallSites.size - frameBasedCount}`);
console.log(`  Frame-based (C function pointer): ${frameBasedCount}`);
console.log(`Wrapper callers (slot 0xD14026): ${wrapperCallers.length}`);
console.log(`  via 0x01322D: ${wrapperCallers.filter(w => w.target === 0x01322D).length}`);
console.log(`  via 0x041E95: ${wrapperCallers.filter(w => w.target === 0x041E95).length}`);
console.log(`Unique fixed callback slots: ${slotMap.size}`);
console.log('');

// Bit-flag summary for wrapper callers
const flagMap = new Map();
for (const wc of wrapperCallers) {
  if (wc.bitFlag !== null) {
    const key = wc.bitFlag;
    flagMap.set(key, (flagMap.get(key) || 0) + 1);
  }
}

console.log('=== Event Bit-Flags (wrapper dispatch via slot 0xD14026) ===');
const sortedFlags = [...flagMap.entries()].sort((a, b) => a[0] - b[0]);
for (const [flag, count] of sortedFlags) {
  const bit = Math.log2(flag);
  console.log(`  bit ${bit.toString().padStart(2)}: 0x${flag.toString(16).padStart(6, '0')}  (${count} caller(s))`);
}

console.log('\nDone.');
