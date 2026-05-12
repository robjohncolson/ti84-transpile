#!/usr/bin/env node

/**
 * probe-phase301-coormon-classify.mjs
 *
 * Investigates the CoorMon token classification block.
 * After _GetCSC reads the raw scan code, 0x08C36E stores it to 0xD0058C.
 * Token classification happens at 0x08C44D through ~0x08C530,
 * followed by CALL 0x022331 (token dispatch).
 *
 * 1. Disassembles 0x08C36E..0x08C580 (scan code store + classification + beyond)
 * 2. Identifies classification mechanism: table lookups, CP cascades, IY+offset checks
 * 3. For CALL targets in range, disassembles first 32 bytes of each callee
 * 4. For table addresses found, dumps first 64 bytes as hex
 * 5. Prints summary
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const rom = readFileSync(ROM_PATH);

const RANGE_START = 0x08C36E;
const RANGE_END   = 0x08C580;
const SCANCODE_STORE = 0x08C36E;
const CLASSIFY_START = 0x08C44D;
const CLASSIFY_END   = 0x08C530;
const TOKEN_DISPATCH = 0x022331;

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
    case 'bit-reg': return `BIT ${inst.bit}, ${inst.reg.toUpperCase()}`;
    case 'set-reg': return `SET ${inst.bit}, ${inst.reg.toUpperCase()}`;
    case 'res-reg': return `RES ${inst.bit}, ${inst.reg.toUpperCase()}`;
    case 'bit-ind': return `BIT ${inst.bit}, (${inst.indirectRegister.toUpperCase()})`;
    case 'set-ind': return `SET ${inst.bit}, (${inst.indirectRegister.toUpperCase()})`;
    case 'res-ind': return `RES ${inst.bit}, (${inst.indirectRegister.toUpperCase()})`;
    case 'out-imm': return `OUT (${hex(inst.port, 2)}), A`;
    case 'in-imm': return `IN A, (${hex(inst.port, 2)})`;
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
    case 'jp-hl': return 'JP (HL)';
    case 'ld-a-i': return 'LD A, I';
    case 'ld-i-a': return 'LD I, A';
    case 'ld-a-r': return 'LD A, R';
    case 'ld-r-a': return 'LD R, A';
    case 'add-pair': return `ADD HL, ${inst.src.toUpperCase()}`;
    case 'adc-pair': return `ADC HL, ${inst.src.toUpperCase()}`;
    case 'sbc-pair': return `SBC HL, ${inst.src.toUpperCase()}`;
    default:
      return `[${inst.tag}]`;
  }
}

/**
 * Disassemble a range, returning an array of { addr, inst, bytes, text, len }.
 */
function disasmRange(start, end) {
  const results = [];
  let pc = start;
  while (pc < end && pc < rom.length) {
    const inst = disasmAt(pc);
    if (!inst) {
      results.push({ addr: pc, bytes: hexBytes(rom, pc, 1), text: `DB ${hex(rom[pc], 2)}`, len: 1 });
      pc++;
      continue;
    }
    results.push({
      addr: pc,
      bytes: hexBytes(rom, pc, inst.length),
      text: formatInst(inst),
      len: inst.length,
      inst,
    });
    pc += inst.length;
  }
  return results;
}

// ── Section 1: Full disassembly of 0x08C36E..0x08C580 ─────────────────────

console.log('='.repeat(80));
console.log('SECTION 1: Disassembly of CoorMon classification block');
console.log(`  Range: ${hex(RANGE_START)}..${hex(RANGE_END)}`);
console.log(`  Scan code store at ${hex(SCANCODE_STORE)}`);
console.log(`  Classification block ~${hex(CLASSIFY_START)}..${hex(CLASSIFY_END)}`);
console.log(`  Token dispatch CALL target: ${hex(TOKEN_DISPATCH)}`);
console.log('='.repeat(80));

const mainDisasm = disasmRange(RANGE_START, RANGE_END);

// Collect CALL targets, table addresses, CP values, IY+offset refs
const callTargets = new Set();
const tableAddresses = new Set();
const cpValues = [];
const iyOffsets = [];
const branchTargets = new Set();

