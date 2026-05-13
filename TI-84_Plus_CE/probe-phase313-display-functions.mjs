#!/usr/bin/env node
// Phase 313 - Display/cursor state functions at vectors 0x0003EC and 0x0003F0
// Disassembles both functions, maps D17700-D17721 RAM references, traces callers.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romPath = path.join(__dirname, 'ROM.rom');
const rom = fs.readFileSync(romPath);

// ── Helpers ──

function hex(v, w = 6) {
  return '0x' + (v >>> 0).toString(16).toUpperCase().padStart(w, '0');
}

function disasmRange(start, maxInstructions) {
  let pc = start;
  const lines = [];
  for (let i = 0; i < maxInstructions; i++) {
    try {
      const inst = decodeInstruction(rom, pc, 'adl');
      const rawBytes = [];
      for (let b = 0; b < inst.length; b++) rawBytes.push(rom[pc + b].toString(16).padStart(2, '0'));

      let desc = inst.tag;
      if (inst.pair) desc += ' ' + inst.pair;
      if (inst.dest && !inst.pair) desc += ' ' + inst.dest;
      if (inst.src) desc += ', ' + inst.src;
      if (inst.value !== undefined) desc += ' = ' + hex(inst.value);
      if (inst.addr !== undefined) desc += ' [' + hex(inst.addr) + ']';
      if (inst.target !== undefined && (inst.tag.includes('call') || inst.tag.includes('jp') || inst.tag.includes('jr'))) {
        desc += ' -> ' + hex(inst.target);
      }
      if (inst.indexRegister) {
        desc += ' (' + inst.indexRegister;
        if (inst.displacement !== undefined) desc += (inst.displacement >= 0 ? '+' : '') + inst.displacement;
        desc += ')';
      }
      if (inst.condition) desc += ' ?' + inst.condition;

      lines.push({
        addr: pc,
        hex: rawBytes.join(' '),
        desc,
        inst,
      });

      if (inst.tag === 'ret' || inst.tag === 'jp-indirect') break;
      pc = inst.nextPc;
    } catch (e) {
      lines.push({ addr: pc, hex: '', desc: 'ERROR: ' + e.message, inst: null });
      break;
    }
  }
  return lines;
}

function printDisasm(label, lines) {
  console.log(label);
  for (const l of lines) {
    console.log('  ' + hex(l.addr) + '  ' + l.hex.padEnd(20) + '  ' + l.desc);
  }
}

function countCallers(targetAddr) {
  const callers = [];
  for (let pc = 0; pc < rom.length - 3; pc++) {
    const op = rom[pc];
    if (op === 0xCD || (op & 0xC7) === 0xC4) {
      const target = rom[pc + 1] | (rom[pc + 2] << 8) | (rom[pc + 3] << 16);
      if (target === targetAddr) callers.push(pc);
    }
  }
  return callers;
}

function scanRamRefs(lo, hi) {
  const refs = new Map();
  for (let pc = 0; pc < rom.length - 2; pc++) {
    const addr24 = rom[pc] | (rom[pc + 1] << 8) | (rom[pc + 2] << 16);
    if (addr24 >= lo && addr24 <= hi) {
      if (!refs.has(addr24)) refs.set(addr24, []);
      refs.get(addr24).push(pc);
    }
  }
  return refs;
}

// ── Disassemble both functions ──

console.log('Phase 313: Display/Cursor State Functions');
console.log('=========================================\n');

const func3 = disasmRange(0x0152D8, 60);
printDisasm('3-arg function at 0x0152D8 (vector 0x0003EC -> target 0x0152D8):', func3);

console.log();

const func6 = disasmRange(0x015349, 80);
printDisasm('6-arg function at 0x015349 (vector 0x0003F0 -> target 0x015349):', func6);

// ── Verify vectors ──

