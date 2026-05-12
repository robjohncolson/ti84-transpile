#!/usr/bin/env node

/**
 * probe-phase302-token-tables.mjs
 *
 * Dumps and decodes the two-byte token tables referenced by the CP cascade
 * in the two-byte token dispatcher at 0x058E02 (inside key-class lookup at
 * 0x058D54).
 *
 * The dispatcher compares the first token byte (in A) against:
 *   0xFE -> table at 0x058E57 (14 entries)
 *   0xFC -> table at 0x058E65 (2 entries)
 *   0xFB -> table at 0x058E67 (3 entries)
 *   0xFA -> same table as 0xFB (0x058E67)
 *   else -> table at 0x058E6A (9 entries)
 *
 * 1. Dumps raw bytes at each table address.
 * 2. Disassembles 0x058E02..0x058E70 to understand entry format.
 * 3. Maps token bytes to TI-84 function names where possible.
 * 4. Prints a formatted summary.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const rom = readFileSync(ROM_PATH);

// ── Table addresses from session 301 ────────────────────────────────────────

const TABLES = [
  { name: '0xFE table',        addr: 0x058E57, expectedEntries: 14, dumpLen: 40 },
  { name: '0xFC table',        addr: 0x058E65, expectedEntries: 2,  dumpLen: 10 },
  { name: '0xFB / 0xFA table', addr: 0x058E67, expectedEntries: 3,  dumpLen: 10 },
  { name: 'default table',     addr: 0x058E6A, expectedEntries: 9,  dumpLen: 30 },
];

const DISASM_START = 0x058E02;
const DISASM_END   = 0x058E80;  // a bit past 0x058E6A + 30 to catch tail

// ── Known two-byte token prefixes ───────────────────────────────────────────

const TOKEN_PREFIX_NAMES = {
  0x5C: 'Matrix',
  0x5D: 'List',
  0x5E: 'Equation',
  0x60: 'Picture',
  0x61: 'GDB',
  0x62: 'String',
  0x63: 'System Variable',
  0xAA: 'String Function',
  0xBB: 'Extended Function',
  0xEF: 'Application',
  0x7E: 'Window/Finance',
};

// Some known specific two-byte tokens (prefix, second byte) -> name
const KNOWN_TOKENS = {
  '5C00': '[A]', '5C01': '[B]', '5C02': '[C]', '5C03': '[D]',
  '5C04': '[E]', '5C05': '[F]', '5C06': '[G]', '5C07': '[H]',
  '5C08': '[I]', '5C09': '[J]',
  '5D00': 'L1', '5D01': 'L2', '5D02': 'L3', '5D03': 'L4',
  '5D04': 'L5', '5D05': 'L6',
  '5E10': 'Y1', '5E11': 'Y2', '5E12': 'Y3', '5E13': 'Y4',
  '5E14': 'Y5', '5E15': 'Y6', '5E16': 'Y7', '5E17': 'Y8',
  '5E18': 'Y9', '5E19': 'Y0',
  '5E20': 'X1T', '5E21': 'Y1T', '5E22': 'X2T', '5E23': 'Y2T',
  '5E40': 'r1', '5E41': 'r2', '5E42': 'r3', '5E43': 'r4',
  '5E44': 'r5', '5E45': 'r6',
  '5E80': 'u', '5E81': 'v', '5E82': 'w',
  '6000': 'Pic1', '6001': 'Pic2', '6002': 'Pic3', '6003': 'Pic4',
  '6004': 'Pic5', '6005': 'Pic6', '6006': 'Pic7', '6007': 'Pic8',
  '6008': 'Pic9', '6009': 'Pic0',
  '6100': 'GDB1', '6101': 'GDB2', '6102': 'GDB3', '6103': 'GDB4',
  '6104': 'GDB5', '6105': 'GDB6', '6106': 'GDB7', '6107': 'GDB8',
  '6108': 'GDB9', '6109': 'GDB0',
  '6200': 'Str1', '6201': 'Str2', '6202': 'Str3', '6203': 'Str4',
  '6204': 'Str5', '6205': 'Str6', '6206': 'Str7', '6207': 'Str8',
  '6208': 'Str9', '6209': 'Str0',
  'BB00': 'ZXscl', 'BB01': 'ZYscl', 'BB02': 'Xscl', 'BB03': 'Yscl',
  'BB31': 'pxl-Test(', 'BB32': 'augment(', 'BB33': 'rowSwap(',
  'BB6C': 'remainder(',
  'EF00': 'Finance', 'EF01': 'CBL/CBR', 'EF02': 'Apps',
};

// ── Helpers ─────────────────────────────────────────────────────────────────

function hex(v, w = 6) {
  return '0x' + (v >>> 0).toString(16).toUpperCase().padStart(w, '0');
}

function hexByte(b) {
  return b.toString(16).toUpperCase().padStart(2, '0');
}

function hexBytes(buf, start, len) {
  const bytes = [];
  for (let i = 0; i < len && start + i < buf.length; i++) {
    bytes.push(hexByte(buf[start + i]));
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

function tokenName(b1, b2) {
  const key = hexByte(b1) + hexByte(b2);
  if (KNOWN_TOKENS[key]) return KNOWN_TOKENS[key];
  const prefix = TOKEN_PREFIX_NAMES[b1];
  if (prefix) return `${prefix}[${hexByte(b2)}]`;
  return null;
}

// ── Section 1: Disassemble the two-byte token dispatcher 0x058E02..0x058E80 ─

console.log('='.repeat(80));
console.log('SECTION 1: Disassembly of two-byte token dispatcher (0x058E02..0x058E80)');
console.log('='.repeat(80));

const lines = disasmRange(DISASM_START, DISASM_END);
for (const line of lines) {
  console.log(`  ${hex(line.addr)}  ${line.bytes.padEnd(18)}  ${line.text}`);
}

// ── Section 2: Raw hex dumps of each table ──────────────────────────────────

console.log(`\n${'='.repeat(80)}`);
console.log('SECTION 2: Raw hex dumps of token tables');
console.log('='.repeat(80));

for (const tbl of TABLES) {
  const extraBytes = 16;  // dump extra past the expected end
  const totalDump = tbl.dumpLen + extraBytes;

  console.log(`\n${'─'.repeat(70)}`);
  console.log(`${tbl.name} at ${hex(tbl.addr)} (expected ${tbl.expectedEntries} entries, dumping ${totalDump} bytes)`);
  console.log('─'.repeat(70));

  for (let row = 0; row < totalDump; row += 16) {
    const addr = tbl.addr + row;
    const len = Math.min(16, totalDump - row);
    const bytesStr = hexBytes(rom, addr, len);
    let ascii = '';
    for (let b = 0; b < len; b++) {
      const ch = rom[addr + b];
      ascii += (ch >= 0x20 && ch <= 0x7E) ? String.fromCharCode(ch) : '.';
    }
    console.log(`  ${hex(addr)}  ${bytesStr.padEnd(48)}  ${ascii}`);
  }
}

// ── Section 3: Interpret table entries ──────────────────────────────────────

console.log(`\n${'='.repeat(80)}`);
console.log('SECTION 3: Table entry interpretation');
console.log('='.repeat(80));

// Try multiple entry formats and see which makes sense

for (const tbl of TABLES) {
  console.log(`\n${'─'.repeat(70)}`);
  console.log(`${tbl.name} at ${hex(tbl.addr)}`);
  console.log('─'.repeat(70));

  // Format A: 1-byte entries (just the second token byte)
  console.log('\n  Interpretation A: 1-byte entries (second token byte):');
  for (let i = 0; i < tbl.expectedEntries && tbl.addr + i < rom.length; i++) {
    const b = rom[tbl.addr + i];
    console.log(`    [${i}]  ${hexByte(b)}  (decimal ${b})`);
  }

  // Format B: 2-byte entries (token pair: prefix + suffix)
  console.log('\n  Interpretation B: 2-byte entries (token code pairs):');
  for (let i = 0; i < tbl.expectedEntries && tbl.addr + i * 2 + 1 < rom.length; i++) {
    const b1 = rom[tbl.addr + i * 2];
    const b2 = rom[tbl.addr + i * 2 + 1];
    const name = tokenName(b1, b2);
    console.log(`    [${i}]  ${hexByte(b1)} ${hexByte(b2)}  ${name ? '-> ' + name : '(unknown)'}`);
  }

  // Format C: 3-byte entries (token byte + 2-byte LE handler offset/address)
  console.log('\n  Interpretation C: 3-byte entries (byte + 16-bit value):');
  for (let i = 0; i < tbl.expectedEntries && tbl.addr + i * 3 + 2 < rom.length; i++) {
    const b1 = rom[tbl.addr + i * 3];
    const lo = rom[tbl.addr + i * 3 + 1];
    const hi = rom[tbl.addr + i * 3 + 2];
    const val16 = lo | (hi << 8);
    console.log(`    [${i}]  ${hexByte(b1)}  val=${hex(val16, 4)}`);
  }

  // Format D: 4-byte entries (token byte + 3-byte LE address)
  console.log('\n  Interpretation D: 4-byte entries (byte + 24-bit address):');
  for (let i = 0; i < Math.min(tbl.expectedEntries, 7) && tbl.addr + i * 4 + 3 < rom.length; i++) {
    const b1 = rom[tbl.addr + i * 4];
    const lo = rom[tbl.addr + i * 4 + 1];
    const mid = rom[tbl.addr + i * 4 + 2];
    const hi = rom[tbl.addr + i * 4 + 3];
    const addr24 = lo | (mid << 8) | (hi << 16);
    const inROM = addr24 < 0x400000 ? ' (in ROM)' : addr24 < 0xE00000 ? '' : ' (MMIO)';
    console.log(`    [${i}]  ${hexByte(b1)}  addr=${hex(addr24)}${inROM}`);
  }
}

// ── Section 4: Disassemble around tables to find access pattern ─────────────

console.log(`\n${'='.repeat(80)}`);
console.log('SECTION 4: Disassembly around table access (0x058DF0..0x058E57)');
console.log('  Looking for the code that READS the table to determine entry size');
console.log('='.repeat(80));

const preTableLines = disasmRange(0x058DF0, 0x058E57);
for (const line of preTableLines) {
  console.log(`  ${hex(line.addr)}  ${line.bytes.padEnd(18)}  ${line.text}`);
}

// ── Section 5: Cross-reference — what code loads these table addresses? ─────

console.log(`\n${'='.repeat(80)}`);
console.log('SECTION 5: ROM references to each table address');
console.log('='.repeat(80));

for (const tbl of TABLES) {
  const tAddr = tbl.addr;
  const lo  = tAddr & 0xFF;
  const mid = (tAddr >> 8) & 0xFF;
  const hi  = (tAddr >> 16) & 0xFF;

  const refs = [];
  for (let i = 0; i < rom.length - 2; i++) {
    if (rom[i] === lo && rom[i + 1] === mid && rom[i + 2] === hi) {
      const prefix = i > 0 ? rom[i - 1] : 0;
      let type = 'DATA';
      if (prefix === 0x21) type = 'LD HL';
      else if (prefix === 0x11) type = 'LD DE';
      else if (prefix === 0x01) type = 'LD BC';
      refs.push({ offset: i, instrAddr: type !== 'DATA' ? i - 1 : i, type });
    }
  }

  console.log(`\n  ${tbl.name} (${hex(tAddr)}): ${refs.length} reference(s)`);
  for (const ref of refs) {
    console.log(`    ${hex(ref.instrAddr)}  [${ref.type}]  raw: ${hexBytes(rom, ref.instrAddr, 6)}`);
    // Show context
    if (ref.type !== 'DATA') {
      const ctx = disasmRange(Math.max(0, ref.instrAddr - 8), Math.min(rom.length, ref.instrAddr + 12));
      for (const line of ctx) {
        const marker = line.addr === ref.instrAddr ? ' <<<' : '';
        console.log(`      ${hex(line.addr)}  ${line.bytes.padEnd(18)}  ${line.text}${marker}`);
      }
    }
  }
}

// ── Section 6: Token name mapping for 1-byte interpretation ─────────────────

console.log(`\n${'='.repeat(80)}`);
console.log('SECTION 6: Token identification (assuming 1-byte entries = second token byte)');
console.log('='.repeat(80));

const prefixMap = {
  '0xFE table':        0xFE,
  '0xFC table':        0xFC,
  '0xFB / 0xFA table': 0xFB,  // also 0xFA
  'default table':     null,  // unknown prefix for default
};

for (const tbl of TABLES) {
  const prefix = prefixMap[tbl.name];
  console.log(`\n  ${tbl.name} (prefix=${prefix !== null ? hexByte(prefix) : '??'}):`);

  for (let i = 0; i < tbl.expectedEntries && tbl.addr + i < rom.length; i++) {
    const secondByte = rom[tbl.addr + i];
    if (prefix !== null) {
      const name = tokenName(prefix, secondByte);
      console.log(`    [${i}]  ${hexByte(prefix)} ${hexByte(secondByte)}  ${name || '(no name)'}`);
    } else {
      console.log(`    [${i}]  ?? ${hexByte(secondByte)}  (prefix unknown for default table)`);
    }
  }

  // Also try as if entries are the FIRST byte (prefix) of a two-byte token
  console.log(`  As first-byte (prefix) interpretation:`);
  for (let i = 0; i < tbl.expectedEntries && tbl.addr + i < rom.length; i++) {
    const b = rom[tbl.addr + i];
    const pName = TOKEN_PREFIX_NAMES[b];
    console.log(`    [${i}]  ${hexByte(b)}  ${pName ? '-> prefix for ' + pName + ' tokens' : '(not a known prefix)'}`);
  }
}

// ── Section 7: Summary ─────────────────────────────────────────────────────

console.log(`\n${'='.repeat(80)}`);
console.log('SECTION 7: Summary');
console.log('='.repeat(80));

console.log('\nTwo-byte token dispatcher at 0x058E02');
console.log('CP cascade routes first token byte to one of 4 tables:');
for (const tbl of TABLES) {
  const bytes = [];
  for (let i = 0; i < tbl.expectedEntries && tbl.addr + i < rom.length; i++) {
    bytes.push(hexByte(rom[tbl.addr + i]));
  }
  console.log(`  ${tbl.name.padEnd(22)} ${hex(tbl.addr)}  [${bytes.join(', ')}]`);
}

console.log('\nTable byte ranges:');
console.log(`  0x058E57..0x058E64  (14 bytes)  0xFE table`);
console.log(`  0x058E65..0x058E66  ( 2 bytes)  0xFC table`);
console.log(`  0x058E67..0x058E69  ( 3 bytes)  0xFB/0xFA table`);
console.log(`  0x058E6A..0x058E72  ( 9 bytes)  default table`);
console.log(`  Total span: 0x058E57..0x058E72 = 28 bytes`);

console.log('\nNote: Examine the disassembly in Section 1 and Section 4 to determine');
console.log('whether entries are 1-byte (just the second token byte for the given prefix)');
console.log('or multi-byte (token + handler/offset). The entry count from session 301');
console.log('combined with the byte span should clarify the format.');

console.log('\nDone.');
