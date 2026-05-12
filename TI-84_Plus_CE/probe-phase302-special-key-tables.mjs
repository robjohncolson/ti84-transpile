#!/usr/bin/env node

/**
 * probe-phase302-special-key-tables.mjs
 *
 * Decodes the three 9-byte lookup tables referenced by the CoorMon token
 * classification function (0x08C36E-0x08C580):
 *   - 0x027272  (9 bytes)
 *   - 0x02727B  (9 bytes)
 *   - 0x027284  (9 bytes)
 *
 * 1. Dumps raw bytes at each table address (32 bytes each).
 * 2. Dumps the full region 0x027260-0x0272C0 for context.
 * 3. Analyzes 9-byte entry structure (3x 24-bit pointers? key+data? etc.)
 * 4. Disassembles CoorMon code around each LD HL reference to these tables.
 * 5. Cross-references with keyboard-matrix scan codes.
 * 6. Scans ROM for all references to these addresses.
 * 7. Prints formatted summary.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const rom = readFileSync(ROM_PATH);

const TABLE_ADDRS = [0x027272, 0x02727B, 0x027284];
const TABLE_SIZE = 9;
const COORMON_START = 0x08C36E;
const COORMON_END   = 0x08C580;
const FULL_REGION_START = 0x027260;
const FULL_REGION_END   = 0x0272C0;

// Keyboard scan code map for cross-referencing
const SCAN_CODE_MAP = {
  0x00: 'DOWN',   0x01: 'LEFT',  0x02: 'RIGHT', 0x03: 'UP',
  0x10: 'ENTER',  0x11: '+',     0x12: '-',     0x13: '*',
  0x14: '/',      0x15: '^',     0x16: 'CLEAR',
  0x20: '(-)',    0x21: '3',     0x22: '6',     0x23: '9',
  0x24: ')',      0x25: 'TAN',   0x26: 'VARS',
  0x30: '.',      0x31: '2',     0x32: '5',     0x33: '8',
  0x34: '(',      0x35: 'COS',   0x36: 'PRGM',  0x37: 'STAT',
  0x40: '0',      0x41: '1',     0x42: '4',     0x43: '7',
  0x44: ',',      0x45: 'SIN',   0x46: 'APPS',  0x47: 'X,T,0,n',
  0x51: 'STO>',   0x52: 'LN',    0x53: 'LOG',   0x54: 'x^2',
  0x55: 'x^-1',   0x56: 'MATH',  0x57: 'ALPHA',
  0x60: 'GRAPH',  0x61: 'TRACE', 0x62: 'ZOOM',  0x63: 'WINDOW',
  0x64: 'Y=',     0x65: '2ND',   0x66: 'MODE',  0x67: 'DEL',
};

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

function read24LE(buf, offset) {
  return buf[offset] | (buf[offset + 1] << 8) | (buf[offset + 2] << 16);
}

function read16LE(buf, offset) {
  return buf[offset] | (buf[offset + 1] << 8);
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
    case 'bit-test': case 'bit-reg': return `BIT ${inst.bit}, ${inst.reg.toUpperCase()}`;
    case 'set-reg': return `SET ${inst.bit}, ${inst.reg.toUpperCase()}`;
    case 'res-reg': return `RES ${inst.bit}, ${inst.reg.toUpperCase()}`;
    case 'bit-test-ind': case 'bit-ind': return `BIT ${inst.bit}, (${inst.indirectRegister.toUpperCase()})`;
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
    case 'alu-ixd':
      return `${inst.op.toUpperCase()} (${inst.indexRegister.toUpperCase()}${inst.displacement >= 0 ? '+' : ''}${inst.displacement})`;
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

function keyName(scanCode) {
  return SCAN_CODE_MAP[scanCode] || `unknown(${hex(scanCode, 2)})`;
}

// ── Section 1: Raw byte dumps at each table address ─────────────────────────

console.log('='.repeat(80));
console.log('SECTION 1: Raw byte dumps at each special-key table address');
console.log('='.repeat(80));

for (const addr of TABLE_ADDRS) {
  console.log(`\n--- Table at ${hex(addr)} (32 bytes) ---`);
  for (let row = 0; row < 32; row += 16) {
    const a = addr + row;
    const bytesStr = hexBytes(rom, a, Math.min(16, 32 - row));
    let ascii = '';
    for (let b = 0; b < 16 && row + b < 32; b++) {
      const ch = rom[a + b];
      ascii += (ch >= 0x20 && ch <= 0x7E) ? String.fromCharCode(ch) : '.';
    }
    console.log(`  ${hex(a)}  ${bytesStr.padEnd(48)}  ${ascii}`);
  }
}

// ── Section 2: Full region dump 0x027260..0x0272C0 ──────────────────────────

console.log(`\n${'='.repeat(80)}`);
console.log(`SECTION 2: Full region dump ${hex(FULL_REGION_START)}..${hex(FULL_REGION_END)}`);
console.log('='.repeat(80));

const regionLen = FULL_REGION_END - FULL_REGION_START;
for (let row = 0; row < regionLen; row += 16) {
  const a = FULL_REGION_START + row;
  const bytesStr = hexBytes(rom, a, Math.min(16, regionLen - row));
  let ascii = '';
  for (let b = 0; b < 16 && row + b < regionLen; b++) {
    const ch = rom[a + b];
    ascii += (ch >= 0x20 && ch <= 0x7E) ? String.fromCharCode(ch) : '.';
  }
  // Mark table boundaries
  let marker = '';
  for (const tAddr of TABLE_ADDRS) {
    if (a <= tAddr && tAddr < a + 16) {
      marker += `  <-- table at ${hex(tAddr)}`;
    }
  }
  console.log(`  ${hex(a)}  ${bytesStr.padEnd(48)}  ${ascii}${marker}`);
}

// ── Section 3: Structural analysis of each 9-byte entry ────────────────────

console.log(`\n${'='.repeat(80)}`);
console.log('SECTION 3: Structural analysis of each 9-byte table entry');
console.log('='.repeat(80));

for (const addr of TABLE_ADDRS) {
  console.log(`\n--- Table at ${hex(addr)} ---`);
  console.log(`  Raw 9 bytes: ${hexBytes(rom, addr, 9)}`);

  // Interpretation A: 3 x 24-bit pointers
  const ptr0 = read24LE(rom, addr);
  const ptr1 = read24LE(rom, addr + 3);
  const ptr2 = read24LE(rom, addr + 6);
  console.log(`\n  Interpretation A: 3 x 24-bit LE pointers`);
  console.log(`    [0..2] = ${hex(ptr0)}  ${ptr0 < 0x400000 ? '(ROM)' : ptr0 < 0xE00000 ? '(RAM)' : '(MMIO)'}`);
  console.log(`    [3..5] = ${hex(ptr1)}  ${ptr1 < 0x400000 ? '(ROM)' : ptr1 < 0xE00000 ? '(RAM)' : '(MMIO)'}`);
  console.log(`    [6..8] = ${hex(ptr2)}  ${ptr2 < 0x400000 ? '(ROM)' : ptr2 < 0xE00000 ? '(RAM)' : '(MMIO)'}`);

  // If pointers are in ROM, try to disassemble or dump what they point at
  for (let i = 0; i < 3; i++) {
    const p = [ptr0, ptr1, ptr2][i];
    if (p < 0x400000 && p > 0) {
      console.log(`    -> ptr${i} at ${hex(p)}: first 16 bytes = ${hexBytes(rom, p, 16)}`);
      // Try disassembling
      const inst = disasmAt(p);
      if (inst) {
        console.log(`       disasm: ${formatInst(inst)}`);
      }
    }
  }

  // Interpretation B: 1-byte key code + 4-byte + 4-byte
  const b0 = rom[addr];
  const v1 = rom[addr + 1] | (rom[addr + 2] << 8) | (rom[addr + 3] << 16) | (rom[addr + 4] << 24);
  const v2 = rom[addr + 5] | (rom[addr + 6] << 8) | (rom[addr + 7] << 16) | (rom[addr + 8] << 24);
  console.log(`\n  Interpretation B: 1-byte key + 2 x 32-bit values`);
  console.log(`    key byte = ${hex(b0, 2)} (${keyName(b0)})`);
  console.log(`    value1   = ${hex(v1, 8)}`);
  console.log(`    value2   = ${hex(v2, 8)}`);

  // Interpretation C: 1-byte count/type + 2-byte + 3-byte + 3-byte
  const b0c = rom[addr];
  const w1 = read16LE(rom, addr + 1);
  const p1 = read24LE(rom, addr + 3);
  const p2 = read24LE(rom, addr + 6);
  console.log(`\n  Interpretation C: 1-byte type + 16-bit value + 2 x 24-bit pointers`);
  console.log(`    type   = ${hex(b0c, 2)}`);
  console.log(`    word1  = ${hex(w1, 4)}`);
  console.log(`    ptr1   = ${hex(p1)}  ${p1 < 0x400000 ? '(ROM)' : p1 < 0xE00000 ? '(RAM)' : '(MMIO)'}`);
  console.log(`    ptr2   = ${hex(p2)}  ${p2 < 0x400000 ? '(ROM)' : p2 < 0xE00000 ? '(RAM)' : '(MMIO)'}`);

  // Interpretation D: 9 individual bytes (scan codes or class values)
  console.log(`\n  Interpretation D: 9 individual bytes`);
  const individualBytes = [];
  for (let i = 0; i < 9; i++) {
    const b = rom[addr + i];
    const name = SCAN_CODE_MAP[b] ? ` (key: ${SCAN_CODE_MAP[b]})` : '';
    individualBytes.push(`    [${i}] = ${hex(b, 2)}${name}`);
  }
  console.log(individualBytes.join('\n'));

  // Interpretation E: 3 x (1-byte key + 2-byte value)
  console.log(`\n  Interpretation E: 3 x (1-byte key + 2-byte LE value)`);
  for (let i = 0; i < 3; i++) {
    const k = rom[addr + i * 3];
    const v = read16LE(rom, addr + i * 3 + 1);
    console.log(`    entry${i}: key=${hex(k, 2)} (${keyName(k)})  value=${hex(v, 4)}`);
  }
}

// ── Section 4: Disassemble CoorMon code referencing these tables ────────────

console.log(`\n${'='.repeat(80)}`);
console.log('SECTION 4: CoorMon code referencing the special-key tables');
console.log('='.repeat(80));

// First, find all LD instructions in CoorMon that reference these table addresses
const coormonLines = disasmRange(COORMON_START, COORMON_END);

for (const tableAddr of TABLE_ADDRS) {
  // Search for instructions that load this address
  const matchingIndices = [];
  for (let i = 0; i < coormonLines.length; i++) {
    const line = coormonLines[i];
    if (!line.inst) continue;
    const tag = line.inst.tag;
    if (tag === 'ld-pair-imm' && line.inst.value === tableAddr) {
      matchingIndices.push(i);
    }
  }

  if (matchingIndices.length === 0) {
    console.log(`\n  No direct LD reference to ${hex(tableAddr)} found in CoorMon range.`);
    // Also try searching raw bytes
    const lo = tableAddr & 0xFF;
    const mid = (tableAddr >> 8) & 0xFF;
    const hi = (tableAddr >> 16) & 0xFF;
    for (let off = COORMON_START; off < COORMON_END - 2; off++) {
      if (rom[off] === lo && rom[off + 1] === mid && rom[off + 2] === hi) {
        console.log(`  But found raw byte pattern at ${hex(off)} (opcode before: ${hex(rom[off - 1], 2)})`);
      }
    }
    continue;
  }

  for (const idx of matchingIndices) {
    const line = coormonLines[idx];
    console.log(`\n${'─'.repeat(70)}`);
    console.log(`LD ${line.inst.pair.toUpperCase()}, ${hex(tableAddr)} at ${hex(line.addr)}`);
    console.log(`Context: ~20 instructions before and after:`);
    console.log('─'.repeat(70));

    const contextStart = Math.max(0, idx - 20);
    const contextEnd = Math.min(coormonLines.length, idx + 20);
    for (let ci = contextStart; ci < contextEnd; ci++) {
      const cl = coormonLines[ci];
      const marker = (ci === idx) ? ' <<<' : '';
      console.log(`  ${hex(cl.addr)}  ${cl.bytes.padEnd(18)}  ${cl.text}${marker}`);
    }
  }
}

// ── Section 5: Scan ROM for all references to these table addresses ─────────

console.log(`\n${'='.repeat(80)}`);
console.log('SECTION 5: ROM-wide scan for references to table addresses');
console.log('='.repeat(80));

for (const tableAddr of TABLE_ADDRS) {
  const lo = tableAddr & 0xFF;
  const mid = (tableAddr >> 8) & 0xFF;
  const hi = (tableAddr >> 16) & 0xFF;

  const refs = [];
  for (let i = 0; i < rom.length - 2; i++) {
    if (rom[i] === lo && rom[i + 1] === mid && rom[i + 2] === hi) {
      const prefixByte = i > 0 ? rom[i - 1] : 0;
      let classification = 'UNKNOWN';
      let instAddr = i;

      if (prefixByte === 0xCD) { classification = 'CALL'; instAddr = i - 1; }
      else if (prefixByte === 0xC3) { classification = 'JP'; instAddr = i - 1; }
      else if (prefixByte === 0x21) { classification = 'LD HL'; instAddr = i - 1; }
      else if (prefixByte === 0x11) { classification = 'LD DE'; instAddr = i - 1; }
      else if (prefixByte === 0x01) { classification = 'LD BC'; instAddr = i - 1; }
      else {
        const condCalls = { 0xC4:'NZ', 0xCC:'Z', 0xD4:'NC', 0xDC:'C' };
        const condJps  = { 0xC2:'NZ', 0xCA:'Z', 0xD2:'NC', 0xDA:'C' };
        if (condCalls[prefixByte]) { classification = `CALL ${condCalls[prefixByte]}`; instAddr = i - 1; }
        else if (condJps[prefixByte]) { classification = `JP ${condJps[prefixByte]}`; instAddr = i - 1; }
        else { classification = `opcode ${hex(prefixByte, 2)}`; }
      }

      refs.push({ matchOffset: i, instAddr, classification });
    }
  }

  console.log(`\n  ${hex(tableAddr)} (pattern ${hex(lo, 2)} ${hex(mid, 2)} ${hex(hi, 2)}): ${refs.length} reference(s)`);
  for (const ref of refs) {
    const inCoorMon = (ref.instAddr >= COORMON_START && ref.instAddr < COORMON_END) ? ' [CoorMon]' : '';
    console.log(`    ${hex(ref.instAddr)}  [${ref.classification.padEnd(10)}]  raw: ${hexBytes(rom, ref.instAddr, 6)}${inCoorMon}`);
  }
}

// ── Section 6: Try to disassemble table entries as code ─────────────────────

console.log(`\n${'='.repeat(80)}`);
console.log('SECTION 6: Disassembly attempt at each table address');
console.log('='.repeat(80));

for (const addr of TABLE_ADDRS) {
  console.log(`\n--- Disassembly at ${hex(addr)} (16 bytes) ---`);
  const lines = disasmRange(addr, addr + 16);
  for (const line of lines) {
    console.log(`  ${hex(line.addr)}  ${line.bytes.padEnd(18)}  ${line.text}`);
  }
}

// ── Section 7: Wider table context — look for table-of-tables pattern ───────

console.log(`\n${'='.repeat(80)}`);
console.log('SECTION 7: Look for table-of-tables or entry-count patterns');
console.log('='.repeat(80));

// Check what's before the first table (0x027272)
console.log(`\nBytes just before first table (${hex(TABLE_ADDRS[0])}):`);
const preBytes = 16;
console.log(`  ${hex(TABLE_ADDRS[0] - preBytes)}  ${hexBytes(rom, TABLE_ADDRS[0] - preBytes, preBytes)}`);

// Check for count/length bytes
console.log(`\nPossible structure markers before 0x027272:`);
for (let offset = 1; offset <= 8; offset++) {
  const b = rom[TABLE_ADDRS[0] - offset];
  console.log(`  [addr-${offset}] = ${hex(b, 2)} (decimal ${b})`);
}

// Check inter-table gaps
console.log(`\nInter-table spacing:`);
console.log(`  0x027272 to 0x02727B = ${0x02727B - 0x027272} bytes (${0x02727B - 0x027272 === 9 ? 'exactly 9 -- contiguous!' : 'NOT 9'})`);
console.log(`  0x02727B to 0x027284 = ${0x027284 - 0x02727B} bytes (${0x027284 - 0x02727B === 9 ? 'exactly 9 -- contiguous!' : 'NOT 9'})`);

// If contiguous, this is really one table with 3 entries of 9 bytes each = 27 bytes
if ((0x02727B - 0x027272 === 9) && (0x027284 - 0x02727B === 9)) {
  console.log(`\n  ** Tables are CONTIGUOUS: one 27-byte table at 0x027272 with 3 x 9-byte entries **`);
  console.log(`  Full 27 bytes: ${hexBytes(rom, 0x027272, 27)}`);

  // What comes right after?
  const afterAddr = 0x027284 + 9; // 0x02728D
  console.log(`\n  Bytes after the 3 entries (at ${hex(afterAddr)}):`);
  console.log(`  ${hexBytes(rom, afterAddr, 16)}`);

  // Check if there are more 9-byte entries following
  console.log(`\n  Next potential 9-byte entry at ${hex(afterAddr)}:`);
  console.log(`  ${hexBytes(rom, afterAddr, 9)}`);
}

// ── Section 8: Formatted summary ────────────────────────────────────────────

console.log(`\n${'='.repeat(80)}`);
console.log('SECTION 8: Summary');
console.log('='.repeat(80));

console.log(`
Three special-key lookup tables referenced by CoorMon (0x08C36E-0x08C580):

  Table 0: ${hex(TABLE_ADDRS[0])}  bytes: ${hexBytes(rom, TABLE_ADDRS[0], 9)}
  Table 1: ${hex(TABLE_ADDRS[1])}  bytes: ${hexBytes(rom, TABLE_ADDRS[1], 9)}
  Table 2: ${hex(TABLE_ADDRS[2])}  bytes: ${hexBytes(rom, TABLE_ADDRS[2], 9)}

Inter-table spacing: ${0x02727B - 0x027272} bytes, ${0x027284 - 0x02727B} bytes
${(0x02727B - 0x027272 === 9 && 0x027284 - 0x02727B === 9) ?
  'Tables are contiguous -- single 27-byte table with 3 entries of 9 bytes.' :
  'Tables are NOT contiguous.'}

Best-fit structural interpretations will be determined by CoorMon access patterns
(Section 4 disassembly).
`);

console.log('Done.');