console.log('\n--- Vector verification ---');
const vec3EC = rom[0x3EC] === 0xC3 ? (rom[0x3ED] | (rom[0x3EE] << 8) | (rom[0x3EF] << 16)) : null;
const vec3F0 = rom[0x3F0] === 0xC3 ? (rom[0x3F1] | (rom[0x3F2] << 8) | (rom[0x3F3] << 16)) : null;
console.log('  0x0003EC: JP ' + (vec3EC ? hex(vec3EC) : 'INVALID') + (vec3EC === 0x0152D8 ? ' OK' : ' MISMATCH'));
console.log('  0x0003F0: JP ' + (vec3F0 ? hex(vec3F0) : 'INVALID') + (vec3F0 === 0x015349 ? ' OK' : ' MISMATCH'));

// ── RAM address map ──

console.log('\n--- D17700-D17730 RAM reference counts ---');
const ramRefs = scanRamRefs(0xD17700, 0xD17730);
const sorted = [...ramRefs.entries()].sort((a, b) => a[0] - b[0]);
for (const [addr, offsets] of sorted) {
  console.log('  ' + hex(addr) + ': ' + offsets.length + ' refs');
}

// ── RAM bytes used by each function ──

console.log('\n--- RAM addresses written by 3-arg function (0x0152D8) ---');
const ram3 = new Set();
for (const l of func3) {
  if (!l.inst) continue;
  if (l.inst.addr !== undefined && l.inst.addr >= 0xD17700 && l.inst.addr <= 0xD17730) {
    const dir = l.inst.tag.includes('to-mem') || l.inst.tag === 'ld-mem-reg' || l.inst.tag === 'ld-mem-pair' ? 'WRITE' : 'READ';
    console.log('  ' + hex(l.addr) + '  ' + dir + ' ' + hex(l.inst.addr) + '  ' + l.desc);
    ram3.add(l.inst.addr);
  }
}

console.log('\n--- RAM addresses written by 6-arg function (0x015349) ---');
const ram6 = new Set();
for (const l of func6) {
  if (!l.inst) continue;
  if (l.inst.addr !== undefined && l.inst.addr >= 0xD17700 && l.inst.addr <= 0xD17730) {
    const dir = l.inst.tag.includes('to-mem') || l.inst.tag === 'ld-mem-reg' || l.inst.tag === 'ld-mem-pair' ? 'WRITE' : 'READ';
    console.log('  ' + hex(l.addr) + '  ' + dir + ' ' + hex(l.inst.addr) + '  ' + l.desc);
    ram6.add(l.inst.addr);
  }
}

// ── Caller analysis ──

console.log('\n--- Callers of 0x0003EC (3-arg) ---');
const callers3 = countCallers(0x0003EC);
console.log('Total: ' + callers3.length + ' call sites');

const sampleCallers3 = callers3.slice(0, 5);
for (const caller of sampleCallers3) {
  console.log('\n  Caller at ' + hex(caller) + ':');
  const ctx = disasmRange(Math.max(0, caller - 30), 20);
  for (const l of ctx) {
    const marker = l.addr === caller ? ' <<< CALL' : '';
    console.log('    ' + hex(l.addr) + '  ' + l.desc + marker);
  }
}

console.log('\n--- Callers of 0x0003F0 (6-arg) ---');
const callers6 = countCallers(0x0003F0);
console.log('Total: ' + callers6.length + ' call sites');

const sampleCallers6 = callers6.slice(0, 5);
for (const caller of sampleCallers6) {
  console.log('\n  Caller at ' + hex(caller) + ':');
  const ctx = disasmRange(Math.max(0, caller - 40), 25);
  for (const l of ctx) {
    const marker = l.addr === caller ? ' <<< CALL' : '';
    console.log('    ' + hex(l.addr) + '  ' + l.desc + marker);
  }
}

// ── Argument convention analysis ──

console.log('\n--- Argument passing convention (ZDS II C ABI) ---');
console.log('Both functions use the ZDS II C stack frame convention:');
console.log('  1. LD HL, -6 (0xFFFFFA) — reserve 6 bytes of local space');
console.log('  2. CALL 0x002197 — frame helper: saves IX, sets IX = SP + locals');
console.log('  3. Arguments are at positive IX offsets above the return address');
console.log('');

console.log('3-arg function (0x0152D8):');
console.log('  IX+6  = arg1 (24-bit pointer: base address for span)');
console.log('  IX+9  = arg2 (8-bit: count / span length)');
console.log('  IX+12 = arg3 (24-bit pointer: source/fill pointer)');
console.log('  Writes: D1770D (current pointer), D17710 (source ptr), D17719 (counter)');
console.log('');

