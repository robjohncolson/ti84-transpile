#!/usr/bin/env node

/**
 * Phase 420 — Frame Pacing RAM Variable Reference Scanner
 *
 * Scans the full 4MB ROM for references to the five frame-pacing
 * state variables discovered in session 419 (0x010090 state machine):
 *
 *   D177DB — stage counter
 *   D177D8 — sub-step
 *   D177DE — iteration counter (wraps at 99)
 *   D177CC — circular buffer pointer (advances by 100 bytes)
 *   D177CF — second circular buffer pointer
 *
 * For each 3-byte little-endian match, decodes the surrounding
 * instructions to determine read/write direction and context.
 */

import { readFileSync } from 'fs';

process.emitWarning = () => {};
const { decodeInstruction } = await import('./ez80-decoder.js');

const rom = readFileSync(new URL('./ROM.rom', import.meta.url));
const ROM_SIZE = rom.length; // 0x400000

// ── Target addresses ──────────────────────────────────────────────

const TARGETS = [
  { name: 'D177DB (stage counter)',          addr: 0xD177DB },
  { name: 'D177D8 (sub-step)',               addr: 0xD177D8 },
  { name: 'D177DE (iteration counter)',      addr: 0xD177DE },
  { name: 'D177CC (circ buf ptr 1)',         addr: 0xD177CC },
  { name: 'D177CF (circ buf ptr 2)',         addr: 0xD177CF },
];

// ── Helpers ───────────────────────────────────────────────────────

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return (value & 0xff).toString(16).toUpperCase().padStart(2, '0');
}

function rawBytes(pc, length) {
  return Array.from(rom.slice(pc, pc + length), hexByte).join(' ');
}

function safeDecode(pc) {
  if (pc < 0 || pc >= ROM_SIZE) return null;
  try {
    return decodeInstruction(rom, pc, 'adl');
  } catch {
    return { pc, length: 1, nextPc: pc + 1, tag: 'db', value: rom[pc] ?? 0 };
  }
}

function formatInstruction(inst) {
  if (!inst) return '???';
  switch (inst.tag) {
    case 'ld-reg-mem':
      return `LD ${String(inst.dest).toUpperCase()},(${hex(inst.addr)})`;
    case 'ld-mem-reg':
      return `LD (${hex(inst.addr)}),${String(inst.src).toUpperCase()}`;
    case 'ld-pair-mem':
      return `LD ${String(inst.pair).toUpperCase()},(${hex(inst.addr)})`;
    case 'ld-mem-pair':
      return `LD (${hex(inst.addr)}),${String(inst.pair).toUpperCase()}`;
    case 'ld-pair-imm':
      return `LD ${String(inst.pair).toUpperCase()},${hex(inst.value)}`;
    case 'call':
      return `CALL ${hex(inst.target)}`;
    case 'call-conditional':
      return `CALL ${String(inst.condition).toUpperCase()},${hex(inst.target)}`;
    case 'jp':
      return `JP ${hex(inst.target)}`;
    case 'jp-conditional':
      return `JP ${String(inst.condition).toUpperCase()},${hex(inst.target)}`;
    case 'jr':
      return `JR ${hex(inst.target)}`;
    case 'jr-conditional':
      return `JR ${String(inst.condition).toUpperCase()},${hex(inst.target)}`;
    case 'ret':
      return 'RET';
    case 'push':
      return `PUSH ${String(inst.pair).toUpperCase()}`;
    case 'pop':
      return `POP ${String(inst.pair).toUpperCase()}`;
    case 'ld-reg-ixd':
      return `LD ${String(inst.dest).toUpperCase()},(${String(inst.indexRegister).toUpperCase()}+${inst.displacement})`;
    case 'ld-ixd-reg':
      return `LD (${String(inst.indexRegister).toUpperCase()}+${inst.displacement}),${String(inst.src).toUpperCase()}`;
    case 'ld-ixd-imm':
      return `LD (${String(inst.indexRegister).toUpperCase()}+${inst.displacement}),${hex(inst.value, 2)}`;
    case 'alu-reg':
      return `${String(inst.op).toUpperCase()} ${String(inst.src).toUpperCase()}`;
    case 'inc-pair':
      return `INC ${String(inst.pair).toUpperCase()}`;
    case 'dec-pair':
      return `DEC ${String(inst.pair).toUpperCase()}`;
    case 'inc-reg':
      return `INC ${String(inst.dest).toUpperCase()}`;
    case 'dec-reg':
      return `DEC ${String(inst.dest).toUpperCase()}`;
    case 'db':
      return `DB ${hex(inst.value, 2)}`;
    default:
      return `[${inst.tag}]`;
  }
}

