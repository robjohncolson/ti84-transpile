#!/usr/bin/env node

/**
 * Phase 582: Decode 0x05C5B3 — Token Inserter
 *
 * Session 581 decoded 0x08C509 (common key processing path, ~140B).
 * In the post-processing stage, the auto-overwrite loop reads D008D6/D0243A,
 * classifies via CALL 0x080064, and inserts via CALL 0x05C5B3.
 *
 * This probe:
 *   1. Disassembles 0x05C5B3 for ~300 bytes, stopping at unconditional RET/JP
 *   2. Documents ALL: CALL targets, JP/JR targets, RAM references (D0xxxx), IY+offset ops
 *   3. Determines: does it call BufInsert (0x05E2A0)? Multi-byte vs single-byte?
 *      Does it update cursor positions (D0231A, D0243A)?
 *   4. Maps the relationship between 0x05C5B3 and 0x05E2A0
 *   5. Counts callers of 0x05C5B3 in the full 4MB ROM
 */

import fs from 'node:fs';
import { decodeInstruction } from './ez80-decoder.js';

const TARGET = 0x05C5B3;
const ROM_SIZE = 0x400000;
const MAX_BYTES = 500;  // generous to capture full function
const BUF_INSERT = 0x05E2A0;

const KNOWN_ADDRS = new Map([
  [0x05E2A0, 'BufInsert'],
  [0x05E38B, 'token byte fetcher'],
  [0x05E37D, 'token buffer cursor guard'],
  [0x05E3EC, 'boundary check helper'],
  [0x080064, 'character classifier'],
  [0x08DD60, 'token backward reader'],
  [0x09BBA6, 'token advance+3-way classify'],
  [0xD0231A, 'cursor position'],
  [0xD0231D, 'boundary position'],
  [0xD0243A, 'edit cursor'],
  [0xD008D6, 'key/token staging'],
  [0xD0058E, 'key buffer'],
]);

function hex(v, w = 6) {
  return '0x' + v.toString(16).toUpperCase().padStart(w, '0');
}

