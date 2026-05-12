#!/usr/bin/env node

/**
 * Phase 308 Probe: Jump Trampoline at 0x000578 ("CheckIfEmulated")
 *
 * Session 307 found that 0x022346 (token descriptor builder) starts with:
 *   PUSH AF
 *   CALL 0x000578
 *   JR Z, +0x0A       (if Z set, skip the descriptor builder body)
 *
 * This probe disassembles 0x000578 and its target 0x0158A6 to determine:
 *   - What the function does
 *   - How the Z flag gets set
 *   - Why it gates 0x022346
 *   - How many callers exist in the ROM
 *   - What table (if any) it indexes
 *
 * Findings (spoiler): 0x000578 is NOT a jump-table dispatcher. It is
 * a single JP trampoline to 0x0158A6, which is a tiny predicate named
 * "CheckIfEmulated" in the SDK. It reads ROM byte 0x00007E, compares
 * against 0xFF, and returns with flags set. In stock ROM, 0x00007E == 0xFF,
 * so CP 0xFF sets Z, meaning "yes, this is real hardware (not emulated)".
 * When Z is set, callers typically skip app/emulation-specific logic.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rom = readFileSync(path.join(__dirname, 'ROM.rom'));

// ── Constants ────────────────────────────────────────────────────────

const TRAMPOLINE_ADDR = 0x000578;
const BODY_ADDR = 0x0158A6;
const DECIDING_BYTE_ADDR = 0x00007E;
const TOKEN_DESC_BUILDER = 0x022346;

// ── Helpers ──────────────────────────────────────────────────────────

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function bytesAt(addr, length) {
  return Array.from(rom.subarray(addr, Math.min(addr + length, rom.length)))
    .map((b) => b.toString(16).toUpperCase().padStart(2, '0'))
    .join(' ');
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

function printSection(title) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(title);
  console.log('='.repeat(80));
}

function printSubSection(title) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(title);
  console.log('─'.repeat(60));
}

function printDisasm(lines) {
  for (const line of lines) {
    console.log(`  ${hex(line.addr)}  ${line.bytes.padEnd(20)}  ${line.text}`);
  }
}

// ══════════════════════════════════════════════════════════════════════
// SECTION 1: Raw bytes and disassembly of the trampoline at 0x000578
// ══════════════════════════════════════════════════════════════════════

printSection('SECTION 1: Trampoline at 0x000578');

console.log(`
  SDK name: CheckIfEmulated (from ti84pceg.inc)
  Address:  0x000578
`);

console.log('  Raw bytes (0x000578 - 0x00057B):');
console.log(`  ${bytesAt(TRAMPOLINE_ADDR, 4)}`);
console.log();

const trampolineLines = disasmLinear(TRAMPOLINE_ADDR, 1);
printDisasm(trampolineLines);

const trampolineInst = trampolineLines[0]?.inst;
const trampolineTarget = trampolineInst?.target;

console.log(`\n  This is a single JP instruction to ${hex(trampolineTarget || BODY_ADDR)}.`);
console.log('  It is NOT a dispatcher or table-indexing function.');
console.log('  It is entry [0] in a 56-entry OS jump table starting at 0x000578.');

// ══════════════════════════════════════════════════════════════════════
// SECTION 2: Disassembly of the actual function body at 0x0158A6
// ══════════════════════════════════════════════════════════════════════

printSection('SECTION 2: Function body at 0x0158A6');

console.log(`
  The JP at 0x000578 lands here. This is the actual predicate logic.
`);

const bodyLines = disasmLinear(BODY_ADDR, 20);
printDisasm(bodyLines);

console.log(`\n  Total instructions: ${bodyLines.length}`);

// ══════════════════════════════════════════════════════════════════════
// SECTION 3: Annotated walkthrough
// ══════════════════════════════════════════════════════════════════════

printSection('SECTION 3: Annotated walkthrough of 0x0158A6');

console.log(`
  0x0158A6  PUSH BC        ; save BC
  0x0158A7  LD B, A        ; save caller's A into B (preserve it)
  0x0158A8  LD A, (0x00007E) ; load the "emulation marker" byte from ROM
  0x0158AC  CP 0xFF        ; compare A against 0xFF
                           ;   if A == 0xFF -> Z flag SET (not emulated / real HW)
                           ;   if A != 0xFF -> Z flag CLEAR (emulated / app context)
  0x0158AE  LD A, B        ; restore caller's A from B (does NOT affect flags)
  0x0158AF  POP BC         ; restore BC (does NOT affect flags)
  0x0158B0  RET            ; return with Z flag reflecting the CP result

  Key insight: the function preserves ALL registers (A, BC, flags from CP).
  Only the Z flag (and other arithmetic flags from CP) change on return.
`);

// ══════════════════════════════════════════════════════════════════════
// SECTION 4: The deciding byte at 0x00007E
// ══════════════════════════════════════════════════════════════════════

printSection('SECTION 4: The deciding byte at ROM address 0x00007E');

const decidingByte = rom[0x7E];

console.log(`
  Address:  0x00007E
  Value:    ${hex(decidingByte, 2)}
  Context bytes (0x78-0x88): ${bytesAt(0x78, 16)}

  In the stock TI-84 Plus CE ROM (OS 5.8.2.0029):
    - 0x00007E = 0xFF (the entire region 0x78-0x7F is 0xFF padding)
    - CP 0xFF with A=0xFF sets Z=1

  Interpretation:
    - 0xFF means "this is genuine TI hardware, not an emulator or app"
    - Any value != 0xFF would mean "running in an emulated/app context"
    - The byte sits in the ROM interrupt vector area (below the RST vectors)
      and is presumably written differently by emulators or flash apps

  In our transpilation:
    - ROM bytes are loaded verbatim, so 0x00007E = 0xFF
    - CheckIfEmulated always returns Z=1 (not emulated)
    - This causes 0x022346 to take the early-return path (JR Z, skip)
`);

// ══════════════════════════════════════════════════════════════════════
// SECTION 5: Impact on 0x022346 (token descriptor builder)
// ══════════════════════════════════════════════════════════════════════

printSection('SECTION 5: Impact on 0x022346 (token descriptor builder)');

console.log('  First 8 instructions of 0x022346:');
const entryLines = disasmLinear(TOKEN_DESC_BUILDER, 8);
printDisasm(entryLines);

console.log(`
  Execution flow at 0x022346:
    1. PUSH AF                         ; save flags
    2. CALL 0x000578 (CheckIfEmulated) ; sets Z if byte at 0x7E == 0xFF
    3. JR Z, +0x0A                     ; if Z set (real HW), skip ahead

  Since ROM[0x7E] == 0xFF in stock ROM:
    - CheckIfEmulated returns Z=1
    - JR Z is TAKEN -> the token descriptor builder skips its body
    - This means the descriptor builder's main logic only runs when
      the OS detects it is in an emulated/app context

  This is likely a compatibility shim: on real hardware the token
  descriptor is already built by the native key handler, so the
  builder function exits early. In an emulated or app-hosted context,
  the function would need to construct the descriptor manually.
`);

// ══════════════════════════════════════════════════════════════════════
// SECTION 6: Caller count in ROM
// ══════════════════════════════════════════════════════════════════════

printSection('SECTION 6: Caller count (CALL 0x000578 in ROM)');

// Search for CD 78 05 00 pattern in ROM
const callPattern = [0xCD, 0x78, 0x05, 0x00];
const callers = [];

for (let i = 0; i < rom.length - 3; i++) {
  if (rom[i] === callPattern[0] &&
      rom[i + 1] === callPattern[1] &&
      rom[i + 2] === callPattern[2] &&
      rom[i + 3] === callPattern[3]) {
    callers.push(i);
  }
}

console.log(`\n  Total CALL 0x000578 sites: ${callers.length}`);
console.log();

// Group by address range
const ranges = {
  '0x022xxx (token/key handlers)': [],
  '0x023xxx (token/key handlers)': [],
  '0x025xxx': [],
  '0x045xxx': [],
  '0x04Axxx-0x04Bxxx': [],
  'other': [],
};

for (const addr of callers) {
  if (addr >= 0x022000 && addr < 0x023000) ranges['0x022xxx (token/key handlers)'].push(addr);
  else if (addr >= 0x023000 && addr < 0x024000) ranges['0x023xxx (token/key handlers)'].push(addr);
  else if (addr >= 0x025000 && addr < 0x026000) ranges['0x025xxx'].push(addr);
  else if (addr >= 0x045000 && addr < 0x046000) ranges['0x045xxx'].push(addr);
  else if (addr >= 0x04A000 && addr < 0x04C000) ranges['0x04Axxx-0x04Bxxx'].push(addr);
  else ranges['other'].push(addr);
}

for (const [range, addrs] of Object.entries(ranges)) {
  if (addrs.length === 0) continue;
  console.log(`  ${range}: ${addrs.length} callers`);
  for (const a of addrs) {
    console.log(`    ${hex(a)}`);
  }
}

// ══════════════════════════════════════════════════════════════════════
// SECTION 7: Jump table context (neighboring entries)
// ══════════════════════════════════════════════════════════════════════

printSection('SECTION 7: Jump table context around 0x000578');

console.log(`
  0x000578 sits at the START of a 56-entry JP-instruction jump table.
  Each entry is 4 bytes: C3 (JP) + 3-byte LE target address.
  The table spans 0x000578 - 0x000657 (224 bytes).

  First 10 entries:
`);

let tableAddr = TRAMPOLINE_ADDR;
for (let i = 0; i < 10 && rom[tableAddr] === 0xC3; i++) {
  const target = rom[tableAddr + 1] | (rom[tableAddr + 2] << 8) | (rom[tableAddr + 3] << 16);
  console.log(`  [${i.toString().padStart(2)}] ${hex(tableAddr)}: JP ${hex(target)}`);
  tableAddr += 4;
}
console.log('  ...');

console.log(`
  NOTE: Although 0x000578 is entry [0] in this table, callers do NOT
  use it as a table lookup. Every caller does a direct CALL 0x000578.
  The table structure is simply the OS's standard jump-vector layout
  where each exported function gets a fixed 4-byte JP slot so the
  actual implementation can be relocated without changing the API address.
`);

// ══════════════════════════════════════════════════════════════════════
// SECTION 8: Summary
// ══════════════════════════════════════════════════════════════════════

printSection('SECTION 8: Summary');

console.log(`
  Function:     0x000578 (CheckIfEmulated)
  Type:         Predicate (returns Z flag result, preserves all registers)
  Trampoline:   JP 0x0158A6
  Body:         PUSH BC / LD B,A / LD A,(0x7E) / CP 0xFF / LD A,B / POP BC / RET
  Deciding byte: ROM[0x00007E] = 0x${decidingByte.toString(16).toUpperCase().padStart(2, '0')}
  Z flag result: ${decidingByte === 0xFF ? 'Z=1 (stock ROM: real hardware)' : 'Z=0 (non-stock: emulated/app)'}
  Callers:      ${callers.length} call sites in ROM
  Table:        None indexed. The function reads a fixed ROM byte, not a table.

  Why it gates 0x022346:
    The token descriptor builder at 0x022346 calls CheckIfEmulated first.
    On real hardware (Z=1), the builder returns early because the native
    key handler already populated the token descriptor. In an emulated or
    app-hosted context (Z=0), the builder would run its full logic to
    construct the descriptor manually.

    In our transpilation, ROM[0x7E] = 0xFF (stock ROM), so CheckIfEmulated
    always returns Z=1, and the builder always takes the early-return path.
`);

console.log('Done.');
