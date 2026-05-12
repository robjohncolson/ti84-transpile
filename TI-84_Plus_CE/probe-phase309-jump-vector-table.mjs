#!/usr/bin/env node

/**
 * Phase 309 Probe: Map the 56-entry jump vector table at 0x000578
 *
 * Session 308 found that 0x000578 is entry [0] in a jump vector table.
 * Each entry is a JP instruction (4 bytes in eZ80 ADL mode: 0xC3 + 3-byte LE address).
 * This probe dumps all 56 entries, validates them, disassembles each target,
 * counts callers, and produces a summary table.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rom = readFileSync(path.join(__dirname, 'ROM.rom'));

// ── Constants ────────────────────────────────────────────────────────

const TABLE_START = 0x000578;
const ENTRY_COUNT = 56;
const ENTRY_SIZE = 4;
const TABLE_END = TABLE_START + ENTRY_COUNT * ENTRY_SIZE; // 0x000658

// ── Known address annotations ────────────────────────────────────────

const KNOWN_NAMES = {
  0x0158A6: 'CheckIfEmulated',
  0x022346: 'TokenDescriptorBuilder',
  0x069A8D: 'SideEffectOrchestrator',
};

// ── Helpers ──────────────────────────────────────────────────────────

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function bytesAt(addr, length) {
  return Array.from(rom.subarray(addr, Math.min(addr + length, rom.length)))
    .map((b) => b.toString(16).toUpperCase().padStart(2, '0'))
    .join(' ');
}

function formatInst(inst) {
  if (!inst) return '<decode error>';
  switch (inst.tag) {
    case 'nop': return 'NOP';
    case 'ret': return 'RET';
    case 'ret-conditional': return `RET ${inst.condition.toUpperCase()}`;
    case 'jp': return `JP ${hex(inst.target)}`;
    case 'jp-conditional': return `JP ${inst.condition.toUpperCase()}, ${hex(inst.target)}`;
    case 'call': return `CALL ${hex(inst.target)}`;
    case 'call-conditional': return `CALL ${inst.condition.toUpperCase()}, ${hex(inst.target)}`;
    case 'jr': return `JR ${hex(inst.target)}`;
    case 'jr-conditional': return `JR ${inst.condition.toUpperCase()}, ${hex(inst.target)}`;
    case 'push': return `PUSH ${inst.pair.toUpperCase()}`;
    case 'pop': return `POP ${inst.pair.toUpperCase()}`;
    case 'ld-reg-reg': return `LD ${inst.dest.toUpperCase()}, ${inst.src.toUpperCase()}`;
    case 'ld-reg-mem': return `LD ${inst.dest.toUpperCase()}, (${hex(inst.addr)})`;
    case 'ld-mem-reg': return `LD (${hex(inst.addr)}), ${inst.src.toUpperCase()}`;
    case 'alu-imm': return `${inst.op.toUpperCase()} ${hex(inst.value, 2)}`;
    case 'alu-reg': return `${inst.op.toUpperCase()} ${inst.src.toUpperCase()}`;
    case 'ld-reg-imm': return `LD ${inst.dest.toUpperCase()}, ${hex(inst.value, 2)}`;
    case 'ld-pair-imm': return `LD ${inst.pair.toUpperCase()}, ${hex(inst.value)}`;
    case 'inc-reg': return `INC ${inst.reg.toUpperCase()}`;
    case 'dec-reg': return `DEC ${inst.reg.toUpperCase()}`;
    default:
      if (inst.dasm) return inst.dasm;
      return `[${inst.tag}]`;
  }
}

function disasmLinear(start, maxInstructions) {
  const lines = [];
  let pc = start;

  for (let i = 0; i < maxInstructions && pc < rom.length; i++) {
    let inst;
    try {
      inst = decodeInstruction(rom, pc, 'adl');
    } catch {
      lines.push({ addr: pc, bytes: bytesAt(pc, 1), text: `DB ${hex(rom[pc], 2)}`, inst: null });
      pc += 1;
      continue;
    }

    if (!inst || !inst.length) {
      lines.push({ addr: pc, bytes: bytesAt(pc, 1), text: `DB ${hex(rom[pc], 2)}`, inst: null });
      pc += 1;
      continue;
    }

    const text = formatInst(inst);
    lines.push({ addr: pc, bytes: bytesAt(pc, inst.length), text, inst });
    pc += inst.length;

    if (inst.tag === 'ret') break;
  }

  return lines;
}

function countCallersOf(targetAddr) {
  // Search for CALL targetAddr pattern: 0xCD + 3-byte LE address
  const b0 = targetAddr & 0xFF;
  const b1 = (targetAddr >> 8) & 0xFF;
  const b2 = (targetAddr >> 16) & 0xFF;
  let count = 0;

  for (let i = 0; i < rom.length - 3; i++) {
    if (rom[i] === 0xCD && rom[i + 1] === b0 && rom[i + 2] === b1 && rom[i + 3] === b2) {
      count++;
    }
  }

  return count;
}

function printSection(title) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(title);
  console.log('='.repeat(80));
}

function printDisasm(lines) {
  for (const line of lines) {
    console.log(`    ${hex(line.addr)}  ${line.bytes.padEnd(20)}  ${line.text}`);
  }
}

// ======================================================================
// SECTION 1: Dump all 56 entries
// ======================================================================

printSection('SECTION 1: All 56 jump vector table entries (0x000578 - 0x000657)');

const entries = [];
let allJP = true;

for (let i = 0; i < ENTRY_COUNT; i++) {
  const addr = TABLE_START + i * ENTRY_SIZE;
  const opcode = rom[addr];
  const target = rom[addr + 1] | (rom[addr + 2] << 8) | (rom[addr + 3] << 16);
  const isJP = opcode === 0xC3;

  if (!isJP) allJP = false;

  const name = KNOWN_NAMES[target] || '';
  entries.push({ index: i, addr, opcode, target, isJP, name });

  const flag = isJP ? '  ' : '!!';
  const nameStr = name ? ` (${name})` : '';
  console.log(
    `  [${String(i).padStart(2)}] ${hex(addr)}: ` +
    `opcode=${hex(opcode, 2)} ` +
    `target=${hex(target)} ` +
    `${flag}${nameStr}`
  );
}

// ======================================================================
// SECTION 2: Validation
// ======================================================================

printSection('SECTION 2: Validation');

const nonJP = entries.filter((e) => !e.isJP);
if (nonJP.length === 0) {
  console.log('\n  All 56 entries are JP instructions (opcode 0xC3). Table is clean.');
} else {
  console.log(`\n  WARNING: ${nonJP.length} entries are NOT JP instructions:`);
  for (const e of nonJP) {
    console.log(`    [${e.index}] ${hex(e.addr)}: opcode ${hex(e.opcode, 2)} (expected 0xC3)`);
  }
}

console.log(`\n  All JP: ${allJP}`);

// Unique targets
const uniqueTargets = [...new Set(entries.map((e) => e.target))].sort((a, b) => a - b);
console.log(`  Unique targets: ${uniqueTargets.length} (out of ${ENTRY_COUNT} entries)`);

// Check for duplicates
const targetCounts = {};
for (const e of entries) {
  targetCounts[e.target] = (targetCounts[e.target] || 0) + 1;
}
const dupes = Object.entries(targetCounts).filter(([, c]) => c > 1);
if (dupes.length > 0) {
  console.log('\n  Duplicate targets:');
  for (const [t, c] of dupes) {
    const indices = entries.filter((e) => e.target === Number(t)).map((e) => e.index);
    console.log(`    ${hex(Number(t))}: entries [${indices.join(', ')}] (${c} times)`);
  }
}

// ======================================================================
// SECTION 3: Disassembly of each unique target (first 10 instructions)
// ======================================================================

printSection('SECTION 3: Disassembly of each unique target (first 10 instructions)');

for (const target of uniqueTargets) {
  const matchingEntries = entries.filter((e) => e.target === target);
  const indices = matchingEntries.map((e) => `[${e.index}]`).join(', ');
  const name = KNOWN_NAMES[target] || '';
  const nameStr = name ? ` — ${name}` : '';

  console.log(`\n  --- ${hex(target)} (entries: ${indices})${nameStr} ---`);

  if (target >= rom.length) {
    console.log('    (target is beyond ROM bounds)');
    continue;
  }

  const lines = disasmLinear(target, 10);
  printDisasm(lines);
}

// ======================================================================
// SECTION 4: Caller counts for each entry address
// ======================================================================

printSection('SECTION 4: Caller counts (CALL <entry_addr> sites in ROM)');

console.log('\n  Counting CALL instructions targeting each vector table entry address...\n');

const callerData = [];

for (const e of entries) {
  const callerCount = countCallersOf(e.addr);
  callerData.push({ ...e, callerCount });
}

// Sort by caller count descending for the report
const sortedByCallers = [...callerData].sort((a, b) => b.callerCount - a.callerCount);

for (const e of sortedByCallers) {
  if (e.callerCount === 0) continue;
  const nameStr = e.name ? ` (${e.name})` : '';
  console.log(
    `  [${String(e.index).padStart(2)}] ${hex(e.addr)} -> ${hex(e.target)}: ` +
    `${String(e.callerCount).padStart(4)} callers${nameStr}`
  );
}

const zeroCaller = callerData.filter((e) => e.callerCount === 0);
if (zeroCaller.length > 0) {
  console.log(`\n  Entries with 0 CALL sites: ${zeroCaller.length}`);
  console.log(`  Indices: [${zeroCaller.map((e) => e.index).join(', ')}]`);
  console.log('  (These may be called via computed jumps, indexed access, or JP instead of CALL)');
}

// Also count callers to each target address (the actual function, not the vector)
console.log('\n  --- Callers to target addresses (actual functions) ---\n');

for (const target of uniqueTargets) {
  const callerCount = countCallersOf(target);
  const matchingEntries = entries.filter((e) => e.target === target);
  const indices = matchingEntries.map((e) => `[${e.index}]`).join(', ');
  const name = KNOWN_NAMES[target] || '';
  const nameStr = name ? ` (${name})` : '';

  if (callerCount > 0) {
    console.log(
      `  ${hex(target)} (entries: ${indices}): ` +
      `${String(callerCount).padStart(4)} direct callers${nameStr}`
    );
  }
}

// ======================================================================
// SECTION 5: Final summary table
// ======================================================================

printSection('SECTION 5: Final summary table');

console.log();
console.log(
  '  Idx  Entry Addr  Target Addr  First Instruction at Target          ' +
  'Entry Callers  Name Guess'
);
console.log('  ' + '-'.repeat(100));

for (const e of callerData) {
  // Get first instruction at target
  let firstInst = '(beyond ROM)';
  if (e.target < rom.length) {
    const lines = disasmLinear(e.target, 1);
    if (lines.length > 0) {
      firstInst = lines[0].text;
    }
  }

  // Name guess: known name, or derive from first instruction
  let nameGuess = e.name || '';
  if (!nameGuess) {
    // Try to guess from first instruction
    const lines = disasmLinear(e.target, 3);
    if (lines.length > 0) {
      const first = lines[0];
      if (first.inst?.tag === 'jp') {
        nameGuess = `trampoline -> ${hex(first.inst.target)}`;
      } else if (first.inst?.tag === 'ret') {
        nameGuess = 'stub (immediate RET)';
      } else if (first.inst?.tag === 'push') {
        nameGuess = 'function (saves regs)';
      } else if (first.inst?.tag === 'ld-pair-imm') {
        nameGuess = 'function (loads pair)';
      } else if (first.inst?.tag === 'ld-reg-mem') {
        nameGuess = 'function (reads mem)';
      }
    }
  }

  console.log(
    `  ${String(e.index).padStart(3)}  ${hex(e.addr)}    ${hex(e.target)}   ` +
    `${firstInst.padEnd(38)} ${String(e.callerCount).padStart(6)}       ${nameGuess}`
  );
}

// ======================================================================
// SECTION 6: Statistics
// ======================================================================

printSection('SECTION 6: Statistics');

const totalCallers = callerData.reduce((sum, e) => sum + e.callerCount, 0);
const maxCallers = sortedByCallers[0];
const stubs = callerData.filter((e) => {
  if (e.target >= rom.length) return false;
  const lines = disasmLinear(e.target, 1);
  return lines.length > 0 && lines[0].inst?.tag === 'ret';
});

console.log(`
  Table start:       ${hex(TABLE_START)}
  Table end:         ${hex(TABLE_END)} (exclusive)
  Total entries:     ${ENTRY_COUNT}
  All JP (0xC3):     ${allJP ? 'YES' : 'NO'}
  Unique targets:    ${uniqueTargets.length}
  Total CALL sites:  ${totalCallers} (across all entry addresses)
  Most-called entry: [${maxCallers.index}] ${hex(maxCallers.addr)} -> ${hex(maxCallers.target)} (${maxCallers.callerCount} callers)${maxCallers.name ? ` — ${maxCallers.name}` : ''}
  Stub entries:      ${stubs.length} (immediate RET at target)
  Zero-caller count: ${zeroCaller.length}

  Address range of targets: ${hex(Math.min(...uniqueTargets))} - ${hex(Math.max(...uniqueTargets))}
`);

console.log('Done.');
