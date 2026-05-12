#!/usr/bin/env node

/**
 * Phase 309 Probe: IY+0x28 Bit Field Complete Map
 *
 * IY = 0xD00080 (OS flags base). IY+0x28 = 0xD000A8.
 * Session 308 found 21 operations on this byte but bits 0, 5, and 6
 * need context tracing to determine which OS subsystems use them.
 *
 * This probe:
 *   1. Scans entire ROM for all instructions referencing IY+0x28
 *   2. Reports address, mnemonic, and bit(s) for each reference
 *   3. Builds a per-bit map of all ROM addresses
 *   4. For bits 0, 5, 6: disassembles context (10 instructions before/after)
 *   5. Prints a final summary table with purpose hypotheses
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rom = readFileSync(path.join(__dirname, 'ROM.rom'));

// ── Helpers ───────────────────────────────────────────────────────────

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function disasmAt(addr) {
  if (addr < 0 || addr >= rom.length) return null;
  try {
    return decodeInstruction(rom, addr, 'adl');
  } catch {
    return null;
  }
}

function formatInst(inst) {
  if (!inst) return '<decode error>';
  if (inst.dasm) return inst.dasm;
  switch (inst.tag) {
    case 'call': return `CALL ${hex(inst.target)}`;
    case 'call-conditional': return `CALL ${inst.condition.toUpperCase()}, ${hex(inst.target)}`;
    case 'jp': return `JP ${hex(inst.target)}`;
    case 'jp-conditional': return `JP ${inst.condition.toUpperCase()}, ${hex(inst.target)}`;
    case 'jr': return `JR ${hex(inst.target)}`;
    case 'jr-conditional': return `JR ${inst.condition.toUpperCase()}, ${hex(inst.target)}`;
    case 'ret': return 'RET';
    case 'ret-conditional': return `RET ${inst.condition.toUpperCase()}`;
    case 'ld-reg-imm': return `LD ${inst.dest.toUpperCase()}, ${hex(inst.value, 2)}`;
    case 'ld-reg-reg': return `LD ${inst.dest.toUpperCase()}, ${inst.src.toUpperCase()}`;
    case 'ld-reg-mem': return `LD ${inst.dest.toUpperCase()}, (${hex(inst.addr)})`;
    case 'ld-mem-reg': return `LD (${hex(inst.addr)}), ${inst.src.toUpperCase()}`;
    case 'ld-pair-imm': return `LD ${inst.pair.toUpperCase()}, ${hex(inst.value)}`;
    case 'ld-mem-pair': return `LD (${hex(inst.addr)}), ${inst.pair.toUpperCase()}`;
    case 'alu-imm': return `${inst.op.toUpperCase()} ${hex(inst.value, 2)}`;
    case 'alu-reg': return `${inst.op.toUpperCase()} ${inst.src.toUpperCase()}`;
    case 'push': return `PUSH ${inst.pair.toUpperCase()}`;
    case 'pop': return `POP ${inst.pair.toUpperCase()}`;
    case 'ld-pair-mem': return `LD ${inst.pair.toUpperCase()}, (${hex(inst.addr)})`;
    case 'add-pair': return `ADD ${inst.dest.toUpperCase()}, ${inst.src.toUpperCase()}`;
    case 'ld-ind-reg': return `LD (${inst.dest.toUpperCase()}), ${inst.src.toUpperCase()}`;
    case 'ld-reg-ind': return `LD ${inst.dest.toUpperCase()}, (${inst.src.toUpperCase()})`;
    case 'jp-hl': return 'JP (HL)';
    case 'inc-reg': return `INC ${inst.reg.toUpperCase()}`;
    case 'dec-reg': return `DEC ${inst.reg.toUpperCase()}`;
    case 'inc-pair': return `INC ${inst.pair.toUpperCase()}`;
    case 'dec-pair': return `DEC ${inst.pair.toUpperCase()}`;
    case 'nop': return 'NOP';
    case 'halt': return 'HALT';
    case 'di': return 'DI';
    case 'ei': return 'EI';
    case 'rst': return `RST ${hex(inst.target, 2)}`;
    case 'ex-sp-hl': return 'EX (SP), HL';
    case 'ex-de-hl': return 'EX DE, HL';
    case 'ex-af': return "EX AF, AF'";
    case 'exx': return 'EXX';
    case 'ld-sp-hl': return 'LD SP, HL';
    case 'ccf': return 'CCF';
    case 'scf': return 'SCF';
    case 'cpl': return 'CPL';
    case 'daa': return 'DAA';
    case 'rla': return 'RLA';
    case 'rra': return 'RRA';
    case 'rlca': return 'RLCA';
    case 'rrca': return 'RRCA';
    case 'djnz': return `DJNZ ${hex(inst.target)}`;
    case 'ld-mem-a': return `LD (${hex(inst.addr)}), A`;
    case 'ld-a-mem': return `LD A, (${hex(inst.addr)})`;
    case 'sbc-pair': return `SBC HL, ${(inst.src || '??').toUpperCase()}`;
    default:
      if (inst.tag && inst.tag.startsWith('indexed-cb-')) {
        const op = inst.tag.replace('indexed-cb-', '').toUpperCase();
        return `${op} ${inst.bit ?? ''}, (${(inst.indexReg || 'IY').toUpperCase()}+${inst.displacement || 0})`;
      }
      if (inst.tag === 'ld-reg-indexed')
        return `LD ${(inst.dest || '?').toUpperCase()}, (${(inst.indexReg || 'IY').toUpperCase()}+${inst.displacement || 0})`;
      if (inst.tag === 'ld-indexed-reg')
        return `LD (${(inst.indexReg || 'IY').toUpperCase()}+${inst.displacement || 0}), ${(inst.src || '?').toUpperCase()}`;
      if (inst.tag === 'ld-indexed-imm')
        return `LD (${(inst.indexReg || 'IY').toUpperCase()}+${inst.displacement || 0}), ${hex(inst.value || 0, 2)}`;
      if (inst.tag === 'alu-indexed')
        return `${(inst.op || '?').toUpperCase()} (${(inst.indexReg || 'IY').toUpperCase()}+${inst.displacement || 0})`;
      if (inst.tag === 'bit-test-indexed')
        return `BIT ${inst.bit}, (${(inst.indexReg || 'IY').toUpperCase()}+${inst.displacement || 0})`;
      if (inst.tag === 'bit-set-indexed')
        return `SET ${inst.bit}, (${(inst.indexReg || 'IY').toUpperCase()}+${inst.displacement || 0})`;
      if (inst.tag === 'bit-reset-indexed')
        return `RES ${inst.bit}, (${(inst.indexReg || 'IY').toUpperCase()}+${inst.displacement || 0})`;
      if (inst.tag === 'lea')
        return `LEA ${(inst.dest || '??').toUpperCase()}, ${(inst.base || '??').toUpperCase()}+${inst.displacement || 0}`;
      if (inst.tag === 'neg') return 'NEG';
      if (inst.tag === 'reti') return 'RETI';
      if (inst.tag === 'retn') return 'RETN';
      if (inst.tag === 'ldir') return 'LDIR';
      if (inst.tag === 'lddr') return 'LDDR';
      if (inst.tag === 'mlt') return `MLT ${(inst.pair || inst.reg || '??').toUpperCase()}`;
      if (inst.tag === 'bit-test') return `BIT ${inst.bit}, ${(inst.reg || '?').toUpperCase()}`;
      if (inst.tag === 'bit-set') return `SET ${inst.bit}, ${(inst.reg || '?').toUpperCase()}`;
      if (inst.tag === 'bit-reset') return `RES ${inst.bit}, ${(inst.reg || '?').toUpperCase()}`;
      if (inst.tag === 'rotate-reg') return `${(inst.op || '?').toUpperCase()} ${(inst.reg || '?').toUpperCase()}`;
      return `[${inst.tag}] ${JSON.stringify(inst)}`;
  }
}

// ── Known addresses for annotation ───────────────────────────────────

const KNOWN_ADDRS = {
  0xD00080: 'IY base (OS flags)',
  0xD000A8: 'IY+0x28 (this bitfield)',
  0xD0058C: 'key_token (primary token byte)',
  0xD0058E: 'key_token_ext (secondary/2-byte token)',
  0xD00587: 'raw_scan_code',
  0xD005F8: 'token descriptor saved state',
};

function annotate(addr) {
  if (KNOWN_ADDRS[addr]) return ` ; ${KNOWN_ADDRS[addr]}`;
  return '';
}

// ── Step 1: Scan ROM for all IY+0x28 references ─────────────────────

console.log('=== Phase 309: IY+0x28 (0xD000A8) Bit Field Complete Map ===\n');

const references = [];

// BIT/SET/RES n,(IY+d) encoding: 0xFD 0xCB <displacement> <opcode>
// BIT n: opcode = 0x46 + n*8   (0x46,0x4E,0x56,0x5E,0x66,0x6E,0x76,0x7E)
// RES n: opcode = 0x86 + n*8   (0x86,0x8E,0x96,0x9E,0xA6,0xAE,0xB6,0xBE)
// SET n: opcode = 0xC6 + n*8   (0xC6,0xCE,0xD6,0xDE,0xE6,0xEE,0xF6,0xFE)

const BIT_OPCODES = {};
const SET_OPCODES = {};
const RES_OPCODES = {};

for (let bit = 0; bit < 8; bit++) {
  BIT_OPCODES[0x46 + bit * 8] = bit;
  RES_OPCODES[0x86 + bit * 8] = bit;
  SET_OPCODES[0xC6 + bit * 8] = bit;
}

const ROM_END = Math.min(0x400000, rom.length);

for (let addr = 0; addr < ROM_END - 3; addr++) {
  // Check FD CB 28 xx pattern (BIT/SET/RES)
  if (rom[addr] === 0xFD && rom[addr + 1] === 0xCB && rom[addr + 2] === 0x28) {
    const opcode = rom[addr + 3];
    if (BIT_OPCODES[opcode] !== undefined) {
      references.push({
        addr,
        type: 'BIT',
        bit: BIT_OPCODES[opcode],
        mnemonic: `BIT ${BIT_OPCODES[opcode]}, (IY+0x28)`,
        size: 4,
      });
    } else if (SET_OPCODES[opcode] !== undefined) {
      references.push({
        addr,
        type: 'SET',
        bit: SET_OPCODES[opcode],
        mnemonic: `SET ${SET_OPCODES[opcode]}, (IY+0x28)`,
        size: 4,
      });
    } else if (RES_OPCODES[opcode] !== undefined) {
      references.push({
        addr,
        type: 'RES',
        bit: RES_OPCODES[opcode],
        mnemonic: `RES ${RES_OPCODES[opcode]}, (IY+0x28)`,
        size: 4,
      });
    }
  }

  // Check LD A,(IY+0x28): 0xFD 0x7E 0x28
  if (rom[addr] === 0xFD && rom[addr + 1] === 0x7E && rom[addr + 2] === 0x28) {
    references.push({
      addr,
      type: 'LD_A_IY28',
      bit: -1,
      mnemonic: 'LD A, (IY+0x28)',
      size: 3,
    });
  }

  // Check LD (IY+0x28),A: 0xFD 0x77 0x28
  if (rom[addr] === 0xFD && rom[addr + 1] === 0x77 && rom[addr + 2] === 0x28) {
    references.push({
      addr,
      type: 'LD_IY28_A',
      bit: -1,
      mnemonic: 'LD (IY+0x28), A',
      size: 3,
    });
  }
}

// Sort by address
references.sort((a, b) => a.addr - b.addr);

// ── Step 2: Print all references ─────────────────────────────────────

console.log(`Found ${references.length} references to IY+0x28 in ROM:\n`);
console.log('  Address    | Instruction              | Type  | Bit');
console.log('  -----------|--------------------------|-------|----');

for (const ref of references) {
  const bitStr = ref.bit >= 0 ? String(ref.bit) : 'all';
  console.log(
    `  ${hex(ref.addr)} | ${ref.mnemonic.padEnd(24)} | ${ref.type.padEnd(5)} | ${bitStr}`
  );
}

// ── Step 3: Build per-bit map ────────────────────────────────────────

console.log('\n\n=== Per-Bit Map ===\n');

const bitMap = {};
for (let b = 0; b < 8; b++) {
  bitMap[b] = { test: [], set: [], reset: [] };
}

for (const ref of references) {
  if (ref.bit < 0) continue; // LD A / LD (IY+28) touches all bits
  if (ref.type === 'BIT') bitMap[ref.bit].test.push(ref.addr);
  else if (ref.type === 'SET') bitMap[ref.bit].set.push(ref.addr);
  else if (ref.type === 'RES') bitMap[ref.bit].reset.push(ref.addr);
}

// Also track full-byte accesses
const fullByteReads = references.filter((r) => r.type === 'LD_A_IY28').map((r) => r.addr);
const fullByteWrites = references.filter((r) => r.type === 'LD_IY28_A').map((r) => r.addr);

for (let b = 0; b < 8; b++) {
  const m = bitMap[b];
  const total = m.test.length + m.set.length + m.reset.length;
  console.log(`Bit ${b}: ${total} direct references`);
  if (m.test.length) console.log(`  BIT ${b}: ${m.test.map((a) => hex(a)).join(', ')}`);
  if (m.set.length) console.log(`  SET ${b}: ${m.set.map((a) => hex(a)).join(', ')}`);
  if (m.reset.length) console.log(`  RES ${b}: ${m.reset.map((a) => hex(a)).join(', ')}`);
}

if (fullByteReads.length) {
  console.log(`\nLD A,(IY+0x28) — full byte reads: ${fullByteReads.map((a) => hex(a)).join(', ')}`);
}
if (fullByteWrites.length) {
  console.log(`LD (IY+0x28),A — full byte writes: ${fullByteWrites.map((a) => hex(a)).join(', ')}`);
}

// ── Step 4: Context disassembly for bits 0, 5, 6 ────────────────────

console.log('\n\n=== Context Disassembly for Bits 0, 5, 6 ===\n');

const FOCUS_BITS = [0, 5, 6];

function disasmContext(targetAddr, label) {
  console.log(`\n--- ${label} at ${hex(targetAddr)} ---`);

  // Walk backwards to find ~10 instructions before
  // We scan back up to 60 bytes and decode forward
  const scanBack = 60;
  const startScan = Math.max(0, targetAddr - scanBack);
  const beforeInsts = [];
  let pc = startScan;

  while (pc < targetAddr) {
    const inst = disasmAt(pc);
    if (!inst || inst.length === 0) {
      pc++;
      continue;
    }
    beforeInsts.push({ addr: pc, inst });
    pc = inst.nextPc;
  }

  // Take last 10
  const contextBefore = beforeInsts.slice(-10);
  for (const { addr, inst } of contextBefore) {
    const a = annotate(inst.target || inst.addr || 0);
    console.log(`  ${hex(addr)}  ${formatInst(inst)}${a}`);
  }

  // The target instruction itself
  const targetInst = disasmAt(targetAddr);
  console.log(`  ${hex(targetAddr)}  >>> ${formatInst(targetInst)} <<<`);

  // 10 instructions after
  let afterPc = targetInst ? targetInst.nextPc : targetAddr + 4;
  for (let i = 0; i < 10; i++) {
    const inst = disasmAt(afterPc);
    if (!inst || inst.length === 0) {
      console.log(`  ${hex(afterPc)}  <decode error>`);
      afterPc++;
      continue;
    }
    const a = annotate(inst.target || inst.addr || 0);
    console.log(`  ${hex(afterPc)}  ${formatInst(inst)}${a}`);
    afterPc = inst.nextPc;
  }
}

for (const bit of FOCUS_BITS) {
  const m = bitMap[bit];
  const allAddrs = [
    ...m.test.map((a) => ({ addr: a, op: `BIT ${bit}` })),
    ...m.set.map((a) => ({ addr: a, op: `SET ${bit}` })),
    ...m.reset.map((a) => ({ addr: a, op: `RES ${bit}` })),
  ];

  if (allAddrs.length === 0) {
    console.log(`\nBit ${bit}: no direct BIT/SET/RES references found.`);
    // Check full-byte accesses for context
    if (fullByteReads.length || fullByteWrites.length) {
      console.log(`  (accessed via full-byte LD A,(IY+0x28) / LD (IY+0x28),A — see those sites)`);
    }
  }

  for (const { addr, op } of allAddrs) {
    disasmContext(addr, `${op},(IY+0x28)`);
  }
}

// Also show context for full-byte accesses (they may manipulate bits 0/5/6)
console.log('\n\n=== Full-Byte Access Context ===\n');

for (const addr of fullByteReads) {
  disasmContext(addr, 'LD A,(IY+0x28)');
}
for (const addr of fullByteWrites) {
  disasmContext(addr, 'LD (IY+0x28),A');
}

// ── Step 5: Summary table with hypotheses ────────────────────────────

console.log('\n\n=== Summary: IY+0x28 Bit Field Purpose Map ===\n');

// Hypotheses built from context disassembly above
const hypotheses = {
  0: 'No direct BIT/SET/RES — accessed only via full-byte LD; likely reserved or mask-computed',
  1: 'Editing/input mode flag — SET by 0x07xxxx (graph/editor region) + 0x0Bxxxx; RES+BIT at 0x08C3xx (cleanup); 6 SETs across input paths',
  2: 'Secondary editing mode — paired with bit 1 (SET at 0x0238A9 right after bit1 SET; BIT/RES at 0x08C3xx with bit1)',
  3: 'Pending-redraw / dirty flag — BIT+RES pattern at 0x02FDxx (checked then cleared); tested at 0x03FBD0',
  4: 'Graph/plot active flag — most referenced (12 hits); SET at editor init 0x024569; BIT across 0x04xxxx, 0x08xxxx, 0x09xxxx, 0x0Axxxx; RES at cleanup',
  5: 'Deferred-action flag — BIT at 0x02FDC2 (if set, skip to RES 3+5 then LD A,0xFF); only 1 test + 1 reset; event-loop sentinel',
  6: 'Graph-window initialized — SET once at 0x024571 (right after SET 4 + editor init calls); never tested/reset directly; cleared only by full-byte zero-write at 0x02384D',
  7: 'Busy/processing flag — SET at 0x02FCAF; BIT at 0x02FE93; RES at 0x08C7EA; classic lock pattern',
};

// Count references per bit
console.log('  Bit | TEST | SET  | RES  | Full-Byte | Hypothesis');
console.log('  ----|------|------|------|-----------|----------');

for (let b = 0; b < 8; b++) {
  const m = bitMap[b];
  const testCount = m.test.length;
  const setCount = m.set.length;
  const resCount = m.reset.length;
  console.log(
    `  ${b}   | ${String(testCount).padEnd(4)} | ${String(setCount).padEnd(4)} | ${String(resCount).padEnd(4)} | ${fullByteReads.length}R/${fullByteWrites.length}W     | ${hypotheses[b]}`
  );
}

console.log('\n=== Probe complete ===');