for (const line of mainDisasm) {
  if (!line.inst) continue;
  const tag = line.inst.tag;

  // CALL targets
  if (tag === 'call' || tag === 'call-conditional') {
    callTargets.add(line.inst.target);
  }

  // JP/JR targets for branch analysis
  if (tag === 'jp' || tag === 'jp-conditional') {
    branchTargets.add(line.inst.target);
  }
  if (tag === 'jr' || tag === 'jr-conditional') {
    branchTargets.add(line.inst.target);
  }

  // LD pair immediate — potential table address if value is in ROM range
  if (tag === 'ld-pair-imm') {
    const v = line.inst.value;
    if (v >= 0x000000 && v < 0x400000) {
      tableAddresses.add(v);
    }
  }

  // CP immediate — classification comparison values
  if (tag === 'alu-imm' && line.inst.op === 'cp') {
    cpValues.push({ addr: line.addr, value: line.inst.value });
  }

  // IY+offset references (modifier state checks)
  if (tag === 'ld-reg-ixd' || tag === 'ld-ixd-reg' || tag === 'indexed-cb-bit' ||
      tag === 'inc-ixd' || tag === 'dec-ixd' || tag === 'ld-indexed-pair') {
    if (line.inst.indexRegister === 'iy') {
      iyOffsets.push({ addr: line.addr, displacement: line.inst.displacement, text: line.text });
    }
  }
}

// Print annotated disassembly
for (const line of mainDisasm) {
  let annotation = '';

  // Mark key addresses
  if (line.addr === SCANCODE_STORE) annotation += ' <<< SCAN CODE STORE';
  if (line.addr === CLASSIFY_START) annotation += ' <<< CLASSIFY START';
  if (line.addr >= CLASSIFY_START && line.addr <= CLASSIFY_END && !annotation) {
    annotation += ' [classify]';
  }

  // Annotate CALL targets
  if (line.inst && (line.inst.tag === 'call' || line.inst.tag === 'call-conditional')) {
    if (line.inst.target === TOKEN_DISPATCH) {
      annotation += ' <<< TOKEN DISPATCH';
    }
  }

  // Annotate CP values
  if (line.inst && line.inst.tag === 'alu-imm' && line.inst.op === 'cp') {
    annotation += ` (compare with ${line.inst.value} / 0x${line.inst.value.toString(16).toUpperCase()})`;
  }

  // Annotate branch targets
  if (branchTargets.has(line.addr)) {
    annotation += ' <<< BRANCH TARGET';
  }

  console.log(`  ${hex(line.addr)}  ${line.bytes.padEnd(18)}  ${line.text}${annotation}`);
}

// ── Section 2: CALL targets — disassemble first 32 bytes of each callee ───

console.log(`\n${'='.repeat(80)}`);
console.log('SECTION 2: CALL targets in range — first 32 bytes of each callee');
console.log('='.repeat(80));

const sortedCalls = [...callTargets].sort((a, b) => a - b);
console.log(`\nFound ${sortedCalls.length} unique CALL targets: ${sortedCalls.map(a => hex(a)).join(', ')}`);

for (const target of sortedCalls) {
  console.log(`\n${'─'.repeat(70)}`);
  console.log(`Callee at ${hex(target)}:`);
  console.log('─'.repeat(70));

  if (target >= rom.length) {
    console.log('  (address beyond ROM — likely RAM routine)');
    continue;
  }

  const calleeDisasm = disasmRange(target, target + 32);
  for (const line of calleeDisasm) {
    console.log(`  ${hex(line.addr)}  ${line.bytes.padEnd(18)}  ${line.text}`);
  }
}

// ── Section 3: Table addresses — dump first 64 bytes ──────────────────────

console.log(`\n${'='.repeat(80)}`);
console.log('SECTION 3: Potential table addresses (ROM pointers loaded in range)');
console.log('='.repeat(80));

const sortedTables = [...tableAddresses].sort((a, b) => a - b);
console.log(`\nFound ${sortedTables.length} ROM pointer loads: ${sortedTables.map(a => hex(a)).join(', ')}`);

