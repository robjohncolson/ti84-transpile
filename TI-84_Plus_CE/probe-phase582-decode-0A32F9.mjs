#!/usr/bin/env node
// Phase 582 — Decode 0x0A32F9: Real keyboard matrix scan engine (237B)
// Called by 0x03D1C3 (counter-gated key scan dispatcher).
// Scans ONE keyboard group per call, round-robin cycling at D005F6.
// Parameter table at 0x0A344A: 8 bytes/group, 9 groups.
// Results written from D02ACC into per-group RAM buffers in extended RAM.

import { readFileSync } from 'fs';
import { decodeInstruction } from './ez80-decoder.js';

const rom = readFileSync('TI-84_Plus_CE/ROM.rom');

const START = 0x0A32F9;
const DISASM_BYTES = 300;
const TABLE_ADDR = 0x0A344A;
const TABLE_GROUPS = 9;
const TABLE_STRIDE = 8;

function hex(v, w = 6) {
  return '0x' + (v >>> 0).toString(16).toUpperCase().padStart(w, '0');
}

function hexByte(v) {
  return (v & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

function readU24LE(offset) {
  return rom[offset] | (rom[offset + 1] << 8) | (rom[offset + 2] << 16);
}

function readU16LE(offset) {
  return rom[offset] | (rom[offset + 1] << 8);
}

// Format a decoded instruction into a human-readable mnemonic string
function formatInstruction(inst) {
  const prefix = inst.modePrefix ? `${inst.modePrefix} ` : '';
  const t = inst.tag;
  const disp = (d) => (d >= 0 ? `+${d}` : `${d}`);

  let text = t;
  switch (t) {
    case 'nop': text = 'NOP'; break;
    case 'halt': text = 'HALT'; break;
    case 'di': text = 'DI'; break;
    case 'ei': text = 'EI'; break;
    case 'rlca': text = 'RLCA'; break;
    case 'rrca': text = 'RRCA'; break;
    case 'rla': text = 'RLA'; break;
    case 'rra': text = 'RRA'; break;
    case 'daa': text = 'DAA'; break;
    case 'cpl': text = 'CPL'; break;
    case 'scf': text = 'SCF'; break;
    case 'ccf': text = 'CCF'; break;
    case 'exx': text = 'EXX'; break;
    case 'ex-af': text = "EX AF, AF'"; break;
    case 'ex-de-hl': text = 'EX DE, HL'; break;
    case 'ex-sp-hl': text = 'EX (SP), HL'; break;
    case 'ex-sp-pair': text = `EX (SP), ${inst.pair.toUpperCase()}`; break;
    case 'neg': text = 'NEG'; break;
    case 'retn': text = 'RETN'; break;
    case 'reti': text = 'RETI'; break;
    case 'rrd': text = 'RRD'; break;
    case 'rld': text = 'RLD'; break;
    case 'ldi': text = 'LDI'; break;
    case 'ldd': text = 'LDD'; break;
    case 'ldir': text = 'LDIR'; break;
    case 'lddr': text = 'LDDR'; break;
    case 'cpi': text = 'CPI'; break;
    case 'cpd': text = 'CPD'; break;
    case 'cpir': text = 'CPIR'; break;
    case 'cpdr': text = 'CPDR'; break;
    case 'ini': text = 'INI'; break;
    case 'outi': text = 'OUTI'; break;
    case 'ind': text = 'IND'; break;
    case 'outd': text = 'OUTD'; break;
    case 'inir': text = 'INIR'; break;
    case 'otir': text = 'OTIR'; break;
    case 'indr': text = 'INDR'; break;
    case 'otdr': text = 'OTDR'; break;
    case 'otimr': text = 'OTIMR'; break;
    case 'slp': text = 'SLP'; break;
    case 'stmix': text = 'STMIX'; break;
    case 'rsmix': text = 'RSMIX'; break;
    case 'ld-mb-a': text = 'LD MB, A'; break;
    case 'ld-a-mb': text = 'LD A, MB'; break;
    case 'ld-sp-hl': text = 'LD SP, HL'; break;
    case 'ld-sp-pair': text = `LD SP, ${inst.pair.toUpperCase()}`; break;
    case 'im': text = `IM ${inst.value}`; break;
    case 'ld-special': text = `LD ${inst.dest.toUpperCase()}, ${inst.src.toUpperCase()}`; break;
    case 'push': text = `PUSH ${inst.pair.toUpperCase()}`; break;
    case 'pop': text = `POP ${inst.pair.toUpperCase()}`; break;
    case 'ld-pair-imm': text = `LD ${inst.pair.toUpperCase()}, ${hex(inst.value)}`; break;
    case 'ld-pair-mem':
      text = inst.direction === 'to-mem'
        ? `LD (${hex(inst.addr)}), ${inst.pair.toUpperCase()}`
        : `LD ${inst.pair.toUpperCase()}, (${hex(inst.addr)})`;
      break;
    case 'ld-mem-pair': text = `LD (${hex(inst.addr)}), ${inst.pair.toUpperCase()}`; break;
    case 'ld-reg-imm': text = `LD ${inst.dest.toUpperCase()}, ${hexByte(inst.value)}`; break;
    case 'ld-reg-reg': text = `LD ${inst.dest.toUpperCase()}, ${inst.src.toUpperCase()}`; break;
    case 'ld-reg-ind': text = `LD ${inst.dest.toUpperCase()}, (${inst.src.toUpperCase()})`; break;
    case 'ld-ind-reg': text = `LD (${inst.dest.toUpperCase()}), ${inst.src.toUpperCase()}`; break;
    case 'ld-ind-imm': text = `LD (HL), ${hexByte(inst.value)}`; break;
    case 'ld-reg-mem': text = `LD ${inst.dest.toUpperCase()}, (${hex(inst.addr)})`; break;
    case 'ld-mem-reg': text = `LD (${hex(inst.addr)}), ${inst.src.toUpperCase()}`; break;
    case 'ld-reg-ixd':
      text = `LD ${inst.dest.toUpperCase()}, (${inst.indexRegister.toUpperCase()}${disp(inst.displacement)})`;
      break;
    case 'ld-ixd-reg':
      text = `LD (${inst.indexRegister.toUpperCase()}${disp(inst.displacement)}), ${inst.src.toUpperCase()}`;
      break;
    case 'ld-ixd-imm':
      text = `LD (${inst.indexRegister.toUpperCase()}${disp(inst.displacement)}), ${hexByte(inst.value)}`;
      break;
    case 'inc-ixd':
      text = `INC (${inst.indexRegister.toUpperCase()}${disp(inst.displacement)})`;
      break;
    case 'dec-ixd':
      text = `DEC (${inst.indexRegister.toUpperCase()}${disp(inst.displacement)})`;
      break;
    case 'alu-imm': text = `${inst.op.toUpperCase()} ${hexByte(inst.value)}`; break;
    case 'alu-reg': text = `${inst.op.toUpperCase()} ${inst.src.toUpperCase()}`; break;
    case 'alu-ixd':
      text = `${inst.op.toUpperCase()} (${inst.indexRegister.toUpperCase()}${disp(inst.displacement)})`;
      break;
    case 'call': text = `CALL ${hex(inst.target)}`; break;
    case 'call-conditional': text = `CALL ${inst.condition.toUpperCase()}, ${hex(inst.target)}`; break;
    case 'jp': text = `JP ${hex(inst.target)}`; break;
    case 'jp-conditional': text = `JP ${inst.condition.toUpperCase()}, ${hex(inst.target)}`; break;
    case 'jp-indirect': text = `JP (${inst.indirectRegister.toUpperCase()})`; break;
    case 'jr': text = `JR ${hex(inst.target)}`; break;
    case 'jr-conditional': text = `JR ${inst.condition.toUpperCase()}, ${hex(inst.target)}`; break;
    case 'djnz': text = `DJNZ ${hex(inst.target)}`; break;
    case 'ret': text = 'RET'; break;
    case 'ret-conditional': text = `RET ${inst.condition.toUpperCase()}`; break;
    case 'rst': text = `RST ${hexByte(inst.target)}`; break;
    case 'inc-pair': text = `INC ${inst.pair.toUpperCase()}`; break;
    case 'dec-pair': text = `DEC ${inst.pair.toUpperCase()}`; break;
    case 'inc-reg': text = `INC ${inst.reg.toUpperCase()}`; break;
    case 'dec-reg': text = `DEC ${inst.reg.toUpperCase()}`; break;
    case 'add-pair': text = `ADD ${inst.dest.toUpperCase()}, ${inst.src.toUpperCase()}`; break;
    case 'adc-pair': text = `ADC HL, ${inst.src.toUpperCase()}`; break;
    case 'sbc-pair': text = `SBC HL, ${inst.src.toUpperCase()}`; break;
    case 'mlt': text = `MLT ${inst.reg.toUpperCase()}`; break;
    case 'rotate-reg': text = `${inst.op.toUpperCase()} ${inst.reg.toUpperCase()}`; break;
    case 'rotate-ind': text = `${inst.op.toUpperCase()} (HL)`; break;
    case 'bit-test': text = `BIT ${inst.bit}, ${inst.reg.toUpperCase()}`; break;
    case 'bit-test-ind': text = `BIT ${inst.bit}, (HL)`; break;
    case 'bit-res': text = `RES ${inst.bit}, ${inst.reg.toUpperCase()}`; break;
    case 'bit-res-ind': text = `RES ${inst.bit}, (HL)`; break;
    case 'bit-set': text = `SET ${inst.bit}, ${inst.reg.toUpperCase()}`; break;
    case 'bit-set-ind': text = `SET ${inst.bit}, (HL)`; break;
    case 'indexed-cb-rotate':
      text = `${inst.operation.toUpperCase()} (${inst.indexRegister.toUpperCase()}${disp(inst.displacement)})`;
      break;
    case 'indexed-cb-bit':
      text = `BIT ${inst.bit}, (${inst.indexRegister.toUpperCase()}${disp(inst.displacement)})`;
      break;
    case 'indexed-cb-res':
      text = `RES ${inst.bit}, (${inst.indexRegister.toUpperCase()}${disp(inst.displacement)})`;
      break;
    case 'indexed-cb-set':
      text = `SET ${inst.bit}, (${inst.indexRegister.toUpperCase()}${disp(inst.displacement)})`;
      break;
    case 'out-imm': text = `OUT (${hexByte(inst.port)}), A`; break;
    case 'in-imm': text = `IN A, (${hexByte(inst.port)})`; break;
    case 'out-reg': text = `OUT (C), ${inst.reg.toUpperCase()}`; break;
    case 'in-reg': text = `IN ${inst.reg.toUpperCase()}, (C)`; break;
    case 'in0': text = `IN0 ${inst.reg.toUpperCase()}, (${hexByte(inst.port)})`; break;
    case 'out0': text = `OUT0 (${hexByte(inst.port)}), ${inst.reg.toUpperCase()}`; break;
    case 'tst-reg': text = `TST A, ${inst.reg.toUpperCase()}`; break;
    case 'tst-ind': text = 'TST A, (HL)'; break;
    case 'tst-imm': text = `TST A, ${hexByte(inst.value)}`; break;
    case 'tstio': text = `TSTIO ${hexByte(inst.value)}`; break;
    case 'lea':
      text = `LEA ${inst.dest.toUpperCase()}, ${inst.base.toUpperCase()}${disp(inst.displacement)}`;
      break;
    case 'ld-pair-indexed':
      text = `LD ${inst.pair.toUpperCase()}, (${inst.indexRegister.toUpperCase()}${disp(inst.displacement)})`;
      break;
    case 'ld-indexed-pair':
      text = `LD (${inst.indexRegister.toUpperCase()}${disp(inst.displacement)}), ${inst.pair.toUpperCase()}`;
      break;
    case 'ld-ixiy-indexed':
      text = `LD ${inst.dest.toUpperCase()}, (${inst.indexRegister.toUpperCase()}${disp(inst.displacement)})`;
      break;
    case 'ld-indexed-ixiy':
      text = `LD (${inst.indexRegister.toUpperCase()}${disp(inst.displacement)}), ${inst.src.toUpperCase()}`;
      break;
    case 'ld-pair-ind': text = `LD ${inst.pair.toUpperCase()}, (${inst.src.toUpperCase()})`; break;
    case 'ld-ind-pair': text = `LD (${inst.dest.toUpperCase()}), ${inst.pair.toUpperCase()}`; break;
    default: text = t.toUpperCase(); break;
  }
  return `${prefix}${text}`;
}

// Classify instruction by tag for inventory
function classifyTag(inst) {
  const tags = [];
  const t = inst.tag;

  if (t === 'call' || t === 'call-conditional') tags.push('CALL');
  if (t === 'jp' || t === 'jp-conditional' || t === 'jp-indirect') tags.push('JP');
  if (t === 'jr' || t === 'jr-conditional') tags.push('JR');
  if (t === 'di') tags.push('DI');
  if (t === 'ei') tags.push('EI');
  if (t === 'ret' || t === 'ret-conditional') tags.push('RET');
  if (t === 'djnz') tags.push('DJNZ');

  // Port I/O
  if (t === 'in-imm' || t === 'in-reg' || t === 'in0' ||
      t === 'out-imm' || t === 'out-reg' || t === 'out0' ||
      t === 'ini' || t === 'outi' || t === 'ind' || t === 'outd' ||
      t === 'inir' || t === 'otir' || t === 'indr' || t === 'otdr') {
    tags.push('PORT_IO');
  }

  // IY references
  if (inst.indexRegister === 'iy' || inst.pair === 'iy' ||
      inst.dest === 'iy' || inst.src === 'iy' || inst.base === 'iy') {
    tags.push('IY');
  }

  // RAM references (D0xxxx or D4xxxx addresses)
  const addr = inst.addr ?? inst.target ?? inst.value;
  if (typeof addr === 'number' && addr >= 0xD00000 && addr <= 0xDFFFFF) {
    tags.push('RAM');
  }

  return tags;
}

// Extract RAM addresses from instruction
function extractRamAddr(inst) {
  const refs = [];
  for (const field of [inst.addr, inst.target, inst.value]) {
    if (typeof field === 'number' && field >= 0xD00000 && field <= 0xDFFFFF) {
      refs.push(field);
    }
  }
  return refs;
}

// =========================================================================
// Disassemble the function
// =========================================================================

const instructions = [];
const calls = [];
const jps = [];
const jrs = [];
const ramRefs = new Map();  // addr -> [{pc, mnemonic}]
const iyOps = [];
const portIo = [];
const interruptOps = [];
const retOps = [];

let pc = START;
const end = START + DISASM_BYTES;

while (pc < end && pc < rom.length) {
  let decoded;
  try {
    decoded = decodeInstruction(rom, pc, 'adl');
  } catch (e) {
    decoded = { tag: 'unknown', length: 1, pc };
  }
  if (!decoded || !decoded.length) {
    decoded = { tag: 'unknown', length: 1, pc };
  }

  const mnemonic = formatInstruction(decoded);
  const rawBytes = Array.from(rom.subarray(pc, pc + decoded.length))
    .map(b => hexByte(b)).join(' ');
  const tags = classifyTag(decoded);

  const record = { address: pc, rawBytes, length: decoded.length, mnemonic, tags, decoded };
  instructions.push(record);

  if (tags.includes('CALL')) calls.push(record);
  if (tags.includes('JP')) jps.push(record);
  if (tags.includes('JR')) jrs.push(record);
  if (tags.includes('IY')) iyOps.push(record);
  if (tags.includes('PORT_IO')) portIo.push(record);
  if (tags.includes('DI') || tags.includes('EI')) interruptOps.push(record);
  if (tags.includes('RET')) retOps.push(record);

  for (const ref of extractRamAddr(decoded)) {
    const key = hex(ref);
    if (!ramRefs.has(key)) ramRefs.set(key, []);
    ramRefs.get(key).push({ pc, mnemonic });
  }

  pc += decoded.length;
}

// =========================================================================
// Decode parameter table at 0x0A344A
// =========================================================================

// Keyboard group names from keyboard-matrix.md
const GROUP_NAMES = [
  'keyMatrix[0] = SDK Group 7 (arrows: DOWN/LEFT/RIGHT/UP)',
  'keyMatrix[1] = SDK Group 6 (operators: ENTER/+/-/x/div/^/CLEAR)',
  'keyMatrix[2] = SDK Group 5 ((-)/3/6/9/)/TAN/VARS)',
  'keyMatrix[3] = SDK Group 4 (./2/5/8/(/COS/PRGM/STAT)',
  'keyMatrix[4] = SDK Group 3 (0/1/4/7/,/SIN/APPS/X,T)',
  'keyMatrix[5] = SDK Group 2 (STO/LN/LOG/x^2/x^-1/MATH/ALPHA)',
  'keyMatrix[6] = SDK Group 1 (GRAPH/TRACE/ZOOM/WINDOW/Y=/2ND/MODE/DEL)',
  'keyMatrix[7] = ON key (bit 7)',
  'Group 8 (unknown / extended)',
];

console.log('=== Phase 582: Decode 0x0A32F9 — Real Keyboard Matrix Scan Engine ===');
console.log(`ROM: TI-84_Plus_CE/ROM.rom`);
console.log(`Disassembly range: ${hex(START)} .. ${hex(pc - 1)} (${pc - START} bytes decoded)`);
console.log(`Parameter table: ${hex(TABLE_ADDR)} (${TABLE_GROUPS} groups x ${TABLE_STRIDE} bytes = ${TABLE_GROUPS * TABLE_STRIDE} bytes)`);
console.log('');

// =========================================================================
// Full disassembly listing
// =========================================================================

console.log('=== FULL DISASSEMBLY ===');
for (const ins of instructions) {
  const tagStr = ins.tags.length ? `  ; ${ins.tags.join(', ')}` : '';
  console.log(`${hex(ins.address)}  ${ins.rawBytes.padEnd(20)} ${ins.mnemonic}${tagStr}`);
}
console.log('');

// =========================================================================
// Parameter table decode
// =========================================================================

console.log('=== PARAMETER TABLE at ' + hex(TABLE_ADDR) + ' ===');
console.log(`${TABLE_GROUPS} groups x ${TABLE_STRIDE} bytes each:`);
console.log('');

for (let g = 0; g < TABLE_GROUPS; g++) {
  const offset = TABLE_ADDR + g * TABLE_STRIDE;
  const rowBytes = Array.from(rom.subarray(offset, offset + TABLE_STRIDE));
  const rowHex = rowBytes.map(b => hexByte(b)).join(' ');

  // Try to interpret the 8 bytes
  const u24_0 = readU24LE(offset);       // bytes 0-2
  const byte3 = rom[offset + 3];         // byte 3
  const byte4 = rom[offset + 4];         // byte 4
  const u24_5 = readU24LE(offset + 5);   // bytes 5-7

  console.log(`Group ${g}: ${hex(offset)}  ${rowHex}`);
  console.log(`  Name: ${GROUP_NAMES[g] || '(unknown)'}`);
  console.log(`  Bytes[0..2] as u24LE: ${hex(u24_0)}  ${u24_0 >= 0xD00000 && u24_0 <= 0xDFFFFF ? '** RAM POINTER **' : ''}`);
  console.log(`  Byte[3]: ${hexByte(byte3)} (${byte3})`);
  console.log(`  Byte[4]: ${hexByte(byte4)} (${byte4})`);
  console.log(`  Bytes[5..7] as u24LE: ${hex(u24_5)}  ${u24_5 >= 0xD00000 && u24_5 <= 0xDFFFFF ? '** RAM POINTER **' : ''}`);

  // Check all possible 24-bit little-endian values in the row
  for (let i = 0; i <= TABLE_STRIDE - 3; i++) {
    const val = readU24LE(offset + i);
    if (val >= 0xD00000 && val <= 0xDFFFFF) {
      console.log(`  ** RAM ref at byte[${i}..${i + 2}]: ${hex(val)}`);
    }
    if (val >= 0x0A0000 && val <= 0x0BFFFF) {
      console.log(`  ** ROM ref at byte[${i}..${i + 2}]: ${hex(val)} (possible subroutine)`);
    }
  }
  console.log('');
}

// =========================================================================
// Instruction inventory
// =========================================================================

console.log('=== INSTRUCTION INVENTORY ===');

console.log(`\nCALLs (${calls.length}):`);
for (const ins of calls) {
  const target = ins.decoded.target;
  console.log(`  ${hex(ins.address)}  ${ins.mnemonic}  (target ${hex(target)})`);
}

console.log(`\nJPs (${jps.length}):`);
for (const ins of jps) {
  const target = ins.decoded.target;
  const inRange = target >= START && target < end;
  console.log(`  ${hex(ins.address)}  ${ins.mnemonic}  ${inRange ? '(internal)' : '(external)'}`);
}

console.log(`\nJRs (${jrs.length}):`);
for (const ins of jrs) {
  const target = ins.decoded.target;
  console.log(`  ${hex(ins.address)}  ${ins.mnemonic}  (target ${hex(target)})`);
}

console.log(`\nDJNZ:`);
for (const ins of instructions) {
  if (ins.decoded.tag === 'djnz') {
    console.log(`  ${hex(ins.address)}  ${ins.mnemonic}  (target ${hex(ins.decoded.target)})`);
  }
}

console.log(`\nIY ops (${iyOps.length}):`);
for (const ins of iyOps) {
  console.log(`  ${hex(ins.address)}  ${ins.mnemonic}`);
}

console.log(`\nPort I/O ops (${portIo.length}):`);
for (const ins of portIo) {
  const port = ins.decoded.port;
  console.log(`  ${hex(ins.address)}  ${ins.mnemonic}  ${port !== undefined ? `port=${hexByte(port)}` : ''}`);
}

console.log(`\nDI/EI ops (${interruptOps.length}):`);
for (const ins of interruptOps) {
  console.log(`  ${hex(ins.address)}  ${ins.mnemonic}`);
}

console.log(`\nRET ops (${retOps.length}):`);
for (const ins of retOps) {
  console.log(`  ${hex(ins.address)}  ${ins.mnemonic}`);
}

// =========================================================================
// RAM references
// =========================================================================

console.log('\n=== RAM REFERENCES (D0xxxx/D4xxxx) ===');
if (ramRefs.size) {
  const sorted = [...ramRefs.entries()].sort();
  for (const [ref, uses] of sorted) {
    console.log(`\n${ref}:`);
    for (const use of uses) {
      console.log(`  ${hex(use.pc)}  ${use.mnemonic}`);
    }
  }
} else {
  console.log('No D0xxxx/D4xxxx references found.');
}

// =========================================================================
// Cross-reference with keyboard matrix spec
// =========================================================================

console.log('\n\n=== CROSS-REFERENCE: Table RAM pointers vs keyboard-matrix.md ===');
console.log('D02ACC = hardware scan result source (noted by session 581)');
console.log('D005F6 = round-robin group counter');
console.log('D000C6 = display mode byte (BIT 2 checked)');
console.log('');
console.log('Expected: each group in the parameter table has a RAM destination pointer');
console.log('where scan results for that keyboard group are written.');
console.log('Extended RAM range D408A7-D422CE noted by session 581.');
console.log('');

// Scan the table for all D4xxxx pointers
console.log('=== ALL D4xxxx pointers in table ===');
for (let g = 0; g < TABLE_GROUPS; g++) {
  const offset = TABLE_ADDR + g * TABLE_STRIDE;
  const found = [];
  for (let i = 0; i <= TABLE_STRIDE - 3; i++) {
    const val = readU24LE(offset + i);
    if (val >= 0xD40000 && val <= 0xD4FFFF) {
      found.push({ byteOffset: i, addr: val });
    }
  }
  if (found.length) {
    for (const f of found) {
      console.log(`Group ${g} byte[${f.byteOffset}]: ${hex(f.addr)}  -- ${GROUP_NAMES[g] || '?'}`);
    }
  }
}

// Also check D0xxxx pointers in table
console.log('\n=== ALL D0xxxx pointers in table ===');
for (let g = 0; g < TABLE_GROUPS; g++) {
  const offset = TABLE_ADDR + g * TABLE_STRIDE;
  for (let i = 0; i <= TABLE_STRIDE - 3; i++) {
    const val = readU24LE(offset + i);
    if (val >= 0xD00000 && val <= 0xD0FFFF) {
      console.log(`Group ${g} byte[${i}]: ${hex(val)}  -- ${GROUP_NAMES[g] || '?'}`);
    }
  }
}

// =========================================================================
// Summary
// =========================================================================

console.log('\n\n=== SUMMARY ===');
console.log(`Total instructions decoded: ${instructions.length}`);
console.log(`Function span: ${hex(START)} .. ${hex(pc - 1)} (${pc - START} bytes)`);
console.log(`CALLs: ${calls.length}, JPs: ${jps.length}, JRs: ${jrs.length}, RETs: ${retOps.length}`);
console.log(`IY ops: ${iyOps.length}, Port I/O: ${portIo.length}, DI/EI: ${interruptOps.length}`);
console.log(`Unique RAM addresses referenced: ${ramRefs.size}`);
console.log('');
console.log('DONE');
