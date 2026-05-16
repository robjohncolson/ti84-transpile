#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const rom = new Uint8Array(fs.readFileSync(ROM_PATH));

const ROM_SIZE = rom.length;

// Targets to scan for
const TARGETS = [
  {
    label: '0xD005F6 writers (callback address)',
    patterns: [
      { name: 'LD (0xD005F6),A', bytes: [0x32, 0xF6, 0x05, 0xD0] },
      { name: 'LD (0xD005F6),HL', bytes: [0x22, 0xF6, 0x05, 0xD0] },
    ],
  },
  {
    label: '0xD005F5 writers (countdown byte)',
    patterns: [
      { name: 'LD (0xD005F5),A', bytes: [0x32, 0xF5, 0x05, 0xD0] },
      { name: 'LD (0xD005F5),HL', bytes: [0x22, 0xF5, 0x05, 0xD0] },
    ],
  },
  {
    label: '0x0A32F9 callers (callback invoke)',
    patterns: [
      { name: 'CALL 0x0A32F9', bytes: [0xCD, 0xF9, 0x32, 0x0A] },
    ],
  },
];

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return ((value ?? 0) & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

function bytesAt(offset, length) {
  return Array.from(
    rom.subarray(offset, Math.min(ROM_SIZE, offset + Math.max(length, 0))),
    (v) => hexByte(v),
  ).join(' ');
}

function disasmRange(startPC, endPC) {
  const lines = [];
  let pc = startPC;

  while (pc < endPC && pc < ROM_SIZE) {
    let inst = null;
    try {
      inst = decodeInstruction(rom, pc, 'adl');
    } catch {
      lines.push({ pc, text: `[decode error] ${bytesAt(pc, 1)}`, length: 1 });
      pc += 1;
      continue;
    }

    const length = Math.max(inst?.length ?? 0, 0);
    if (length <= 0) {
      lines.push({ pc, text: `[zero-length] ${bytesAt(pc, 1)}`, length: 1 });
      pc += 1;
      continue;
    }

    const mnemonic = inst.mnemonic ?? inst.tag ?? '??';
    const operands = inst.operands ?? '';
    const text = operands ? `${mnemonic} ${operands}` : mnemonic;

    lines.push({ pc, bytes: bytesAt(pc, length), text, length });
    pc += length;
  }

  return lines;
}

function scanForPattern(patternBytes) {
  const matches = [];
  const patLen = patternBytes.length;

  for (let i = 0; i <= ROM_SIZE - patLen; i += 1) {
    let found = true;
    for (let j = 0; j < patLen; j += 1) {
      if (rom[i + j] !== patternBytes[j]) {
        found = false;
        break;
      }
    }
    if (found) {
      matches.push(i);
    }
  }

  return matches;
}

function printMatch(matchPC, patternName, patternLength) {
  const contextBefore = 20;
  const contextAfter = 10;

  const startPC = Math.max(0, matchPC - contextBefore);
  const endPC = Math.min(ROM_SIZE, matchPC + patternLength + contextAfter);

  console.log(`  Match at ${hex(matchPC)}: ${patternName}`);
  console.log(`  Context [${hex(startPC)} .. ${hex(endPC - 1)}]:`);

  const lines = disasmRange(startPC, endPC);
  for (const line of lines) {
    const marker = (line.pc === matchPC) ? ' >>>' : '    ';
    const bytesStr = line.bytes ?? bytesAt(line.pc, line.length);
    console.log(`${marker} ${hex(line.pc)}: ${bytesStr.padEnd(20)} ${line.text}`);
  }

  console.log('');
}

function main() {
  console.log('Phase 343: Deferred Callback Pattern Scan');
  console.log(`ROM: ${ROM_PATH}`);
  console.log(`ROM size: ${ROM_SIZE} bytes (${hex(ROM_SIZE, 8)})`);
  console.log('');

  for (const target of TARGETS) {
    console.log(`=== ${target.label} ===`);
    console.log('');

    let totalMatches = 0;

    for (const pattern of target.patterns) {
      const matches = scanForPattern(pattern.bytes);
      totalMatches += matches.length;

      if (matches.length === 0) {
        console.log(`  ${pattern.name}: no matches found`);
        console.log('');
        continue;
      }

      console.log(`  ${pattern.name}: ${matches.length} match(es)`);
      console.log('');

      for (const matchPC of matches) {
        printMatch(matchPC, pattern.name, pattern.bytes.length);
      }
    }

    console.log(`  Total matches for ${target.label}: ${totalMatches}`);
    console.log('');
    console.log('---');
    console.log('');
  }

  console.log('=== Summary ===');
  for (const target of TARGETS) {
    let total = 0;
    for (const pattern of target.patterns) {
      total += scanForPattern(pattern.bytes).length;
    }
    console.log(`  ${target.label}: ${total} match(es)`);
  }
}

main();
