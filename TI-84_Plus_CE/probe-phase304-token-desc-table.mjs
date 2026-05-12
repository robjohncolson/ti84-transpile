#!/usr/bin/env node

/**
 * probe-phase304-token-desc-table.mjs
 *
 * Traces the token descriptor table at 0xD0227E (RAM, populated at runtime).
 * Session 303 found that 0x022331 (token dispatch) indexes this table with
 * 18 bytes per entry. This probe:
 *
 * 1. Byte-pattern scans ROM for references to 0xD0227E and nearby range
 * 2. Disassembles context around each reference (read vs write)
 * 3. Disassembles 0x022331 (token dispatch) to see indexing arithmetic
 * 4. Finds callers of 0x022331
 * 5. Finds references to 0x0236F9 (token buffer writer)
 * 6. Outputs: all ROM references, indexing, entry structure, entry count
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rom = readFileSync(path.join(__dirname, 'ROM.rom'));

// ── Helpers ──────────────────────────────────────────────────────────────────

function hex(v, w = 6) {
  return '0x' + (v >>> 0).toString(16).toUpperCase().padStart(w, '0');
}

function hexBytes(buf, start, len) {
  const bytes = [];
  for (let i = 0; i < len && start + i < buf.length; i++) {
    bytes.push(buf[start + i].toString(16).toUpperCase().padStart(2, '0'));
  }
  return bytes.join(' ');
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
    case 'push': return `PUSH ${inst.pair.toUpperCase()}`;
    case 'pop': return `POP ${inst.pair.toUpperCase()}`;
    case 'ld-pair-imm': return `LD ${inst.pair.toUpperCase()}, ${hex(inst.value)}`;
    case 'ld-reg-imm': return `LD ${inst.dest.toUpperCase()}, ${hex(inst.value, 2)}`;
    case 'ld-reg-mem': return `LD ${inst.dest.toUpperCase()}, (${hex(inst.addr)})`;
    case 'ld-mem-reg': return `LD (${hex(inst.addr)}), ${inst.src.toUpperCase()}`;
    case 'ld-reg-reg': return `LD ${inst.dest.toUpperCase()}, ${inst.src.toUpperCase()}`;
    case 'alu-reg': return `${inst.op.toUpperCase()} ${inst.src.toUpperCase()}`;
    case 'alu-imm': return `${inst.op.toUpperCase()} ${hex(inst.value, 2)}`;
    case 'call': return `CALL ${hex(inst.target)}`;
    case 'call-conditional': return `CALL ${inst.condition.toUpperCase()}, ${hex(inst.target)}`;
    case 'jp': return `JP ${hex(inst.target)}`;
    case 'jp-conditional': return `JP ${inst.condition.toUpperCase()}, ${hex(inst.target)}`;
    case 'jr': return `JR ${hex(inst.target)}`;
    case 'jr-conditional': return `JR ${inst.condition.toUpperCase()}, ${hex(inst.target)}`;
    case 'ret': return 'RET';
    case 'ret-conditional': return `RET ${inst.condition.toUpperCase()}`;
    case 'nop': return 'NOP';
    case 'di': return 'DI';
    case 'ei': return 'EI';
    case 'halt': return 'HALT';
    case 'inc-reg': return `INC ${inst.reg.toUpperCase()}`;
    case 'dec-reg': return `DEC ${inst.reg.toUpperCase()}`;
    case 'inc-pair': return `INC ${inst.pair.toUpperCase()}`;
    case 'dec-pair': return `DEC ${inst.pair.toUpperCase()}`;
    case 'ld-indexed-pair':
      return `LD (${inst.indexRegister.toUpperCase()}${inst.displacement >= 0 ? '+' : ''}${inst.displacement}), ${inst.pair.toUpperCase()}`;
    case 'ld-ixd-reg':
      return `LD (${inst.indexRegister.toUpperCase()}${inst.displacement >= 0 ? '+' : ''}${inst.displacement}), ${inst.src.toUpperCase()}`;
    case 'ld-reg-ixd':
      return `LD ${inst.dest.toUpperCase()}, (${inst.indexRegister.toUpperCase()}${inst.displacement >= 0 ? '+' : ''}${inst.displacement})`;
    case 'indexed-cb-bit':
      return `BIT ${inst.bit}, (${inst.indexRegister.toUpperCase()}${inst.displacement >= 0 ? '+' : ''}${inst.displacement})`;
    case 'indexed-cb-set':
      return `SET ${inst.bit}, (${inst.indexRegister.toUpperCase()}${inst.displacement >= 0 ? '+' : ''}${inst.displacement})`;
    case 'indexed-cb-res':
      return `RES ${inst.bit}, (${inst.indexRegister.toUpperCase()}${inst.displacement >= 0 ? '+' : ''}${inst.displacement})`;
    case 'inc-ixd':
      return `INC (${inst.indexRegister.toUpperCase()}${inst.displacement >= 0 ? '+' : ''}${inst.displacement})`;
    case 'dec-ixd':
      return `DEC (${inst.indexRegister.toUpperCase()}${inst.displacement >= 0 ? '+' : ''}${inst.displacement})`;
    case 'ld-mem-pair': return `LD (${hex(inst.addr)}), ${inst.pair.toUpperCase()}`;
    case 'ld-pair-mem': return `LD ${inst.pair.toUpperCase()}, (${hex(inst.addr)})`;
    case 'rst': return `RST ${hex(inst.target, 2)}`;
    case 'ex-af': return "EX AF, AF'";
    case 'exx': return 'EXX';
    case 'ex-sp-hl': return 'EX (SP), HL';
    case 'ex-de-hl': return 'EX DE, HL';
    case 'djnz': return `DJNZ ${hex(inst.target)}`;
    case 'rotate-a': return `${inst.op.toUpperCase()}A`;
    case 'rotate-reg': return `${inst.op.toUpperCase()} ${inst.reg.toUpperCase()}`;
    case 'rotate-ind': return `${inst.op.toUpperCase()} (${inst.indirectRegister.toUpperCase()})`;
    case 'bit-test': return `BIT ${inst.bit}, ${inst.reg.toUpperCase()}`;
    case 'bit-test-ind': return `BIT ${inst.bit}, (${inst.indirectRegister.toUpperCase()})`;
    case 'bit-set': case 'set-reg': return `SET ${inst.bit}, ${inst.reg.toUpperCase()}`;
    case 'bit-set-ind': case 'set-ind': return `SET ${inst.bit}, (${inst.indirectRegister.toUpperCase()})`;
    case 'bit-res': case 'res-reg': return `RES ${inst.bit}, ${inst.reg.toUpperCase()}`;
    case 'bit-res-ind': case 'res-ind': return `RES ${inst.bit}, (${inst.indirectRegister.toUpperCase()})`;
    case 'out-imm': return `OUT (${hex(inst.port, 2)}), A`;
    case 'in-imm': return `IN A, (${hex(inst.port, 2)})`;
    case 'out-c-reg': return `OUT (C), ${inst.src.toUpperCase()}`;
    case 'in-reg-c': return `IN ${inst.dest.toUpperCase()}, (C)`;
    case 'block-transfer': return inst.op.toUpperCase();
    case 'block-search': return inst.op.toUpperCase();
    case 'block-io': return inst.op.toUpperCase();
    case 'scf': return 'SCF';
    case 'ccf': return 'CCF';
    case 'cpl': return 'CPL';
    case 'neg': return 'NEG';
    case 'reti': return 'RETI';
    case 'retn': return 'RETN';
    case 'im': return `IM ${inst.mode}`;
    case 'daa': return 'DAA';
    case 'ld-sp-hl': return 'LD SP, HL';
    case 'ld-sp-ix': return `LD SP, ${inst.indexRegister.toUpperCase()}`;
    case 'jp-hl': return 'JP (HL)';
    case 'jp-ix': return `JP (${inst.indexRegister.toUpperCase()})`;
    case 'ld-a-i': return 'LD A, I';
    case 'ld-i-a': return 'LD I, A';
    case 'ld-a-r': return 'LD A, R';
    case 'ld-r-a': return 'LD R, A';
    case 'add-pair': return `ADD HL, ${inst.src.toUpperCase()}`;
    case 'adc-pair': return `ADC HL, ${inst.src.toUpperCase()}`;
    case 'sbc-pair': return `SBC HL, ${inst.src.toUpperCase()}`;
    case 'ld-ind-reg': return `LD (HL), ${inst.src.toUpperCase()}`;
    case 'ld-reg-ind': return `LD ${inst.dest.toUpperCase()}, (HL)`;
    case 'alu-ind': return `${inst.op.toUpperCase()} (HL)`;
    case 'add-ix-pair': return `ADD IX, ${inst.src.toUpperCase()}`;
    case 'add-iy-pair': return `ADD IY, ${inst.src.toUpperCase()}`;
    case 'alu-ixd':
      return `${inst.op.toUpperCase()} (${inst.indexRegister.toUpperCase()}${inst.displacement >= 0 ? '+' : ''}${inst.displacement})`;
    case 'ld-ind-imm': return `LD (HL), ${hex(inst.value, 2)}`;
    case 'ld-ixd-imm':
      return `LD (${inst.indexRegister.toUpperCase()}${inst.displacement >= 0 ? '+' : ''}${inst.displacement}), ${hex(inst.value, 2)}`;
    case 'ld-pair-ix': return `LD ${inst.pair?.toUpperCase() || '??'}, ${inst.indexRegister?.toUpperCase() || 'IX'}`;
    case 'ld-ix-pair': return `LD ${inst.indexRegister?.toUpperCase() || 'IX'}, ${inst.pair?.toUpperCase() || '??'}`;
    case 'ld-ix-imm': return `LD ${inst.indexRegister.toUpperCase()}, ${hex(inst.value)}`;
    case 'ld-ix-mem': return `LD ${inst.indexRegister.toUpperCase()}, (${hex(inst.addr)})`;
    case 'ld-mem-ix': return `LD (${hex(inst.addr)}), ${inst.indexRegister.toUpperCase()}`;
    case 'push-ix': return `PUSH ${inst.indexRegister.toUpperCase()}`;
    case 'pop-ix': return `POP ${inst.indexRegister.toUpperCase()}`;
    case 'ex-sp-ix': return `EX (SP), ${inst.indexRegister.toUpperCase()}`;
    case 'inc-ix': return `INC ${inst.indexRegister.toUpperCase()}`;
    case 'dec-ix': return `DEC ${inst.indexRegister.toUpperCase()}`;
    case 'mlt': return `MLT ${(inst.pair || inst.reg || '??').toUpperCase()}`;
    case 'tst-reg': return `TST ${inst.reg.toUpperCase()}`;
    case 'tst-imm': return `TST ${hex(inst.value, 2)}`;
    case 'lea-ix': return `LEA ${inst.dest.toUpperCase()}, ${inst.indexRegister.toUpperCase()}${inst.displacement >= 0 ? '+' : ''}${inst.displacement}`;
    case 'pea-ix': return `PEA ${inst.indexRegister.toUpperCase()}${inst.displacement >= 0 ? '+' : ''}${inst.displacement}`;
    default:
      return `[${inst.tag}]`;
  }
}

function disasmRange(start, count) {
  const results = [];
  let pc = start;
  for (let i = 0; i < count; i++) {
    if (pc >= rom.length) break;
    const inst = disasmAt(pc);
    if (!inst) {
      results.push({ addr: pc, text: `DB ${hex(rom[pc], 2)}`, len: 1 });
      pc++;
      continue;
    }
    const text = formatInst(inst);
    results.push({ addr: pc, bytes: hexBytes(rom, pc, inst.length), text, len: inst.length, inst });
    pc += inst.length;
    // Stop at unconditional RET
    if (inst.tag === 'ret') break;
  }
  return results;
}

function printDisasm(results) {
  for (const r of results) {
    const bytesStr = (r.bytes || hexBytes(rom, r.addr, r.len)).padEnd(20);
    console.log(`  ${hex(r.addr)}  ${bytesStr} ${r.text}`);
  }
}

function findBytes(pattern, startAddr = 0, endAddr = 0x400000) {
  const results = [];
  for (let i = startAddr; i < endAddr - pattern.length; i++) {
    let match = true;
    for (let j = 0; j < pattern.length; j++) {
      if (rom[i + j] !== pattern[j]) { match = false; break; }
    }
    if (match) results.push(i);
  }
  return results;
}

// =============================================================
// 1. Search for references to 0xD0227E (bytes: 7E 22 D0)
// =============================================================
console.log('=== PHASE 304: Token Descriptor Table Population Trace ===\n');

console.log('--- 1. ROM references to 0xD0227E (byte pattern 7E 22 D0) ---');
const tableRefs = findBytes([0x7E, 0x22, 0xD0]);
console.log(`Found ${tableRefs.length} references:\n`);

for (const addr of tableRefs) {
  // Find instruction that contains this address by backing up
  let instStart = addr;
  for (let back = 1; back <= 6; back++) {
    const tryAddr = addr - back;
    const tryInst = disasmAt(tryAddr);
    if (tryInst && tryAddr + tryInst.length > addr + 2) {
      instStart = tryAddr;
      break;
    }
  }
  console.log(`  Ref at byte offset ${hex(addr)}:`);
  // Disassemble ~20 instructions around it
  const startAt = Math.max(0, instStart - 15);
  const results = disasmRange(startAt, 25);
  printDisasm(results);
  console.log('');
}

// =============================================================
// 1b. Wider range: 0xD02270-0xD022B4 (covers 3 table slots)
// =============================================================
console.log('\n--- 1b. Distinct table-range targets referenced in ROM ---');
const targetMap = new Map();
for (let target = 0xD02270; target <= 0xD022B4; target++) {
  const lo = target & 0xFF;
  const mid = (target >> 8) & 0xFF;
  const hi = (target >> 16) & 0xFF;
  const refs = findBytes([lo, mid, hi]);
  if (refs.length > 0) {
    targetMap.set(target, refs);
  }
}
console.log(`Found ${targetMap.size} distinct target addresses:\n`);
for (const [target, refs] of targetMap) {
  console.log(`  ${hex(target)}: ${refs.length} ref(s) at ${refs.map(r => hex(r)).join(', ')}`);
}

// Note table structure from the offsets
console.log('\n--- 1c. Table structure analysis ---');
const offsets = [...targetMap.keys()].sort((a, b) => a - b);
console.log('Known referenced offsets relative to 0xD0227E:');
for (const off of offsets) {
  const rel = off - 0xD0227E;
  const entryIdx = Math.floor(rel / 18);
  const fieldOff = rel % 18;
  if (rel >= 0) {
    console.log(`  ${hex(off)} = base + ${rel} (entry ${entryIdx}, field offset ${fieldOff})`);
  } else {
    console.log(`  ${hex(off)} = base ${rel} (before table)`);
  }
}

// =============================================================
// 2. Disassemble 0x022331 (token dispatch) — 100 instructions
// =============================================================
console.log('\n\n--- 2. Disassembly of 0x022331 (token dispatch function) ---');
console.log('Looking for: indexing arithmetic, entry size 0x12 (18), table base LD\n');
{
  const results = disasmRange(0x022331, 100);
  printDisasm(results);
}

// =============================================================
// 3. Callers of 0x022331 (byte pattern 31 23 02 for CALL target)
// =============================================================
console.log('\n\n--- 3. Callers of 0x022331 (byte pattern 31 23 02) ---');
const callerRefs = findBytes([0x31, 0x23, 0x02]);
console.log(`Found ${callerRefs.length} references:\n`);

for (const addr of callerRefs) {
  // CALL = CD xx xx xx (addr is at the 3-byte immediate, so CALL opcode is at addr-1)
  const callStart = addr - 1;
  if (callStart >= 0 && rom[callStart] === 0xCD) {
    console.log(`  CALL 0x022331 at ${hex(callStart)}:`);
    const startAt = Math.max(0, callStart - 12);
    const results = disasmRange(startAt, 15);
    printDisasm(results);
    console.log('');
  } else {
    // Could be JP or data
    console.log(`  Non-CALL ref at ${hex(addr)}, opcode before: ${hex(rom[addr - 1] || 0, 2)}`);
    const startAt = Math.max(0, addr - 8);
    const results = disasmRange(startAt, 10);
    printDisasm(results);
    console.log('');
  }
}

// =============================================================
// 4. References to 0x0236F9 (token buffer writer)
// =============================================================
console.log('\n--- 4. Callers of 0x0236F9 (token buffer writer, pattern F9 36 02) ---');
const writerRefs = findBytes([0xF9, 0x36, 0x02]);
console.log(`Found ${writerRefs.length} references:\n`);
for (const addr of writerRefs) {
  const callStart = addr - 1;
  if (callStart >= 0 && rom[callStart] === 0xCD) {
    console.log(`  CALL at ${hex(callStart)}`);
  } else {
    console.log(`  Ref at ${hex(addr)} (opcode before: ${hex(rom[addr - 1] || 0, 2)})`);
  }
}

// =============================================================
// 5. Disassemble 0x0236F9 briefly for reference
// =============================================================
console.log('\n\n--- 5. Disassembly of 0x0236F9 (token buffer writer) ---');
{
  const results = disasmRange(0x0236F9, 40);
  printDisasm(results);
}

// =============================================================
// 6. Look for the initialization code at 0x028ABC
//    (the one that zeroes 0xD0227E, 0xD02290, 0xD022A2)
// =============================================================
console.log('\n\n--- 6. Table initialization at 0x028ABC context ---');
{
  const startAt = 0x028AA0;
  const results = disasmRange(startAt, 40);
  printDisasm(results);
}

// =============================================================
// 7. 0x0B1A53 context (references 0xD0227E with LD DE, 0x000012)
// =============================================================
console.log('\n\n--- 7. 0x0B1A53 context (table walker?) ---');
{
  const startAt = 0x0B1A48;
  const results = disasmRange(startAt, 40);
  printDisasm(results);
}

// =============================================================
// 7b. 0x0B1A51 — the actual table-referencing code after the RET
// =============================================================
console.log('\n\n--- 7b. 0x0B1A51 (after RET, actual table code) ---');
{
  const results = disasmRange(0x0B1A51, 50);
  printDisasm(results);
}

// =============================================================
// 7c. 0x09DDB8 — called right before table init zeroing
// =============================================================
console.log('\n\n--- 7c. 0x09DDB8 (table population candidate) ---');
{
  const results = disasmRange(0x09DDB8, 80);
  printDisasm(results);
}

// =============================================================
// 7d. 0x07016A context — selects table entry by 0xD00839 value
// =============================================================
console.log('\n\n--- 7d. 0x070165 (table selector by mode) ---');
{
  const results = disasmRange(0x070155, 40);
  printDisasm(results);
}

// =============================================================
// 7e. 0x05A580 context — loads table entries directly by address
// =============================================================
console.log('\n\n--- 7e. 0x05A580 (direct table entry loading) ---');
{
  const results = disasmRange(0x05A580, 30);
  printDisasm(results);
}

// =============================================================
// 7f. 0x0B1F01 context — alternative indexing: ADD HL,DE * 5
// =============================================================
console.log('\n\n--- 7f. 0x0B1EF0 (alternative indexing via 5x ADD) ---');
{
  const results = disasmRange(0x0B1EF0, 30);
  printDisasm(results);
}

// =============================================================
// 8. Summary
// =============================================================
console.log('\n\n--- 8. Summary ---');
console.log('Table base address: 0xD0227E (RAM)');
console.log('Entry size: 18 bytes (0x12)');
console.log('Token dispatch: 0x022331');
console.log('Token buffer writer: 0x0236F9');
console.log(`ROM refs to 0xD0227E: ${tableRefs.length}`);
console.log(`Callers of 0x022331: ${callerRefs.length}`);
console.log(`Callers of 0x0236F9: ${writerRefs.length}`);
console.log(`Distinct targets in table range [0xD02270..0xD022B4]: ${targetMap.size}`);

// Infer table size: 0xD02290 and 0xD022A2 are also zeroed => 3 entries of 18 bytes each
// 0xD0227E + 18 = 0xD02290, 0xD02290 + 18 = 0xD022A2
console.log('\nTable layout (from initialization at 0x028ABx):');
console.log('  Entry 0: 0xD0227E (0xD0227E + 0*18)');
console.log('  Entry 1: 0xD02290 (0xD0227E + 1*18)');
console.log('  Entry 2: 0xD022A2 (0xD0227E + 2*18)');
console.log('  (Init code zeroes byte 0 of each entry)');

// Check what the indexing variable is
console.log('\nIndexing patterns seen:');
console.log('  At 0x022451: D=type, E=0x12; MLT DE; HL=0xD0227E; ADD HL,DE');
console.log('  At 0x023595: LD A,(0xD022B4) -> index; same multiply pattern');
console.log('  At 0x02362D: LD A,(0xD01D45) -> index; same multiply pattern');
console.log('  At 0x0B1F07: HL=0xD0227E; E=A; ADD HL,DE x5 (5 bytes/entry in sub-table?)');
console.log('  Index source 0xD022B4 = type/mode variable (current entry index)');
console.log('  Index source 0xD01D45 = another type variable');
console.log('  Index source 0xD00839 = mode selector (sub 2: entry 0/1/2)');

console.log('\nTable population (0x09DDB8):');
console.log('  Populates field offsets 1, 6, 11 for all 3 entries:');
console.log('    0xD0227F (entry 0, offset +1) via LD A,(0xD007E0)');
console.log('    0xD02284 (entry 0, offset +6)');
console.log('    0xD02289 (entry 0, offset +11)');
console.log('    0xD02291 (entry 1, offset +1)');
console.log('    0xD02296 (entry 1, offset +6)');
console.log('    0xD0229B (entry 1, offset +11)');
console.log('    0xD022A3 (entry 2, offset +1)');
console.log('    0xD022A8 (entry 2, offset +6)');
console.log('    0xD022AD (entry 2, offset +11)');
console.log('  Also populates offset +17 for each entry:');
console.log('    0xD0228F = 1, 0xD022A1 = 2, 0xD022B3 = 3 (entry number, 1-based)');

console.log('\nEntry structure (18 bytes per entry):');
console.log('  Offset  0: type/flags byte (zeroed on init, AND 0x0F tested)');
console.log('  Offset  1: ??? (populated by 0x09DDB8)');
console.log('  Offset  6: ??? (populated by 0x09DDB8)');
console.log('  Offset 11: ??? (populated by 0x09DDB8)');
console.log('  Offset 16: referenced as 0xD0228E/0xD022A0/0xD022B2 (heavily used)');
console.log('  Offset 17: entry number (1-based: 1, 2, 3)');

console.log('\nMode selector (0x070165):');
console.log('  LD A,(0xD00839); SUB 2');
console.log('  C flag (A<2): use entry 0 (0xD0227E)');
console.log('  Z flag (A==2): use entry 1 (0xD02290)');
console.log('  else (A>2): use entry 2 (0xD022A2)');
console.log('  => 0xD00839 values: 0-1 -> entry 0, 2 -> entry 1, 3+ -> entry 2');

console.log('\nDirect entry selectors (0x05A580):');
console.log('  Entry 1 (0xD02290): mode A=2, stores 2 to 0xD026B2');
console.log('  Entry 2 (0xD022A2): mode A=3, stores 3 to 0xD026B2');
console.log('  Entry 0 (0xD0227E): mode A=1, stores 1 to 0xD026B2');
console.log('  0xD026B2 = active entry mode (1-based)');
