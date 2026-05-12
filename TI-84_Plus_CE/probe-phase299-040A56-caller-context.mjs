#!/usr/bin/env node

/**
 * Phase 299: Disassemble the function containing 0x040A56 (the single caller
 * of keyboard controller init/reset at 0x040EE0), identify its entry point,
 * list all CALL/JP targets, and search the entire ROM for callers of this
 * containing function.
 *
 * Session 298 found that 0x040EE0-0x040F6F is the keyboard controller
 * init/reset routine (144 bytes, 22 MMIO accesses). Its only caller is the
 * CALL 0x040EE0 at 0x040A56. This probe answers: what function is 0x040A56
 * inside, what does it do, and who calls *it*?
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const rom = readFileSync(ROM_PATH);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hex(value, width = 2) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexBytes(buffer, start, length) {
  return Array.from(buffer.subarray(start, start + length), (v) =>
    v.toString(16).toUpperCase().padStart(2, '0'),
  ).join(' ');
}

function formatDisp(d) {
  const mag = Math.abs(d);
  return `${d < 0 ? '-' : '+'}${hex(mag, 2)}`;
}

function formatIndexed(reg, d) {
  return `(${reg}${formatDisp(d)})`;
}

function formatMnemonic(inst) {
  switch (inst.tag) {
    case 'push':
      return `PUSH ${inst.pair.toUpperCase()}`;
    case 'pop':
      return `POP ${inst.pair.toUpperCase()}`;
    case 'ld-pair-imm':
      return `LD ${inst.pair.toUpperCase()}, ${hex(inst.value, 6)}`;
    case 'ld-reg-imm':
      return `LD ${inst.dest.toUpperCase()}, ${hex(inst.value, 2)}`;
    case 'ld-indexed-pair':
      return `LD ${formatIndexed(inst.indexRegister.toUpperCase(), inst.displacement)}, ${inst.pair.toUpperCase()}`;
    case 'ld-ixd-reg':
      return `LD ${formatIndexed(inst.indexRegister.toUpperCase(), inst.displacement)}, ${inst.src.toUpperCase()}`;
    case 'ld-reg-ixd':
      return `LD ${inst.dest.toUpperCase()}, ${formatIndexed(inst.indexRegister.toUpperCase(), inst.displacement)}`;
    case 'indexed-cb-bit':
      return `BIT ${inst.bit}, ${formatIndexed(inst.indexRegister.toUpperCase(), inst.displacement)}`;
    case 'ld-reg-mem':
      return `LD ${inst.dest.toUpperCase()}, (${hex(inst.addr, 6)})`;
    case 'ld-mem-reg':
      return `LD (${hex(inst.addr, 6)}), ${inst.src.toUpperCase()}`;
    case 'ld-reg-reg':
      return `LD ${inst.dest.toUpperCase()}, ${inst.src.toUpperCase()}`;
    case 'alu-reg':
      return `${inst.op.toUpperCase()} ${inst.src.toUpperCase()}`;
    case 'alu-imm':
      return `${inst.op.toUpperCase()} ${hex(inst.value, 2)}`;
    case 'inc-ixd':
      return `INC ${formatIndexed(inst.indexRegister.toUpperCase(), inst.displacement)}`;
    case 'dec-ixd':
      return `DEC ${formatIndexed(inst.indexRegister.toUpperCase(), inst.displacement)}`;
    case 'jr-conditional':
      return `JR ${inst.condition.toUpperCase()}, ${hex(inst.target, 6)}`;
    case 'jr':
      return `JR ${hex(inst.target, 6)}`;
    case 'jp':
      return `JP ${hex(inst.target, 6)}`;
    case 'jp-conditional':
      return `JP ${inst.condition.toUpperCase()}, ${hex(inst.target, 6)}`;
    case 'call':
      return `CALL ${hex(inst.target, 6)}`;
    case 'call-conditional':
      return `CALL ${inst.condition.toUpperCase()}, ${hex(inst.target, 6)}`;
    case 'ret':
      return 'RET';
    case 'ret-conditional':
      return `RET ${inst.condition.toUpperCase()}`;
    case 'rst':
      return `RST ${hex(inst.target, 2)}`;
    case 'nop':
      return 'NOP';
    case 'di':
      return 'DI';
    case 'ei':
      return 'EI';
    case 'halt':
      return 'HALT';
    case 'reti':
      return 'RETI';
    case 'inc-pair':
      return `INC ${inst.pair.toUpperCase()}`;
    case 'dec-pair':
      return `DEC ${inst.pair.toUpperCase()}`;
    case 'inc-reg':
      return `INC ${inst.reg.toUpperCase()}`;
    case 'dec-reg':
      return `DEC ${inst.reg.toUpperCase()}`;
    case 'ex-de-hl':
      return 'EX DE, HL';
    case 'ex-sp-hl':
      return 'EX (SP), HL';
    case 'ex-af':
      return "EX AF, AF'";
    case 'exx':
      return 'EXX';
    case 'ccf':
      return 'CCF';
    case 'scf':
      return 'SCF';
    case 'cpl':
      return 'CPL';
    case 'daa':
      return 'DAA';
    case 'rlca':
      return 'RLCA';
    case 'rrca':
      return 'RRCA';
    case 'rla':
      return 'RLA';
    case 'rra':
      return 'RRA';
    case 'djnz':
      return `DJNZ ${hex(inst.target, 6)}`;
    case 'ld-sp-hl':
      return 'LD SP, HL';
    case 'jp-hl':
      return 'JP (HL)';
    case 'jp-ix':
      return 'JP (IX)';
    case 'jp-iy':
      return 'JP (IY)';
    case 'ld-mem-pair':
      return `LD (${hex(inst.addr, 6)}), ${inst.pair.toUpperCase()}`;
    case 'ld-pair-mem':
      return `LD ${inst.pair.toUpperCase()}, (${hex(inst.addr, 6)})`;
    case 'ld-a-i':
      return 'LD A, I';
    case 'ld-i-a':
      return 'LD I, A';
    case 'ld-a-r':
      return 'LD A, R';
    case 'ld-r-a':
      return 'LD R, A';
    case 'ldir':
      return 'LDIR';
    case 'lddr':
      return 'LDDR';
    case 'cpir':
      return 'CPIR';
    case 'cpdr':
      return 'CPDR';
    case 'in-reg-c':
      return `IN ${inst.reg.toUpperCase()}, (C)`;
    case 'out-c-reg':
      return `OUT (C), ${inst.reg.toUpperCase()}`;
    case 'in-a-n':
      return `IN A, (${hex(inst.port, 2)})`;
    case 'out-n-a':
      return `OUT (${hex(inst.port, 2)}), A`;
    case 'add-pair':
      return `ADD ${(inst.dest ?? 'HL').toUpperCase()}, ${(inst.src ?? inst.pair ?? '??').toUpperCase()}`;
    case 'adc-pair':
      return `ADC HL, ${(inst.src ?? inst.pair ?? '??').toUpperCase()}`;
    case 'sbc-pair':
      return `SBC HL, ${(inst.src ?? inst.pair ?? '??').toUpperCase()}`;
    case 'neg':
      return 'NEG';
    case 'im':
      return `IM ${inst.mode}`;
    case 'bit':
      return `BIT ${inst.bit}, ${inst.reg.toUpperCase()}`;
    case 'set':
      return `SET ${inst.bit}, ${inst.reg.toUpperCase()}`;
    case 'res':
      return `RES ${inst.bit}, ${inst.reg.toUpperCase()}`;
    case 'rotate':
      return `${inst.op.toUpperCase()} ${inst.reg.toUpperCase()}`;
    case 'ld-mem-a':
      return `LD (${hex(inst.addr, 6)}), A`;
    case 'ld-a-mem':
      return `LD A, (${hex(inst.addr, 6)})`;
    case 'ld-bc-a':
      return 'LD (BC), A';
    case 'ld-de-a':
      return 'LD (DE), A';
    case 'ld-a-bc':
      return 'LD A, (BC)';
    case 'ld-a-de':
      return 'LD A, (DE)';
    case 'ld-hl-a':
      return 'LD (HL), A';
    case 'add-ix':
      return `ADD IX, ${inst.pair.toUpperCase()}`;
    case 'add-iy':
      return `ADD IY, ${inst.pair.toUpperCase()}`;
    default: {
      // Try dasm field first, then tag, then raw byte
      if (inst.dasm) return inst.dasm;
      if (inst.tag) return inst.tag.toUpperCase();
      return `DB ${hex(rom[inst.pc] ?? 0, 2)}`;
    }
  }
}

// ---------------------------------------------------------------------------
// Step 1: Find the function entry point by scanning backwards from 0x040A56
// ---------------------------------------------------------------------------

function findFunctionEntry(targetAddr) {
  // Scan backwards looking for bytes that typically end a previous function:
  // RET (0xC9), JP nn (0xC3 xx xx xx), RETI (0xED 0x4D)
  // We look for a RET/JP that would mark the end of the PREVIOUS function,
  // then the byte after it is our function's entry.

  console.log('--- Step 1: Find function entry point ---');
  console.log(`Target instruction: CALL 0x040EE0 at ${hex(targetAddr, 6)}`);
  console.log();

  // Scan backwards from targetAddr looking for function-ending instructions
  const candidates = [];
  for (let addr = targetAddr - 1; addr >= targetAddr - 0x200; addr--) {
    const b = rom[addr];
    // RET = 0xC9
    if (b === 0xC9) {
      candidates.push({ addr, type: 'RET', entry: addr + 1 });
    }
    // RETI = ED 4D
    if (b === 0x4D && addr > 0 && rom[addr - 1] === 0xED) {
      candidates.push({ addr: addr - 1, type: 'RETI', entry: addr + 1 });
    }
    // JP nn = C3 xx xx xx (4 bytes in ADL mode)
    if (b === 0xC3) {
      candidates.push({ addr, type: 'JP nn', entry: addr + 4 });
    }
  }

  // Sort candidates by distance from target (closest first)
  candidates.sort((a, b) => (targetAddr - a.entry) - (targetAddr - b.entry));

  // Show all candidates found
  console.log('Candidate function boundaries (closest to target first):');
  for (const c of candidates.slice(0, 10)) {
    const dist = targetAddr - c.entry;
    console.log(`  ${c.type} at ${hex(c.addr, 6)} => entry at ${hex(c.entry, 6)} (${dist} bytes before target)`);
  }
  console.log();

  // Try to validate: decode from each candidate entry and see if we
  // reach the target address cleanly
  for (const c of candidates) {
    if (c.entry > targetAddr) continue;
    // Quick validation: try decoding from entry to target
    let pc = c.entry;
    let valid = true;
    let steps = 0;
    while (pc < targetAddr && steps < 500) {
      const inst = decodeInstruction(rom, pc, 'adl');
      const len = Math.max(1, inst.length ?? 1);
      pc += len;
      steps++;
    }
    if (pc === targetAddr) {
      console.log(`Validated entry point: ${hex(c.entry, 6)} (clean decode reaches ${hex(targetAddr, 6)} in ${steps} instructions)`);
      return c.entry;
    }
  }

  // Fallback: use the scan window start
  console.log('Could not validate a clean entry point; using scan window start 0x0409F0');
  return 0x0409F0;
}

// ---------------------------------------------------------------------------
// Step 2: Disassemble the function
// ---------------------------------------------------------------------------

function disassembleRange(start, end) {
  const rows = [];
  let pc = start;

  while (pc <= end) {
    const inst = decodeInstruction(rom, pc, 'adl');
    const length = Math.max(1, inst.length ?? 1);
    rows.push({
      pc,
      length,
      inst,
      bytes: hexBytes(rom, pc, length),
      mnemonic: formatMnemonic(inst),
    });
    pc += length;
  }

  return rows;
}

function findFunctionEnd(entryPoint) {
  // Decode forward from entry until we find a RET that isn't followed by
  // more code that jumps back (simple heuristic: find the first RET after
  // the CALL 0x040EE0 at 0x040A56, or a maximum scan limit)
  let pc = entryPoint;
  let lastRet = null;
  const maxEnd = entryPoint + 0x400; // limit scan to 1KB

  // First pass: find all RETs and track the farthest jump/branch target
  let farthestTarget = 0x040A56 + 4; // at least past the CALL we know about
  const rets = [];

  while (pc < maxEnd) {
    const inst = decodeInstruction(rom, pc, 'adl');
    const length = Math.max(1, inst.length ?? 1);

    // Track jump/call targets to know function extent
    if (inst.target !== undefined && inst.tag !== 'call' && inst.tag !== 'call-conditional' && inst.tag !== 'rst') {
      if (inst.target > farthestTarget && inst.target < maxEnd) {
        farthestTarget = inst.target;
      }
    }

    if (inst.tag === 'ret') {
      rets.push(pc);
      // If this RET is past all known branch targets, it's likely the end
      if (pc >= farthestTarget) {
        return pc;
      }
    }

    pc += length;
  }

  // Return the last RET found, or maxEnd
  return rets.length > 0 ? rets[rets.length - 1] : maxEnd;
}

// ---------------------------------------------------------------------------
// Step 3: Collect all CALL targets
// ---------------------------------------------------------------------------

function collectCallTargets(rows) {
  const targets = [];
  for (const row of rows) {
    const inst = row.inst;
    if (inst.tag === 'call' || inst.tag === 'call-conditional') {
      targets.push({
        from: row.pc,
        target: inst.target,
        conditional: inst.tag === 'call-conditional',
        condition: inst.condition ?? '',
      });
    }
  }
  return targets;
}

// ---------------------------------------------------------------------------
// Step 4: Search entire ROM for callers of the function entry
// ---------------------------------------------------------------------------

function searchCallers(entryPoint) {
  // In ADL mode, CALL nn = CD lo mid hi (4 bytes)
  // JP nn = C3 lo mid hi (4 bytes)
  const lo = entryPoint & 0xFF;
  const mid = (entryPoint >> 8) & 0xFF;
  const hi = (entryPoint >> 16) & 0xFF;

  const callers = [];
  const romSize = rom.length;

  for (let i = 0; i < romSize - 3; i++) {
    const opcode = rom[i];
    if ((opcode === 0xCD || opcode === 0xC3) &&
        rom[i + 1] === lo && rom[i + 2] === mid && rom[i + 3] === hi) {
      callers.push({
        addr: i,
        type: opcode === 0xCD ? 'CALL' : 'JP',
      });
    }
    // Also check conditional calls: C4(NZ), CC(Z), D4(NC), DC(C), E4(PO), EC(PE), F4(P), FC(M)
    if ((opcode === 0xC4 || opcode === 0xCC || opcode === 0xD4 || opcode === 0xDC ||
         opcode === 0xE4 || opcode === 0xEC || opcode === 0xF4 || opcode === 0xFC) &&
        rom[i + 1] === lo && rom[i + 2] === mid && rom[i + 3] === hi) {
      const condIdx = (opcode - 0xC4) >> 3;
      const CONDITIONS = ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'];
      callers.push({
        addr: i,
        type: `CALL ${CONDITIONS[condIdx]}`,
      });
    }
    // Conditional JP: C2(NZ), CA(Z), D2(NC), DA(C), E2(PO), EA(PE), F2(P), FA(M)
    if ((opcode === 0xC2 || opcode === 0xCA || opcode === 0xD2 || opcode === 0xDA ||
         opcode === 0xE2 || opcode === 0xEA || opcode === 0xF2 || opcode === 0xFA) &&
        rom[i + 1] === lo && rom[i + 2] === mid && rom[i + 3] === hi) {
      const condIdx = (opcode - 0xC2) >> 3;
      const CONDITIONS = ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'];
      callers.push({
        addr: i,
        type: `JP ${CONDITIONS[condIdx]}`,
      });
    }
  }

  return callers;
}

// ---------------------------------------------------------------------------
// Step 5: Context around each caller (a few instructions before and after)
// ---------------------------------------------------------------------------

function disassembleContext(addr, beforeBytes, afterBytes) {
  const start = Math.max(0, addr - beforeBytes);
  const end = addr + afterBytes;
  return disassembleRange(start, end);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  console.log('=== Phase 299: 0x040A56 Caller Context ===');
  console.log(`ROM: ${ROM_PATH}`);
  console.log(`Known: CALL 0x040EE0 at 0x040A56 (keyboard controller init/reset)`);
  console.log();

  // Step 1: Find function entry
  const entryPoint = findFunctionEntry(0x040A56);
  console.log();

  // Step 2: Find function end and disassemble
  const funcEnd = findFunctionEnd(entryPoint);
  console.log('--- Step 2: Full function disassembly ---');
  console.log(`Function range: ${hex(entryPoint, 6)} .. ${hex(funcEnd, 6)} (${funcEnd - entryPoint + 1} bytes)`);
  console.log();

  const rows = disassembleRange(entryPoint, funcEnd);
  for (const row of rows) {
    const marker = row.pc === 0x040A56 ? ' <<<' : '';
    const bytes = row.bytes.padEnd(17, ' ');
    const mnemonic = row.mnemonic.padEnd(30, ' ');
    console.log(`  ${hex(row.pc, 6)}: ${bytes} ${mnemonic}${marker}`);
  }
  console.log();

  // Step 3: Collect CALL targets
  const callTargets = collectCallTargets(rows);
  console.log('--- Step 3: CALL targets within this function ---');
  if (callTargets.length === 0) {
    console.log('  (none found)');
  } else {
    for (const ct of callTargets) {
      const cond = ct.conditional ? ` ${ct.condition.toUpperCase()}` : '';
      console.log(`  ${hex(ct.from, 6)}: CALL${cond} ${hex(ct.target, 6)}`);
    }
  }
  console.log();

  // Step 4: Search for callers of this function
  console.log('--- Step 4: ROM-wide search for callers ---');
  console.log(`Searching for CALL/JP to ${hex(entryPoint, 6)}...`);
  const callers = searchCallers(entryPoint);
  if (callers.length === 0) {
    console.log('  No callers found (may be called via pointer table or RST vector)');
  } else {
    console.log(`  Found ${callers.length} reference(s):`);
    for (const c of callers) {
      console.log(`    ${hex(c.addr, 6)}: ${c.type} ${hex(entryPoint, 6)}`);
    }
  }
  console.log();

  // Step 5: Show context around each caller
  if (callers.length > 0) {
    console.log('--- Step 5: Context around each caller ---');
    for (const c of callers) {
      // Skip self-references (within the function itself)
      if (c.addr >= entryPoint && c.addr <= funcEnd) {
        console.log(`  ${hex(c.addr, 6)}: (within this function, skipping context)`);
        continue;
      }
      console.log(`  Context around ${hex(c.addr, 6)} (${c.type}):`);
      const ctx = disassembleContext(c.addr, 16, 16);
      for (const row of ctx) {
        const marker = row.pc === c.addr ? ' <<<' : '';
        const bytes = row.bytes.padEnd(17, ' ');
        const mnemonic = row.mnemonic.padEnd(30, ' ');
        console.log(`    ${hex(row.pc, 6)}: ${bytes} ${mnemonic}${marker}`);
      }
      console.log();
    }
  }

  // Step 6: Analysis summary
  console.log('--- Step 6: Contextual analysis ---');
  console.log(`Function entry: ${hex(entryPoint, 6)}`);
  console.log(`Function size: ${funcEnd - entryPoint + 1} bytes`);
  console.log(`Total instructions: ${rows.length}`);
  console.log(`CALL targets: ${callTargets.length}`);
  console.log(`External callers: ${callers.filter(c => c.addr < entryPoint || c.addr > funcEnd).length}`);
  console.log();

  // Classify based on CALL targets
  const targetAddrs = new Set(callTargets.map(ct => ct.target));
  if (targetAddrs.has(0x040EE0)) {
    console.log('  Contains CALL 0x040EE0 (keyboard controller init/reset) - confirmed');
  }

  // Check for other known OS routines
  const knownRoutines = new Map([
    [0x000DB6, 'OS return / dispatcher'],
    [0x0159C0, 'primary keyboard scanner'],
    [0x040EE0, 'keyboard controller init/reset'],
    [0x08C308, 'LCD gate'],
    [0x08C4E9, 'CLEAR key handler'],
    [0x0AF408, 'token dispatcher'],
    [0x04E966, 'delegation level 6'],
    [0x03013A, 'delegation level 5'],
  ]);

  for (const ct of callTargets) {
    const name = knownRoutines.get(ct.target);
    if (name) {
      console.log(`  Calls known routine: ${hex(ct.target, 6)} (${name})`);
    }
  }

  // Count JP/JR branch targets to estimate complexity
  let branchCount = 0;
  for (const row of rows) {
    if (row.inst.tag === 'jr' || row.inst.tag === 'jr-conditional' ||
        row.inst.tag === 'jp' || row.inst.tag === 'jp-conditional') {
      branchCount++;
    }
  }
  console.log(`  Branch instructions: ${branchCount}`);

  // Check for DI/EI pairs (interrupt management)
  const hasDI = rows.some(r => r.inst.tag === 'di');
  const hasEI = rows.some(r => r.inst.tag === 'ei');
  if (hasDI || hasEI) {
    console.log(`  Interrupt management: ${hasDI ? 'DI' : ''} ${hasEI ? 'EI' : ''} (suggests critical init section)`);
  }

  // Check for PUSH/POP pairs to understand register usage
  const pushes = rows.filter(r => r.inst.tag === 'push').map(r => r.inst.pair);
  const pops = rows.filter(r => r.inst.tag === 'pop').map(r => r.inst.pair);
  if (pushes.length > 0) {
    console.log(`  Saved registers: ${pushes.join(', ')} (PUSH) / ${pops.join(', ')} (POP)`);
  }
}

main();
