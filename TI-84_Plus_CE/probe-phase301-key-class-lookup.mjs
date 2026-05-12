#!/usr/bin/env node

/**
 * probe-phase301-key-class-lookup.mjs
 *
 * Investigates the key-class lookup function at 0x058D54, called by cxMain
 * (home-screen context handler at 0x0585E9). This function classifies a raw
 * keyboard scan code into a "token class" value. The class is then tested
 * in a comparison cascade at 0x0589E5 (CP 0x0B, 0x0A, 0x09, 0x0C, 0x0D).
 *
 * 1. Disassembles 0x058D54 through ~0x058E50.
 * 2. Identifies lookup tables (LD HL,addr + ADD + LD A,(HL)) or CP cascades.
 * 3. If a lookup table is found, dumps first 128 bytes and maps scan codes to classes.
 * 4. Searches ROM for all 3-byte LE references to 0x058D54 (callers).
 * 5. Prints summary of function behavior.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const rom = readFileSync(ROM_PATH);

const KEY_CLASS_FN = 0x058D54;
const DISASM_END   = 0x058E50;

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
    case 'ld-ind-reg': return `LD (HL), ${inst.src.toUpperCase()}`;
    case 'ld-reg-ind': return `LD ${inst.dest.toUpperCase()}, (HL)`;
    case 'alu-ind': return `${inst.op.toUpperCase()} (HL)`;
    case 'add-ix-pair': return `ADD IX, ${inst.src.toUpperCase()}`;
    case 'add-iy-pair': return `ADD IY, ${inst.src.toUpperCase()}`;
    default:
      return `[${inst.tag}]`;
  }
}

/**
 * Disassemble a range, returning an array of { addr, inst, bytes, text }.
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

// ── Section 1: Disassemble key-class lookup function 0x058D54..0x058E50 ─────

console.log('='.repeat(80));
console.log('SECTION 1: Disassembly of key-class lookup function at 0x058D54');
console.log('='.repeat(80));

const lines = disasmRange(KEY_CLASS_FN, DISASM_END);
const lookupTables = [];  // { tableAddr, loadInstrAddr }
const cpCascades = [];    // { addr, value }

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const marker = (line.addr === KEY_CLASS_FN) ? ' <<< ENTRY' : '';
  console.log(`  ${hex(line.addr)}  ${line.bytes.padEnd(18)}  ${line.text}${marker}`);

  // Detect lookup table patterns: LD HL, addr  (where addr is in ROM)
  if (line.inst) {
    const tag = line.inst.tag;

    // LD HL, imm24 — potential table base
    if (tag === 'ld-pair-imm' && line.inst.pair === 'hl' && line.inst.value < 0x400000) {
      lookupTables.push({ tableAddr: line.inst.value, loadInstrAddr: line.addr });
    }
    // LD DE, imm24 — also potential table base
    if (tag === 'ld-pair-imm' && line.inst.pair === 'de' && line.inst.value < 0x400000) {
      lookupTables.push({ tableAddr: line.inst.value, loadInstrAddr: line.addr });
    }
    // LD BC, imm24 — also potential table base
    if (tag === 'ld-pair-imm' && line.inst.pair === 'bc' && line.inst.value < 0x400000) {
      lookupTables.push({ tableAddr: line.inst.value, loadInstrAddr: line.addr });
    }

    // CP imm — part of a comparison cascade
    if (tag === 'alu-imm' && line.inst.op === 'cp') {
      cpCascades.push({ addr: line.addr, value: line.inst.value });
    }
  }
}

// ── Section 2: Identified lookup tables ─────────────────────────────────────

console.log(`\n${'='.repeat(80)}`);
console.log('SECTION 2: Potential lookup tables referenced in the function');
console.log('='.repeat(80));

if (lookupTables.length === 0) {
  console.log('\n  No ROM-address loads found (no lookup table pattern detected).');
} else {
  for (const tbl of lookupTables) {
    console.log(`\n${'─'.repeat(70)}`);
    console.log(`Table at ${hex(tbl.tableAddr)} (loaded at instruction ${hex(tbl.loadInstrAddr)})`);
    console.log('─'.repeat(70));

    // Dump first 128 bytes
    const dumpLen = 128;
    console.log(`\nFirst ${dumpLen} bytes (hex dump):`);
    for (let row = 0; row < dumpLen; row += 16) {
      const addr = tbl.tableAddr + row;
      const bytesStr = hexBytes(rom, addr, Math.min(16, dumpLen - row));
      // ASCII representation
      let ascii = '';
      for (let b = 0; b < 16 && row + b < dumpLen; b++) {
        const ch = rom[addr + b];
        ascii += (ch >= 0x20 && ch <= 0x7E) ? String.fromCharCode(ch) : '.';
      }
      console.log(`  ${hex(addr)}  ${bytesStr.padEnd(48)}  ${ascii}`);
    }

    // Map scan codes to class values
    console.log(`\nScan code -> class value mapping (first 128 entries):`);
    const nonZero = [];
    for (let sc = 0; sc < dumpLen && tbl.tableAddr + sc < rom.length; sc++) {
      const classVal = rom[tbl.tableAddr + sc];
      if (classVal !== 0) {
        nonZero.push({ scanCode: sc, classVal });
      }
    }
    if (nonZero.length === 0) {
      console.log('  All zero in first 128 bytes (may not be a scan-code-to-class table).');
    } else {
      console.log(`  ${nonZero.length} non-zero entries:`);
      for (const entry of nonZero) {
        console.log(`    scan code ${hex(entry.scanCode, 2)} (${entry.scanCode.toString().padStart(3)}) -> class ${hex(entry.classVal, 2)}`);
      }
    }
  }
}

// ── Section 3: CP cascade values ────────────────────────────────────────────

console.log(`\n${'='.repeat(80)}`);
console.log('SECTION 3: CP (compare) cascade values found in the function');
console.log('='.repeat(80));

if (cpCascades.length === 0) {
  console.log('\n  No CP instructions found.');
} else {
  console.log(`\n  Found ${cpCascades.length} CP instructions:`);
  for (const cp of cpCascades) {
    console.log(`    ${hex(cp.addr)}  CP ${hex(cp.value, 2)}  (decimal ${cp.value})`);
  }
}

// ── Section 4: ROM scan for all CALL/JP references to 0x058D54 ─────────────

console.log(`\n${'='.repeat(80)}`);
console.log('SECTION 4: All ROM references to 0x058D54 (callers)');
console.log('='.repeat(80));

// Search for the byte pattern 54 8D 05 (little-endian 24-bit for 0x058D54)
const target_lo  = KEY_CLASS_FN & 0xFF;          // 0x54
const target_mid = (KEY_CLASS_FN >> 8) & 0xFF;   // 0x8D
const target_hi  = (KEY_CLASS_FN >> 16) & 0xFF;  // 0x05

const callers = [];

for (let i = 0; i < rom.length - 2; i++) {
  if (rom[i] === target_lo && rom[i + 1] === target_mid && rom[i + 2] === target_hi) {
    const prefixByte = i > 0 ? rom[i - 1] : 0;
    let classification = 'UNKNOWN';
    let instAddr = i;
    let description = `raw bytes at offset ${hex(i)}`;

    if (prefixByte === 0xCD) {
      classification = 'CALL';
      description = 'CALL 0x058D54';
      instAddr = i - 1;
    } else if (prefixByte === 0xC3) {
      classification = 'JP';
      description = 'JP 0x058D54';
      instAddr = i - 1;
    } else if (prefixByte === 0x21) {
      classification = 'LD-HL';
      description = 'LD HL, 0x058D54 (pointer)';
      instAddr = i - 1;
    } else if (prefixByte === 0x11) {
      classification = 'LD-DE';
      description = 'LD DE, 0x058D54 (pointer)';
      instAddr = i - 1;
    } else if (prefixByte === 0x01) {
      classification = 'LD-BC';
      description = 'LD BC, 0x058D54 (pointer)';
      instAddr = i - 1;
    } else {
      // Check conditional calls: C4 (NZ), CC (Z), D4 (NC), DC (C)
      const condCalls = { 0xC4: 'NZ', 0xCC: 'Z', 0xD4: 'NC', 0xDC: 'C', 0xE4: 'PO', 0xEC: 'PE', 0xF4: 'P', 0xFC: 'M' };
      const condJps  = { 0xC2: 'NZ', 0xCA: 'Z', 0xD2: 'NC', 0xDA: 'C', 0xE2: 'PO', 0xEA: 'PE', 0xF2: 'P', 0xFA: 'M' };
      if (condCalls[prefixByte]) {
        classification = 'CALL-COND';
        description = `CALL ${condCalls[prefixByte]}, 0x058D54`;
        instAddr = i - 1;
      } else if (condJps[prefixByte]) {
        classification = 'JP-COND';
        description = `JP ${condJps[prefixByte]}, 0x058D54`;
        instAddr = i - 1;
      } else {
        description = `opcode ${hex(prefixByte, 2)} before target bytes`;
      }
    }

    callers.push({ matchOffset: i, instAddr, classification, description });
  }
}

console.log(`\nFound ${callers.length} references to ${hex(KEY_CLASS_FN)}:\n`);

for (const ref of callers) {
  const tag = ref.classification.padEnd(12);
  console.log(`  ${hex(ref.instAddr)}  [${tag}]  ${ref.description}`);
  console.log(`           raw bytes: ${hexBytes(rom, ref.instAddr, 8)}`);
}

// Disassemble context around each caller
for (const ref of callers) {
  if (ref.classification === 'CALL' || ref.classification === 'CALL-COND' ||
      ref.classification === 'JP' || ref.classification === 'JP-COND') {
    const contextStart = Math.max(0, ref.instAddr - 20);
    const contextEnd = Math.min(rom.length, ref.instAddr + 20);

    console.log(`\n${'─'.repeat(70)}`);
    console.log(`Context around caller at ${hex(ref.instAddr)}  [${ref.classification}]`);
    console.log('─'.repeat(70));

    const ctxLines = disasmRange(contextStart, contextEnd);
    for (const line of ctxLines) {
      const marker = (line.addr === ref.instAddr) ? ' <<<' : '';
      console.log(`  ${hex(line.addr)}  ${line.bytes.padEnd(18)}  ${line.text}${marker}`);
    }
  }
}

// ── Section 5: Summary ──────────────────────────────────────────────────────

console.log(`\n${'='.repeat(80)}`);
console.log('SECTION 5: Summary');
console.log('='.repeat(80));

console.log(`\nFunction at ${hex(KEY_CLASS_FN)}: key-class lookup (scan code -> token class)`);
console.log(`Disassembled ${lines.length} instructions from ${hex(KEY_CLASS_FN)} to ${hex(DISASM_END)}`);

if (lookupTables.length > 0) {
  console.log(`\nLookup tables found: ${lookupTables.length}`);
  for (const tbl of lookupTables) {
    console.log(`  - Table at ${hex(tbl.tableAddr)} (referenced at ${hex(tbl.loadInstrAddr)})`);
  }
}

if (cpCascades.length > 0) {
  console.log(`\nCP cascade values: ${cpCascades.map(c => hex(c.value, 2)).join(', ')}`);
}

const callRefs = callers.filter(c => c.classification === 'CALL' || c.classification === 'CALL-COND');
const jpRefs = callers.filter(c => c.classification === 'JP' || c.classification === 'JP-COND');
const ptrRefs = callers.filter(c => c.classification.startsWith('LD-'));

console.log(`\nCallers: ${callRefs.length} CALL, ${jpRefs.length} JP, ${ptrRefs.length} pointer loads`);
if (callRefs.length > 0) {
  console.log(`  CALL sites: ${callRefs.map(c => hex(c.instAddr)).join(', ')}`);
}
if (jpRefs.length > 0) {
  console.log(`  JP sites: ${jpRefs.map(c => hex(c.instAddr)).join(', ')}`);
}

console.log('\nDone.');
