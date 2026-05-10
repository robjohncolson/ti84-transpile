#!/usr/bin/env node
/**
 * probe-phase288-046500-callers.mjs
 *
 * Find all CALL/JP instructions targeting 0x046500 (full keyboard matrix scanner)
 * in the ROM region 0x000000-0x0BFFFF. Decode context around each call site.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const DECODER_PATH = path.join(__dirname, 'ez80-decoder.js');

const { decodeInstruction } = await import(pathToFileURL(DECODER_PATH).href);

const rom = fs.readFileSync(ROM_PATH);

const TARGET = 0x046500;
const SCAN_START = 0x000000;
const SCAN_END = 0x0BFFFF;
const CONTEXT_INSTRS = 5;

// Target bytes in little-endian
const TARGET_LO = (TARGET >>> 0) & 0xFF;   // 0x00
const TARGET_MID = (TARGET >>> 8) & 0xFF;  // 0x65
const TARGET_HI = (TARGET >>> 16) & 0xFF;  // 0x04

// Opcodes that take a 24-bit address operand (ADL mode)
// CALL nn = 0xCD
// JP nn = 0xC3
// JP cc,nn = 0xC2, 0xCA, 0xD2, 0xDA, 0xE2, 0xEA, 0xF2, 0xFA
const CALL_OPCODES = [0xCD];
const JP_OPCODES = [0xC3, 0xC2, 0xCA, 0xD2, 0xDA, 0xE2, 0xEA, 0xF2, 0xFA];
const ALL_OPCODES = new Set([...CALL_OPCODES, ...JP_OPCODES]);

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function decodeAt(pc) {
  if (pc < 0 || pc >= rom.length) return null;
  try {
    const result = decodeInstruction(rom, pc, 'adl');
    if (!result || !result.length) return null;
    return result;
  } catch {
    return null;
  }
}

function decodeContext(centerPc, beforeCount, afterCount) {
  const lines = [];

  // Decode instructions before
  // Walk backwards by scanning from a safe distance
  const lookback = 64;
  const startPc = Math.max(0, centerPc - lookback);
  const instrsBefore = [];
  let pc = startPc;
  while (pc < centerPc) {
    const instr = decodeAt(pc);
    if (!instr || instr.length === 0) { pc++; continue; }
    instrsBefore.push({ pc, instr });
    pc += instr.length;
  }

  // Take last N instructions before
  const beforeSlice = instrsBefore.slice(-beforeCount);
  for (const { pc: iPc, instr } of beforeSlice) {
    lines.push(formatInstr(iPc, instr, false));
  }

  // The call/jp instruction itself
  const centerInstr = decodeAt(centerPc);
  if (centerInstr) {
    lines.push(formatInstr(centerPc, centerInstr, true));
  }

  // Decode instructions after
  let afterPc = centerPc + (centerInstr ? centerInstr.length : 4);
  for (let i = 0; i < afterCount; i++) {
    const instr = decodeAt(afterPc);
    if (!instr || instr.length === 0) break;
    lines.push(formatInstr(afterPc, instr, false));
    afterPc += instr.length;
  }

  return lines;
}

function formatInstr(pc, instr, highlight) {
  const marker = highlight ? ' <<<' : '';
  const bytes = Array.from(rom.slice(pc, pc + instr.length))
    .map(b => b.toString(16).padStart(2, '0'))
    .join(' ');
  const mnemonic = instr.mnemonic || '???';
  const operands = instr.operands ? ` ${instr.operands}` : '';
  return `  ${hex(pc)}  ${bytes.padEnd(14)}  ${mnemonic}${operands}${marker}`;
}

// --- Main scan ---

console.log(`=== Probe Phase 288: Callers of 0x046500 (Full Keyboard Matrix Scanner) ===`);
console.log(`Scanning ROM ${hex(SCAN_START)} - ${hex(SCAN_END)} for CALL/JP to ${hex(TARGET)}\n`);

const matches = [];

for (let addr = SCAN_START; addr <= SCAN_END - 3; addr++) {
  const opcode = rom[addr];
  if (!ALL_OPCODES.has(opcode)) continue;

  // Check if next 3 bytes are the target address in little-endian
  if (rom[addr + 1] === TARGET_LO &&
      rom[addr + 2] === TARGET_MID &&
      rom[addr + 3] === TARGET_HI) {
    const type = CALL_OPCODES.includes(opcode) ? 'CALL' : 'JP';
    matches.push({ addr, opcode, type });
  }
}

console.log(`Found ${matches.length} direct reference(s) to ${hex(TARGET)}:\n`);

for (const match of matches) {
  console.log(`--- ${match.type} at ${hex(match.addr)} (opcode ${hex(match.opcode, 2)}) ---`);
  const context = decodeContext(match.addr, CONTEXT_INSTRS, CONTEXT_INSTRS);
  for (const line of context) {
    console.log(line);
  }
  console.log('');
}

// --- Check fall-through from 0x0464FF ---

console.log(`\n=== Fall-through check at ${hex(TARGET - 1)} ===`);
console.log(`Decoding instructions leading up to ${hex(TARGET)}:\n`);

const lookbackFt = 32;
const ftStart = Math.max(0, TARGET - lookbackFt);
let ftPc = ftStart;
const ftInstrs = [];
while (ftPc < TARGET) {
  const instr = decodeAt(ftPc);
  if (!instr || instr.length === 0) { ftPc++; continue; }
  ftInstrs.push({ pc: ftPc, instr });
  ftPc += instr.length;
}

const lastFew = ftInstrs.slice(-6);
for (const { pc, instr } of lastFew) {
  const marker = (pc + instr.length === TARGET) ? ' <<< immediately before target' : '';
  const bytes = Array.from(rom.slice(pc, pc + instr.length))
    .map(b => b.toString(16).padStart(2, '0'))
    .join(' ');
  const operands = instr.operands ? ` ${instr.operands}` : '';
  console.log(`  ${hex(pc)}  ${bytes.padEnd(14)}  ${instr.mnemonic}${operands}${marker}`);
}

const lastInstr = lastFew[lastFew.length - 1];
if (lastInstr) {
  const lastMnem = (lastInstr.instr.mnemonic || 'unknown').toLowerCase();
  const endsAtTarget = lastInstr.pc + lastInstr.instr.length === TARGET;
  if (endsAtTarget) {
    const isTerminator = ['ret', 'reti', 'retn', 'jp', 'jr'].includes(lastMnem) ||
                         (lastMnem === 'jp' && !lastInstr.instr.operands?.includes(','));
    if (isTerminator) {
      console.log(`\n  -> Last instruction before ${hex(TARGET)} is "${lastMnem}" — NO fall-through.`);
    } else {
      console.log(`\n  -> Last instruction before ${hex(TARGET)} is "${lastMnem}" — POSSIBLE fall-through!`);
    }
  } else {
    console.log(`\n  -> Instruction boundary does not align with ${hex(TARGET)}.`);
  }
}

// --- Also scan for indirect references (LD reg, 0x046500 patterns) ---

console.log(`\n\n=== Indirect references: LD with immediate ${hex(TARGET)} ===`);
console.log(`Scanning for 3-byte sequence 00 65 04 that could be address loads...\n`);

const indirectMatches = [];

for (let addr = SCAN_START; addr <= SCAN_END - 3; addr++) {
  if (rom[addr] === TARGET_LO && rom[addr + 1] === TARGET_MID && rom[addr + 2] === TARGET_HI) {
    // Skip if this is already a CALL/JP match
    if (addr > 0 && ALL_OPCODES.has(rom[addr - 1])) continue;

    // Try decoding the instruction that contains this address
    // Look back a few bytes for the opcode
    let found = false;
    for (let lookback = 1; lookback <= 4; lookback++) {
      const instrPc = addr - lookback;
      if (instrPc < 0) continue;
      const instr = decodeAt(instrPc);
      if (!instr) continue;
      // Check if this instruction spans our target bytes
      if (instrPc + instr.length > addr + 2) {
        const mnem = instr.mnemonic.toLowerCase();
        if (mnem === 'ld' || mnem === 'push') {
          indirectMatches.push({ pc: instrPc, instr });
          found = true;
          break;
        }
      }
    }
  }
}

if (indirectMatches.length === 0) {
  console.log('  No indirect LD references found.');
} else {
  console.log(`  Found ${indirectMatches.length} indirect reference(s):\n`);
  for (const { pc, instr } of indirectMatches) {
    const bytes = Array.from(rom.slice(pc, pc + instr.length))
      .map(b => b.toString(16).padStart(2, '0'))
      .join(' ');
    const operands = instr.operands ? ` ${instr.operands}` : '';
    console.log(`  ${hex(pc)}  ${bytes.padEnd(14)}  ${instr.mnemonic}${operands}`);

    // Show a bit of context
    const ctx = decodeContext(pc, 3, 3);
    for (const line of ctx) {
      console.log(`    ${line}`);
    }
    console.log('');
  }
}

console.log('\n=== Done ===');