console.log('6-arg function (0x015349):');
console.log('  IX+6  = arg1 (24-bit pointer: source/fill pointer)');
console.log('  IX+9  = arg2 (8-bit: fill byte / attribute)');
console.log('  IX+12 = arg3 (24-bit pointer: secondary source ptr)');
console.log('  IX+15 = arg4 (8-bit: secondary fill byte)');
console.log('  IX+18 = arg5 (8-bit: row count / height)');
console.log('  IX+21 = arg6 (24-bit pointer: stride / column ptr)');
console.log('  Writes: D1770D, D1771E, D17719, D17721');
console.log('  Special: if arg5 == 8, overrides D17719 = 4 (half-height mode)');

// ── Relationship between 3-arg and 6-arg ──

console.log('\n--- Relationship between functions ---');
console.log('The 3-arg function does NOT call the 6-arg function.');
console.log('Both share the same loop structure:');
console.log('  1. Set up D1770D as a working pointer');
console.log('  2. Store counter in D17719');
console.log('  3. Loop: decrement D17719, copy byte from source ptr to dest ptr');
console.log('  4. Update pointers, repeat until counter reaches 0');
console.log('');
console.log('The 6-arg function is a superset:');
console.log('  - Uses D1771E/D17721 as a second source/fill pair (the 3-arg version uses D17710)');
console.log('  - Has a special case: when arg5 (row count) == 8, enters a different loop');
console.log('    that calls 0x002553 (bit-rotate helper) for pixel-level manipulation');
console.log('  - Otherwise falls through to the same decrement-and-copy pattern');

// ── RAM map summary ──

console.log('\n--- D17700-D17721 RAM map (byte purposes) ---');
const ramMap = [
  [0xD17700, 3, 'Unknown (3 refs) — possibly base/origin pointer'],
  [0xD17701, 1, 'Unknown (1 ref) — possibly MSB of base pointer'],
  [0xD1770A, 3, 'FP workspace / text buffer base pointer (155 refs — highest traffic in region)'],
  [0xD1770D, 3, 'Current working pointer (23 refs) — updated by both functions during span copy'],
  [0xD17710, 3, 'Source/fill pointer (9 refs) — set by 3-arg function from arg1'],
  [0xD17713, 3, 'Text cursor column or X position (150 refs)'],
  [0xD17716, 3, 'Text cursor row or Y position (112 refs)'],
  [0xD17719, 1, 'Span counter / remaining rows (21 refs) — decremented in loop'],
  [0xD1771A, 3, 'Text window base / display region pointer (167 refs — highest overall)'],
  [0xD1771B, 1, 'Window base byte 1 (5 refs)'],
  [0xD1771C, 1, 'Window base byte 2 (5 refs)'],
  [0xD1771D, 1, 'Text attribute / display mode byte (89 refs)'],
  [0xD1771E, 3, 'Secondary source pointer (19 refs) — set by 6-arg function'],
  [0xD17721, 1, 'Secondary fill/attribute byte (9 refs) — set by 6-arg function'],
];

for (const [addr, size, desc] of ramMap) {
  console.log('  ' + hex(addr) + ' (' + size + ' byte' + (size > 1 ? 's' : '') + '): ' + desc);
}

console.log('\n--- Summary ---');
console.log('Vector 0x0003EC (3-arg, 74 callers): "SetTextSpan" — sets up a memory span');
console.log('  for text/display operations. Copies bytes from a source pointer into a');
console.log('  destination region, decrementing a counter. Used for filling display rows,');
console.log('  clearing text regions, and initializing cursor positions.');
console.log('');
console.log('Vector 0x0003F0 (6-arg, 85 callers): "SetDisplayRegion" — extended version');
console.log('  that sets up both primary and secondary source/fill pairs. Has special');
console.log('  handling for 8-row regions (pixel-level bit rotation via 0x002553).');
console.log('  Used for graph rendering, menu setup, and editor initialization.');
console.log('');
console.log('Phase 313 probe complete.');
