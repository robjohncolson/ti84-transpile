#!/usr/bin/env node

/**
 * Phase 131 — Find all ROM writers to 0xD0060E (FP category byte)
 *
 * Part A: Binary scan ROM.rom for all instructions that write to 0xD0060E
 *   - LD (0xD0060E),A  = 32 0E 06 D0
 *   - LD (0xD0060E),HL = 22 0E 06 D0
 *   - ED-prefixed stores (e.g. LD (nn),BC/DE/SP/IX/IY)
 *   - Disassemble context around each writer
 *   - Check coverage status in BLOCKS
 *
 * Part B: Document FP handler table at 0x068580-0x0685AA
 *   - Disassemble all 6 entries
 *   - Check 0x06859B coverage
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { readReal } from './fp-real.mjs';
import { decodeInstruction as decodeEz80 } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

// ── Constants ──────────────────────────────────────────────────────────────

const TARGET_ADDR = 0xD0060E;  // FP category byte slot

// Target byte patterns (little-endian address: 0E 06 D0)
const ADDR_BYTES = [0x0E, 0x06, 0xD0];

// ── Utilities ──────────────────────────────────────────────────────────────

const hex = (v, w = 6) =>
  v === undefined || v === null
    ? 'n/a'
    : `0x${(Number(v) >>> 0).toString(16).toUpperCase().padStart(w, '0')}`;

function hexBytes(m, a, n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push((m[a + i] & 0xff).toString(16).toUpperCase().padStart(2, '0'));
  return out.join(' ');
}

function blockExists(addr) {
  if (BLOCKS.has) return BLOCKS.has(addr);
  if (typeof BLOCKS.get === 'function') return BLOCKS.get(addr) !== undefined;
  return (addr in BLOCKS) || BLOCKS[addr] !== undefined;
}

function disassembleRange(source, startAddr, endAddr) {
  let pc = startAddr;
  const lines = [];
  while (pc < endAddr) {
    try {
      const instr = decodeEz80(source, pc, true); // ADL mode
      const bytes = hexBytes(source, pc, instr.length);
      const covered = blockExists(pc) ? '' : ' [NOT IN BLOCKS]';
      lines.push(`  ${hex(pc)}: ${bytes.padEnd(20)} ${instr.mnemonic || instr.tag || '???'}${covered}`);
      pc += instr.length;
    } catch (e) {
      lines.push(`  ${hex(pc)}: ${hexBytes(source, pc, 1).padEnd(20)} ??? (decode error: ${e.message})`);
      pc += 1;
    }
  }
  return lines;
}

// ── Part A: Binary scan for writers to 0xD0060E ──────────────────────────

function scanForWriters() {
  console.log('='.repeat(70));
  console.log('  Part A: ROM binary scan for instructions writing to 0xD0060E');
  console.log('='.repeat(70));

  const results = [];

  // Pattern 1: LD (nn),A = opcode 0x32 followed by 0E 06 D0
  console.log('\n  --- Scan 1: LD (0xD0060E),A  [32 0E 06 D0] ---');
  for (let addr = 0; addr < 0x400000 - 3; addr++) {
    if ((romBytes[addr] & 0xff) === 0x32 &&
        (romBytes[addr + 1] & 0xff) === ADDR_BYTES[0] &&
        (romBytes[addr + 2] & 0xff) === ADDR_BYTES[1] &&
        (romBytes[addr + 3] & 0xff) === ADDR_BYTES[2]) {
      results.push({ addr, type: 'LD (0xD0060E),A', opcode: 0x32 });
      console.log(`    Found at ${hex(addr)}: ${hexBytes(romBytes, addr, 4)}`);
    }
  }

  // Pattern 2: LD (nn),HL = opcode 0x22 followed by 0E 06 D0
  console.log('\n  --- Scan 2: LD (0xD0060E),HL  [22 0E 06 D0] ---');
  for (let addr = 0; addr < 0x400000 - 3; addr++) {
    if ((romBytes[addr] & 0xff) === 0x22 &&
        (romBytes[addr + 1] & 0xff) === ADDR_BYTES[0] &&
        (romBytes[addr + 2] & 0xff) === ADDR_BYTES[1] &&
        (romBytes[addr + 3] & 0xff) === ADDR_BYTES[2]) {
      results.push({ addr, type: 'LD (0xD0060E),HL', opcode: 0x22 });
      console.log(`    Found at ${hex(addr)}: ${hexBytes(romBytes, addr, 4)}`);
    }
  }

  // Pattern 3: ED-prefixed stores: LD (nn),rr
  // ED 43 nn = LD (nn),BC
  // ED 53 nn = LD (nn),DE
  // ED 63 nn = LD (nn),HL (alternate)
  // ED 73 nn = LD (nn),SP
  // DD ED 43/53/63/73 = IX-prefixed variants
  // FD ED 43/53/63/73 = IY-prefixed variants
  console.log('\n  --- Scan 3: ED-prefixed stores to 0xD0060E ---');
  const edStoreOps = [0x43, 0x53, 0x63, 0x73];
  const edStoreNames = { 0x43: 'BC', 0x53: 'DE', 0x63: 'HL', 0x73: 'SP' };
  for (let addr = 0; addr < 0x400000 - 4; addr++) {
    if ((romBytes[addr] & 0xff) === 0xED) {
      const op2 = romBytes[addr + 1] & 0xff;
      if (edStoreOps.includes(op2)) {
        if ((romBytes[addr + 2] & 0xff) === ADDR_BYTES[0] &&
            (romBytes[addr + 3] & 0xff) === ADDR_BYTES[1] &&
            (romBytes[addr + 4] & 0xff) === ADDR_BYTES[2]) {
          const regName = edStoreNames[op2];
          results.push({ addr, type: `LD (0xD0060E),${regName} [ED]`, opcode: op2 });
          console.log(`    Found at ${hex(addr)}: ${hexBytes(romBytes, addr, 5)} — LD (0xD0060E),${regName}`);
        }
      }
    }
  }

  // Pattern 4: Check for IX/IY-prefixed LD (nn),IX/IY
  // DD 22 nn = LD (nn),IX
  // FD 22 nn = LD (nn),IY
  console.log('\n  --- Scan 4: DD/FD-prefixed stores to 0xD0060E ---');
  for (let addr = 0; addr < 0x400000 - 4; addr++) {
    const prefix = romBytes[addr] & 0xff;
    if (prefix === 0xDD || prefix === 0xFD) {
      if ((romBytes[addr + 1] & 0xff) === 0x22 &&
          (romBytes[addr + 2] & 0xff) === ADDR_BYTES[0] &&
          (romBytes[addr + 3] & 0xff) === ADDR_BYTES[1] &&
          (romBytes[addr + 4] & 0xff) === ADDR_BYTES[2]) {
        const regName = prefix === 0xDD ? 'IX' : 'IY';
        results.push({ addr, type: `LD (0xD0060E),${regName}`, opcode: prefix });
        console.log(`    Found at ${hex(addr)}: ${hexBytes(romBytes, addr, 5)} — LD (0xD0060E),${regName}`);
      }
    }
  }

  if (results.length === 0) {
    console.log('\n  NO writers to 0xD0060E found in ROM!');
  }

  // ── Disassemble context around each writer ──
  console.log(`\n${'='.repeat(70)}`);
  console.log(`  Disassembly context for ${results.length} writer(s)`);
  console.log('='.repeat(70));

  for (const { addr, type } of results) {
    const covered = blockExists(addr);
    const coverageLabel = covered ? 'COVERED' : 'NOT IN BLOCKS';

    console.log(`\n  --- ${hex(addr)}: ${type} [${coverageLabel}] ---`);

    // Disassemble 10 instructions before (approximate: go back ~30 bytes)
    const contextBefore = Math.max(addr - 40, 0);
    // Disassemble 5 instructions after (approximate: go forward ~20 bytes)
    const contextAfter = Math.min(addr + 20, 0x400000);

    console.log(`  Context (${hex(contextBefore)} - ${hex(contextAfter)}):`);
    const lines = disassembleRange(romBytes, contextBefore, contextAfter);
    for (const line of lines) {
      // Highlight the writer instruction
      if (line.includes(hex(addr))) {
        console.log(`  >>> ${line.trim()}`);
      } else {
        console.log(line);
      }
    }
  }

  return results;
}

// ── Part B: FP handler table at 0x068580-0x0685AA ────────────────────────

function documentHandlerTable() {
  console.log(`\n${'='.repeat(70)}`);
  console.log('  Part B: FP handler table at 0x068580-0x0685AA');
  console.log('='.repeat(70));

  // Check 0x06859B coverage
  const has06859B = blockExists(0x06859B);
  console.log(`\n  0x06859B in BLOCKS: ${has06859B ? 'YES' : 'NO — needs seed'}`);

  // Check nearby blocks in the table region
  console.log('\n  Block coverage in table region 0x068580-0x0685B0:');
  for (let addr = 0x068580; addr <= 0x0685B0; addr++) {
    if (blockExists(addr)) {
      console.log(`    ${hex(addr)}: EXISTS in BLOCKS`);
    }
  }

  // Full disassembly of the handler table
  console.log('\n  Full disassembly 0x068580-0x0685B0:');
  const lines = disassembleRange(romBytes, 0x068580, 0x0685B0);
  for (const line of lines) console.log(line);

  // Parse entries: each should be LD A,nn; CALL 0x0689DE; RET
  console.log('\n  Handler table entries (expected: LD A,xx; CALL 0x0689DE; RET):');
  let pc = 0x068580;
  let entryIdx = 0;
  while (pc < 0x0685AA) {
    try {
      const instr1 = decodeEz80(romBytes, pc, true);
      const instr1Bytes = hexBytes(romBytes, pc, instr1.length);
      const instr1Mn = instr1.mnemonic || instr1.tag || '???';

      let entryStart = pc;
      pc += instr1.length;

      const instr2 = decodeEz80(romBytes, pc, true);
      const instr2Bytes = hexBytes(romBytes, pc, instr2.length);
      const instr2Mn = instr2.mnemonic || instr2.tag || '???';
      pc += instr2.length;

      const instr3 = decodeEz80(romBytes, pc, true);
      const instr3Bytes = hexBytes(romBytes, pc, instr3.length);
      const instr3Mn = instr3.mnemonic || instr3.tag || '???';
      pc += instr3.length;

      const covered = blockExists(entryStart) ? 'COVERED' : 'MISSING';
      console.log(`    Entry ${entryIdx} @ ${hex(entryStart)} [${covered}]:`);
      console.log(`      ${instr1Bytes.padEnd(16)} ${instr1Mn}`);
      console.log(`      ${instr2Bytes.padEnd(16)} ${instr2Mn}`);
      console.log(`      ${instr3Bytes.padEnd(16)} ${instr3Mn}`);

      entryIdx++;
    } catch (e) {
      console.log(`    Error at ${hex(pc)}: ${e.message}`);
      pc += 1;
    }
  }

  // Extended disassembly of the CALL target 0x0689DE
  console.log('\n  Disassembly of CALL target 0x0689DE (first 20 bytes):');
  const targetLines = disassembleRange(romBytes, 0x0689DE, 0x0689FE);
  for (const line of targetLines) console.log(line);

  return { has06859B };
}

// ── Summary ──────────────────────────────────────────────────────────────

function printSummary(writers, handlerInfo) {
  console.log(`\n${'='.repeat(70)}`);
  console.log('  SUMMARY');
  console.log('='.repeat(70));

  console.log(`\n  Total ROM writers to 0xD0060E: ${writers.length}`);
  for (const w of writers) {
    const covered = blockExists(w.addr) ? 'COVERED' : 'NOT IN BLOCKS';
    console.log(`    ${hex(w.addr)}: ${w.type} [${covered}]`);
  }

  const uncovered = writers.filter(w => !blockExists(w.addr));
  if (uncovered.length > 0) {
    console.log(`\n  MISSING SEEDS (writers not in BLOCKS):`);
    for (const w of uncovered) {
      console.log(`    ${hex(w.addr)}: ${w.type}`);
    }
  }

  console.log(`\n  0x06859B (FP handler entry) in BLOCKS: ${handlerInfo.has06859B ? 'YES' : 'NO — needs seed'}`);
  console.log('');
}

// ── Main ───────────────────────────────────────────────────────────────────

function main() {
  console.log('=== Phase 131: FP Category Byte (0xD0060E) Writers ===\n');

  const writers = scanForWriters();
  const handlerInfo = documentHandlerTable();
  printSummary(writers, handlerInfo);
}

try {
  main();
} catch (error) {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
}