/**
 * Classify whether the instruction containing the address reference
 * is a read or a write (or unknown).
 */
function classifyDirection(inst) {
  if (!inst) return 'unknown';
  switch (inst.tag) {
    case 'ld-reg-mem':   return 'READ';      // LD r,(addr) — reads from RAM
    case 'ld-pair-mem':  return 'READ';      // LD rr,(addr) — reads from RAM
    case 'ld-mem-reg':   return 'WRITE';     // LD (addr),r — writes to RAM
    case 'ld-mem-pair':  return 'WRITE';     // LD (addr),rr — writes to RAM
    case 'ld-pair-imm':  return 'POINTER';   // LD rr,addr — loads address as pointer
    default:             return 'unknown';
  }
}

// ── Scan ──────────────────────────────────────────────────────────

console.log('=== Phase 420: Frame Pacing RAM Variable Reference Scan ===\n');
console.log(`ROM size: ${hex(ROM_SIZE)} bytes\n`);

const allResults = [];

for (const target of TARGETS) {
  const lo = target.addr & 0xFF;
  const mid = (target.addr >> 8) & 0xFF;
  const hi = (target.addr >> 16) & 0xFF;

  const matches = [];

  for (let i = 0; i < ROM_SIZE - 2; i++) {
    if (rom[i] === lo && rom[i + 1] === mid && rom[i + 2] === hi) {
      matches.push(i);
    }
  }

  console.log(`\n${'─'.repeat(70)}`);
  console.log(`  ${target.name}  —  ${hex(target.addr)}`);
  console.log(`  LE bytes: ${hexByte(lo)} ${hexByte(mid)} ${hexByte(hi)}`);
  console.log(`  Total matches: ${matches.length}`);
  console.log(`${'─'.repeat(70)}`);

  let reads = 0, writes = 0, pointers = 0, unknowns = 0;

  for (const matchPos of matches) {
    // Try to find the instruction that contains this 3-byte address.
    // The address operand may start 1-4 bytes after the opcode start.
    // Try decoding from matchPos-1 back to matchPos-6.
    let bestInst = null;
    let bestStart = matchPos;

    for (let tryStart = matchPos; tryStart >= Math.max(0, matchPos - 6); tryStart--) {
      const inst = safeDecode(tryStart);
      if (!inst) continue;

      // Check if this instruction spans over our match position
      // and actually references the target address
      if (tryStart + inst.length > matchPos + 2) {
        // This instruction covers the match bytes
        const hasAddr = inst.addr === target.addr ||
                        inst.target === target.addr ||
                        inst.value === target.addr;
        if (hasAddr) {
          bestInst = inst;
          bestStart = tryStart;
          break;
        }
        // Even without explicit addr field, if it spans the match, keep it
        if (!bestInst || tryStart < bestStart) {
          bestInst = inst;
          bestStart = tryStart;
        }
      }
    }

    const dir = classifyDirection(bestInst);
    if (dir === 'READ') reads++;
    else if (dir === 'WRITE') writes++;
    else if (dir === 'POINTER') pointers++;
    else unknowns++;

    // Context: decode a few instructions before and after
    const contextBefore = [];
    let scanPc = Math.max(0, bestStart - 12);
    while (scanPc < bestStart) {
      const ci = safeDecode(scanPc);
      if (ci && ci.length > 0) {
        contextBefore.push({ pc: scanPc, inst: ci });
        scanPc += ci.length;
      } else {
        scanPc++;
      }
    }

    const contextAfter = [];
    let afterPc = bestInst ? bestStart + bestInst.length : matchPos + 3;
    for (let j = 0; j < 3 && afterPc < ROM_SIZE; j++) {
      const ci = safeDecode(afterPc);
      if (ci && ci.length > 0) {
        contextAfter.push({ pc: afterPc, inst: ci });
        afterPc += ci.length;
      } else {
        break;
      }
    }

    // Determine function region — scan backwards for a common prologue
    let funcStart = '?';
    for (let fp = bestStart - 1; fp >= Math.max(0, bestStart - 2000); fp--) {
      // PUSH IX = DD E5
      if (rom[fp] === 0xDD && rom[fp + 1] === 0xE5) {
        funcStart = hex(fp);
        break;
      }
      // RET = C9 (the prior function's end)
      if (rom[fp] === 0xC9) {
        funcStart = `~${hex(fp + 1)} (after RET)`;
        break;
      }
    }

    console.log(`\n  [${hex(matchPos)}]  dir=${dir}  func≈${funcStart}`);

    // Print context before (last 2 instructions)
    for (const { pc, inst } of contextBefore.slice(-2)) {
      console.log(`    ${hex(pc)}  ${rawBytes(pc, inst.length).padEnd(18)}  ${formatInstruction(inst)}`);
    }

    // Print the matched instruction
    if (bestInst) {
      const marker = '>>>';
      console.log(`  ${marker} ${hex(bestStart)}  ${rawBytes(bestStart, bestInst.length).padEnd(18)}  ${formatInstruction(bestInst)}  [${dir}]`);
    } else {
      console.log(`  >>> ${hex(matchPos)}  ${rawBytes(matchPos, 3).padEnd(18)}  (raw bytes, no instruction decoded)`);
    }

    // Print context after (next 2 instructions)
    for (const { pc, inst } of contextAfter.slice(0, 2)) {
      console.log(`    ${hex(pc)}  ${rawBytes(pc, inst.length).padEnd(18)}  ${formatInstruction(inst)}`);
    }
  }

  console.log(`\n  Summary for ${target.name}:`);
  console.log(`    READ=${reads}  WRITE=${writes}  POINTER=${pointers}  unknown=${unknowns}  total=${matches.length}`);

  allResults.push({
    name: target.name,
    addr: target.addr,
    matches,
    reads,
    writes,
    pointers,
    unknowns,
  });
}