function hexByte(v) {
  return '0x' + (v & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

function formatInstruction(inst) {
  if (!inst) return '(decode error)';

  switch (inst.tag) {
    case 'nop': return 'NOP';
    case 'halt': return 'HALT';
    case 'di': return 'DI';
    case 'ei': return 'EI';
    case 'exx': return 'EXX';
    case 'ex-af': return "EX AF, AF'";
    case 'ex-de-hl': return 'EX DE, HL';
    case 'ret': return 'RET';
    case 'reti': return 'RETI';
    case 'retn': return 'RETN';
    case 'ret-conditional': return `RET ${String(inst.condition).toUpperCase()}`;
    case 'push': return `PUSH ${String(inst.pair).toUpperCase()}`;
    case 'pop': return `POP ${String(inst.pair).toUpperCase()}`;

    case 'jp': return `JP ${hex(inst.target)}`;
    case 'jp-conditional': return `JP ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jp-hl': return 'JP (HL)';
    case 'jp-indirect': return `JP (${String(inst.indirectRegister).toUpperCase()})`;
    case 'jr': return `JR ${hex(inst.target)}`;
    case 'jr-conditional': return `JR ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'djnz': return `DJNZ ${hex(inst.target)}`;
    case 'call': return `CALL ${hex(inst.target)}`;
    case 'call-conditional': return `CALL ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'rst': return `RST ${hexByte(inst.target)}`;

    case 'ld-reg-reg': return `LD ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-imm': return `LD ${String(inst.dest).toUpperCase()}, ${hex(inst.value, inst.value > 0xFF ? 6 : 2)}`;
    case 'ld-reg-mem': return `LD ${String(inst.dest).toUpperCase()}, (${hex(inst.addr)})`;
    case 'ld-mem-reg': return `LD (${hex(inst.addr)}), ${String(inst.src).toUpperCase()}`;
    case 'ld-pair-imm': return `LD ${String(inst.pair).toUpperCase()}, ${hex(inst.value, 6)}`;
    case 'ld-pair-mem': {
      if (inst.direction === 'to-mem') return `LD (${hex(inst.addr)}), ${String(inst.pair).toUpperCase()}`;
      return `LD ${String(inst.pair).toUpperCase()}, (${hex(inst.addr)})`;
    }
    case 'ld-reg16-imm': return `LD ${String(inst.dest).toUpperCase()}, ${hex(inst.value, 6)}`;
    case 'ld-reg16-mem': return `LD ${String(inst.dest).toUpperCase()}, (${hex(inst.addr)})`;
    case 'ld-mem-reg16': return `LD (${hex(inst.addr)}), ${String(inst.src).toUpperCase()}`;
    case 'ld-sp-hl': return 'LD SP, HL';
    case 'ld-sp-index': return `LD SP, ${String(inst.indexRegister).toUpperCase()}`;
    case 'ld-mem-imm': return `LD (${hex(inst.addr)}), ${hexByte(inst.value)}`;
    case 'ld-ind-reg': return `LD (${String(inst.dest).toUpperCase()}), ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-ind': return `LD ${String(inst.dest).toUpperCase()}, (${String(inst.src || inst.pair || 'HL').toUpperCase()})`;
    case 'ld-a-indirect': return `LD A, (${String(inst.reg).toUpperCase()})`;
    case 'ld-indirect-a': return `LD (${String(inst.reg).toUpperCase()}), A`;
    case 'ld-special': return `LD ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'ld-a-mb': return 'LD A, MB';
    case 'ld-mb-a': return 'LD MB, A';

    case 'ld-index-imm': return `LD ${String(inst.indexRegister).toUpperCase()}, ${hex(inst.value, 6)}`;
    case 'ld-index-mem': return `LD ${String(inst.indexRegister).toUpperCase()}, (${hex(inst.addr)})`;
    case 'ld-mem-index': return `LD (${hex(inst.addr)}), ${String(inst.indexRegister).toUpperCase()}`;
    case 'ld-indexed-imm': return `LD (${String(inst.indexRegister).toUpperCase()}+${inst.displacement}), ${hexByte(inst.value)}`;
    case 'ld-indexed-reg': return `LD (${String(inst.indexRegister).toUpperCase()}+${inst.displacement}), ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-indexed': return `LD ${String(inst.dest).toUpperCase()}, (${String(inst.indexRegister).toUpperCase()}+${inst.displacement})`;

    case 'inc-reg': return `INC ${String(inst.reg).toUpperCase()}`;
    case 'dec-reg': return `DEC ${String(inst.reg).toUpperCase()}`;
    case 'inc-pair': return `INC ${String(inst.pair).toUpperCase()}`;
    case 'dec-pair': return `DEC ${String(inst.pair).toUpperCase()}`;
    case 'inc-index': return `INC ${String(inst.indexRegister).toUpperCase()}`;
    case 'dec-index': return `DEC ${String(inst.indexRegister).toUpperCase()}`;
    case 'inc-indexed': return `INC (${String(inst.indexRegister).toUpperCase()}+${inst.displacement})`;
    case 'dec-indexed': return `DEC (${String(inst.indexRegister).toUpperCase()}+${inst.displacement})`;

    case 'alu-reg': return `${String(inst.op).toUpperCase()} ${String(inst.src).toUpperCase()}`;
    case 'alu-imm': return `${String(inst.op).toUpperCase()} ${hexByte(inst.value)}`;
    case 'alu-indexed': return `${String(inst.op).toUpperCase()} (${String(inst.indexRegister).toUpperCase()}+${inst.displacement})`;

    case 'or-reg': return `OR ${String(inst.src).toUpperCase()}`;
    case 'and-reg': return `AND ${String(inst.src).toUpperCase()}`;
    case 'xor-reg': return `XOR ${String(inst.src).toUpperCase()}`;
    case 'cp-reg': return `CP ${String(inst.src).toUpperCase()}`;
    case 'or-imm': return `OR ${hexByte(inst.value)}`;
    case 'and-imm': return `AND ${hexByte(inst.value)}`;
    case 'xor-imm': return `XOR ${hexByte(inst.value)}`;
    case 'cp-imm': return `CP ${hexByte(inst.value)}`;

    case 'add-hl-reg16': return `ADD HL, ${String(inst.src).toUpperCase()}`;
    case 'adc-hl-reg16': return `ADC HL, ${String(inst.src).toUpperCase()}`;
    case 'sbc-hl-reg16': return `SBC HL, ${String(inst.src).toUpperCase()}`;
    case 'add-index-reg16': return `ADD ${String(inst.indexRegister).toUpperCase()}, ${String(inst.src).toUpperCase()}`;

    case 'rotate-reg': return `${String(inst.op).toUpperCase()} ${String(inst.reg).toUpperCase()}`;
    case 'rotate-ind': return `${String(inst.op).toUpperCase()} (${String(inst.indirectRegister).toUpperCase()})`;

    case 'bit-test': return `BIT ${inst.bit}, ${String(inst.reg).toUpperCase()}`;
    case 'bit-test-ind': return `BIT ${inst.bit}, (${String(inst.indirectRegister).toUpperCase()})`;
    case 'bit-set': return `SET ${inst.bit}, ${String(inst.reg).toUpperCase()}`;
    case 'bit-set-ind': return `SET ${inst.bit}, (${String(inst.indirectRegister).toUpperCase()})`;
    case 'bit-res': return `RES ${inst.bit}, ${String(inst.reg).toUpperCase()}`;
    case 'bit-res-ind': return `RES ${inst.bit}, (${String(inst.indirectRegister).toUpperCase()})`;

    case 'indexed-cb-bit': return `BIT ${inst.bit}, (${String(inst.indexRegister).toUpperCase()}+${inst.displacement})`;
    case 'indexed-cb-set': return `SET ${inst.bit}, (${String(inst.indexRegister).toUpperCase()}+${inst.displacement})`;
    case 'indexed-cb-res': return `RES ${inst.bit}, (${String(inst.indexRegister).toUpperCase()}+${inst.displacement})`;

    case 'rlca': return 'RLCA';
    case 'rrca': return 'RRCA';
    case 'rla': return 'RLA';
    case 'rra': return 'RRA';
    case 'daa': return 'DAA';
    case 'cpl': return 'CPL';
    case 'scf': return 'SCF';
    case 'ccf': return 'CCF';
    case 'neg': return 'NEG';

    case 'ldi': return 'LDI';
    case 'ldir': return 'LDIR';
    case 'ldd': return 'LDD';
    case 'lddr': return 'LDDR';
    case 'cpi': return 'CPI';
    case 'cpir': return 'CPIR';
    case 'cpd': return 'CPD';
    case 'cpdr': return 'CPDR';

    case 'in-reg-c': return `IN ${String(inst.dest).toUpperCase()}, (C)`;
    case 'out-c-reg': return `OUT (C), ${String(inst.src).toUpperCase()}`;
    case 'in-a-imm': return `IN A, (${hexByte(inst.port)})`;
    case 'out-imm-a': return `OUT (${hexByte(inst.port)}), A`;

    case 'im': return `IM ${inst.mode}`;

    default: {
      let s = inst.tag;
      if (inst.target !== undefined) s += ` target=${hex(inst.target)}`;
      if (inst.value !== undefined) s += ` val=${hex(inst.value, 2)}`;
      if (inst.addr !== undefined) s += ` addr=${hex(inst.addr)}`;
      if (inst.dest !== undefined) s += ` dest=${String(inst.dest).toUpperCase()}`;
      if (inst.src !== undefined) s += ` src=${String(inst.src).toUpperCase()}`;
      if (inst.reg !== undefined) s += ` reg=${String(inst.reg).toUpperCase()}`;
      if (inst.bit !== undefined) s += ` bit=${inst.bit}`;
      if (inst.indexRegister !== undefined) s += ` idx=${String(inst.indexRegister).toUpperCase()}`;
      if (inst.displacement !== undefined) s += ` disp=${inst.displacement}`;
      return s;
    }
  }
}

// --- Main ---

const rom = fs.readFileSync('TI-84_Plus_CE/ROM.rom');

console.log(`=== Phase 582: Decode 0x05C5B3 — Token Inserter ===\n`);
console.log(`Context: 0x08C509 auto-overwrite loop reads D008D6/D0243A,`);
console.log(`  classifies via CALL 0x080064, inserts via CALL 0x05C5B3.\n`);

// 1. Disassemble from 0x05C5B3 until we hit an unconditional RET or JP,
//    or exhaust MAX_BYTES. We track conditional RET/JP but don't stop on them.
console.log(`--- Disassembly from ${hex(TARGET)} ---\n`);

const listing = [];
const subCalls = [];
const jpTargets = [];
const jrTargets = [];
const ramRefs = new Map();
const iyOps = [];
let pc = TARGET;
let endReason = 'scan limit';

// Decode a fixed range to capture the full function body including all branch targets.
// The function has multiple early-return paths (returning status codes 0xFA/0xFB/0xFC/0xFE),
// so we can't stop at the first unconditional RET. Instead, decode through 0x05C700
// to also capture the sub-function at 0x05C60D and continuation paths.
const DECODE_END = TARGET + MAX_BYTES;

while (pc < DECODE_END) {
  const inst = decodeInstruction(rom, pc, 'adl');
  if (!inst || !inst.length) {
    const byteVal = rom[pc];
    console.log(`  ${hex(pc)}  ${byteVal.toString(16).toUpperCase().padStart(2, '0')}                   DB 0x${byteVal.toString(16).toUpperCase().padStart(2, '0')}`);
    listing.push({ pc, text: `DB 0x${byteVal.toString(16).toUpperCase().padStart(2, '0')}`, length: 1 });
    pc += 1;
    continue;
  }

  const len = inst.length;
  const rawBytes = [...rom.subarray(pc, pc + len)]
    .map(b => b.toString(16).toUpperCase().padStart(2, '0'))
    .join(' ');
  const text = formatInstruction(inst);

  console.log(`  ${hex(pc)}  ${rawBytes.padEnd(20)} ${text}`);
  listing.push({ pc, text, length: len, inst });

  // Track CALL targets
  if (inst.tag === 'call' || inst.tag === 'call-conditional') {
    subCalls.push({ pc, target: inst.target, text });
  }

  // Track JP targets (unconditional and conditional)
  if (inst.tag === 'jp' || inst.tag === 'jp-conditional') {
    jpTargets.push({ pc, target: inst.target, text, conditional: inst.tag === 'jp-conditional' });
  }

  // Track JR targets
  if (inst.tag === 'jr' || inst.tag === 'jr-conditional' || inst.tag === 'djnz') {
    jrTargets.push({ pc, target: inst.target, text });
  }

  // Track RAM refs (addresses >= 0xD00000)
  const addrs = [inst.addr, inst.target, inst.value].filter(
    v => typeof v === 'number' && v >= 0xD00000
  );
  for (const a of addrs) {
    if (!ramRefs.has(a)) ramRefs.set(a, []);
    ramRefs.get(a).push({ pc, text });
  }

  // Track IY+ operations
  if (inst.indexRegister === 'iy' && inst.displacement !== undefined) {
    iyOps.push({ pc, text, offset: inst.displacement });
  }

  pc += len;
}

const funcSize = pc - TARGET;
console.log(`\n  End: ${hex(pc)}, total decoded: ${funcSize} bytes, ${listing.length} instructions\n`);

// 2. Scan for callers of 0x05C5B3 in ROM
console.log(`--- Callers/jumpers to ${hex(TARGET)} in full ROM ---\n`);

const callers = [];
const lo = TARGET & 0xFF;
const mid = (TARGET >> 8) & 0xFF;
const hi = (TARGET >> 16) & 0xFF;

for (let i = 0; i < rom.length - 3; i++) {
  if (rom[i + 1] === lo && rom[i + 2] === mid && rom[i + 3] === hi) {
    if (rom[i] === 0xCD) {
      callers.push({ offset: i, type: 'CALL' });
    } else if (rom[i] === 0xC3) {
      callers.push({ offset: i, type: 'JP' });
    }
    const condCallOps = [0xC4, 0xCC, 0xD4, 0xDC, 0xE4, 0xEC, 0xF4, 0xFC];
    const condJpOps = [0xC2, 0xCA, 0xD2, 0xDA, 0xE2, 0xEA, 0xF2, 0xFA];
    if (condCallOps.includes(rom[i])) {
      callers.push({ offset: i, type: 'CALL cc' });
    } else if (condJpOps.includes(rom[i])) {
      callers.push({ offset: i, type: 'JP cc' });
    }
  }
}

// Also check JR refs
for (let i = 0; i < rom.length - 1; i++) {
  const op = rom[i];
  if (op === 0x18 || op === 0x20 || op === 0x28 || op === 0x30 || op === 0x38) {
    const disp = rom[i + 1] < 128 ? rom[i + 1] : rom[i + 1] - 256;
    const dest = i + 2 + disp;
    if (dest === TARGET) {
      const names = { 0x18: 'JR', 0x20: 'JR NZ', 0x28: 'JR Z', 0x30: 'JR NC', 0x38: 'JR C' };
      callers.push({ offset: i, type: names[op] });
    }
  }
}

const uniqueCallers = [...new Map(callers.map(c => [c.offset, c])).values()]
  .sort((a, b) => a.offset - b.offset);

console.log(`  Total references: ${uniqueCallers.length}`);
for (const c of uniqueCallers) {
  console.log(`    ${hex(c.offset)}: ${c.type} ${hex(TARGET)}`);
}

// 3. CALL targets summary
console.log(`\n--- CALL targets (${subCalls.length}) ---\n`);
const uniqueCallTargets = [...new Set(subCalls.map(c => c.target))].sort((a, b) => a - b);
for (const target of uniqueCallTargets) {
  const label = KNOWN_ADDRS.has(target) ? ` [${KNOWN_ADDRS.get(target)}]` : '';
  const refs = subCalls.filter(c => c.target === target);
  console.log(`  ${hex(target)}${label} (${refs.length} call${refs.length > 1 ? 's' : ''}):`);
  for (const r of refs) {
    console.log(`    ${hex(r.pc)}: ${r.text}`);
  }
}

// 4. JP targets summary
console.log(`\n--- JP targets (${jpTargets.length}) ---\n`);
for (const j of jpTargets) {
  const label = KNOWN_ADDRS.has(j.target) ? ` [${KNOWN_ADDRS.get(j.target)}]` : '';
  console.log(`  ${hex(j.pc)}: ${j.text}${label}${j.conditional ? ' (conditional)' : ' (unconditional)'}`);
}

// 5. JR targets summary
console.log(`\n--- JR/DJNZ targets (${jrTargets.length}) ---\n`);
for (const j of jrTargets) {
  console.log(`  ${hex(j.pc)}: ${j.text}`);
}

// 6. RAM refs
console.log(`\n--- RAM references (>= 0xD00000) ---\n`);
const sortedRam = [...ramRefs.entries()].sort((a, b) => a[0] - b[0]);
for (const [addr, refs] of sortedRam) {
  const label = KNOWN_ADDRS.has(addr) ? ` [${KNOWN_ADDRS.get(addr)}]` : '';
  console.log(`  ${hex(addr)}${label} (${refs.length} ref${refs.length > 1 ? 's' : ''}):`);
  for (const r of refs) {
    console.log(`    ${hex(r.pc)}: ${r.text}`);
  }
}

// 7. IY+ operations
console.log(`\n--- IY+ operations (${iyOps.length}) ---\n`);
const iyByOffset = new Map();
for (const op of iyOps) {
  if (!iyByOffset.has(op.offset)) iyByOffset.set(op.offset, []);
  iyByOffset.get(op.offset).push(op);
}
for (const [offset, ops] of [...iyByOffset.entries()].sort((a, b) => a[0] - b[0])) {
  console.log(`  IY+0x${offset.toString(16).toUpperCase().padStart(2, '0')} (${ops.length} ref${ops.length > 1 ? 's' : ''}):`);
  for (const op of ops) {
    console.log(`    ${hex(op.pc)}: ${op.text}`);
  }
}

// 8. Analysis
console.log(`\n--- Analysis ---\n`);
const callsBufInsert = uniqueCallTargets.includes(BUF_INSERT);
const touchesCursor = ramRefs.has(0xD0231A);
const touchesBoundary = ramRefs.has(0xD0231D);
const touchesEditCursor = ramRefs.has(0xD0243A);
const touchesKeyStaging = ramRefs.has(0xD008D6);
const touchesD0058E = ramRefs.has(0xD0058E);

console.log(`  Calls BufInsert (${hex(BUF_INSERT)}): ${callsBufInsert ? 'YES' : 'NO'}`);
console.log(`  References cursor D0231A: ${touchesCursor ? 'YES' : 'NO'}`);
console.log(`  References boundary D0231D: ${touchesBoundary ? 'YES' : 'NO'}`);
console.log(`  References edit cursor D0243A: ${touchesEditCursor ? 'YES' : 'NO'}`);
console.log(`  References key/token staging D008D6: ${touchesKeyStaging ? 'YES' : 'NO'}`);
console.log(`  References key buffer D0058E: ${touchesD0058E ? 'YES' : 'NO'}`);
console.log(`  Total CALL targets: ${uniqueCallTargets.length}`);
console.log(`  Total IY offsets used: ${iyByOffset.size}`);
console.log(`  External callers: ${uniqueCallers.length}`);

if (callsBufInsert) {
  console.log(`\n  RELATIONSHIP: 0x05C5B3 is a WRAPPER around BufInsert (0x05E2A0).`);
  console.log(`  It likely handles token classification/preparation before delegating`);
  console.log(`  the actual buffer insertion to BufInsert.`);
} else {
  console.log(`\n  RELATIONSHIP: 0x05C5B3 does NOT call BufInsert (0x05E2A0) directly.`);
  console.log(`  It is either a PARALLEL insertion path or a higher-level dispatcher`);
  console.log(`  that routes through other intermediaries.`);
}

console.log(`\n=== Phase 582 decode 0x05C5B3 complete ===`);