for (const tableAddr of sortedTables) {
  console.log(`\n${'─'.repeat(70)}`);
  console.log(`Table/data at ${hex(tableAddr)} — first 64 bytes:`);
  console.log('─'.repeat(70));

  if (tableAddr >= rom.length) {
    console.log('  (beyond ROM)');
    continue;
  }

  // Hex dump in 16-byte rows
  for (let row = 0; row < 64; row += 16) {
    const addr = tableAddr + row;
    if (addr >= rom.length) break;
    const len = Math.min(16, rom.length - addr);
    const hexPart = hexBytes(rom, addr, len);

    // ASCII representation
    let ascii = '';
    for (let i = 0; i < len; i++) {
      const b = rom[addr + i];
      ascii += (b >= 0x20 && b < 0x7F) ? String.fromCharCode(b) : '.';
    }

    console.log(`  ${hex(addr)}  ${hexPart.padEnd(48)}  ${ascii}`);
  }

  // Also try disassembling it (might be code, not data)
  console.log(`  --- as instructions ---`);
  const tableDisasm = disasmRange(tableAddr, tableAddr + 32);
  for (const line of tableDisasm) {
    console.log(`    ${hex(line.addr)}  ${line.bytes.padEnd(18)}  ${line.text}`);
  }
}

// ── Section 4: CP cascade analysis ────────────────────────────────────────

console.log(`\n${'='.repeat(80)}`);
console.log('SECTION 4: CP (compare) cascade analysis');
console.log('='.repeat(80));

console.log(`\nFound ${cpValues.length} CP instructions in range:\n`);
for (const cp of cpValues) {
  // Show context: 2 instructions before and after
  const contextLines = disasmRange(Math.max(RANGE_START, cp.addr - 8), Math.min(RANGE_END, cp.addr + 12));
  console.log(`  CP at ${hex(cp.addr)}: compare A with ${cp.value} (0x${cp.value.toString(16).toUpperCase()}):`);
  for (const line of contextLines) {
    const marker = (line.addr === cp.addr) ? ' <<<' : '';
    console.log(`    ${hex(line.addr)}  ${line.bytes.padEnd(18)}  ${line.text}${marker}`);
  }
  console.log('');
}

// ── Section 5: IY+offset modifier state checks ───────────────────────────

console.log(`${'='.repeat(80)}`);
console.log('SECTION 5: IY+offset references (modifier state: 2nd key, ALPHA flags)');
console.log('='.repeat(80));

console.log(`\nFound ${iyOffsets.length} IY+offset references:\n`);
for (const iy of iyOffsets) {
  console.log(`  ${hex(iy.addr)}  IY${iy.displacement >= 0 ? '+' : ''}${iy.displacement}  (IY+0x${(iy.displacement & 0xFF).toString(16).toUpperCase()})  ${iy.text}`);
}

// ── Section 6: Summary ────────────────────────────────────────────────────

console.log(`\n${'='.repeat(80)}`);
console.log('SECTION 6: Summary');
console.log('='.repeat(80));

console.log(`\nDisassembled ${mainDisasm.length} instructions from ${hex(RANGE_START)} to ${hex(RANGE_END)}`);
console.log(`\nCALL targets (${sortedCalls.length}):`);
for (const t of sortedCalls) {
  const isDispatch = (t === TOKEN_DISPATCH) ? ' <<< TOKEN DISPATCH' : '';
  console.log(`  ${hex(t)}${isDispatch}`);
}

console.log(`\nROM pointer loads / potential tables (${sortedTables.length}):`);
for (const t of sortedTables) {
  console.log(`  ${hex(t)}`);
}

console.log(`\nCP cascade values (${cpValues.length}):`);
for (const cp of cpValues) {
  console.log(`  ${hex(cp.addr)}: CP ${cp.value} (0x${cp.value.toString(16).toUpperCase()})`);
}

console.log(`\nIY+offset references (${iyOffsets.length}):`);
for (const iy of iyOffsets) {
  console.log(`  ${hex(iy.addr)}: ${iy.text}`);
}

console.log(`\nBranch targets within range (${[...branchTargets].filter(t => t >= RANGE_START && t <= RANGE_END).length}):`);
for (const t of [...branchTargets].sort((a, b) => a - b)) {
  if (t >= RANGE_START && t <= RANGE_END) {
    console.log(`  ${hex(t)}`);
  }
}

console.log(`\nClassification mechanism overview:`);
console.log(`  - Scan code stored to 0xD0058C at ${hex(SCANCODE_STORE)}`);
console.log(`  - ${cpValues.length} CP comparisons suggest a value-cascade classifier`);
console.log(`  - ${iyOffsets.length} IY+offset refs suggest modifier state checks (2nd/ALPHA)`);
console.log(`  - ${sortedCalls.length} subroutine calls for helper classification/dispatch`);
console.log(`  - ${sortedTables.length} ROM table pointer loads for lookup-based classification`);
console.log(`  - Token dispatch at ${hex(TOKEN_DISPATCH)}`);

console.log('\nDone.');