// ── Cross-reference summary ──────────────────────────────────────

console.log(`\n\n${'═'.repeat(70)}`);
console.log('  CROSS-REFERENCE SUMMARY');
console.log(`${'═'.repeat(70)}`);

for (const r of allResults) {
  console.log(`  ${r.name.padEnd(35)} R=${r.reads} W=${r.writes} P=${r.pointers} ?=${r.unknowns} total=${r.matches.length}`);
}

// Check for co-located references (variables accessed together)
console.log(`\n  CO-LOCATION ANALYSIS (references within 50 bytes of each other):`);
for (let i = 0; i < allResults.length; i++) {
  for (let j = i + 1; j < allResults.length; j++) {
    const a = allResults[i];
    const b = allResults[j];
    let colocated = 0;
    for (const ma of a.matches) {
      for (const mb of b.matches) {
        if (Math.abs(ma - mb) <= 50) colocated++;
      }
    }
    if (colocated > 0) {
      console.log(`    ${a.name} <-> ${b.name}: ${colocated} co-located pairs`);
    }
  }
}

// Check boot region (0x000000 - 0x002000)
console.log(`\n  BOOT REGION REFERENCES (0x000000 - 0x002000):`);
let anyBoot = false;
for (const r of allResults) {
  const bootRefs = r.matches.filter(m => m < 0x002000);
  if (bootRefs.length > 0) {
    console.log(`    ${r.name}: ${bootRefs.map(hex).join(', ')}`);
    anyBoot = true;
  }
}
if (!anyBoot) console.log('    (none)');

// Check 0x010090 region (the known state machine)
console.log(`\n  REFERENCES IN 0x010090-0x01021F (frame-pacing state machine):`);
for (const r of allResults) {
  const smRefs = r.matches.filter(m => m >= 0x010090 && m <= 0x01021F);
  if (smRefs.length > 0) {
    console.log(`    ${r.name}: ${smRefs.map(hex).join(', ')}`);
  }
}

console.log('\n=== Done ===');
