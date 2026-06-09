#!/usr/bin/env node

/**
 * Phase 581: Decode 0x08C509 — Common Key Processing Path
 *
 * Session 579 decoded the key dispatch cascade at 0x08C3C3 (~600 bytes).
 * Keys 0x3F (?), 0x28 (left paren), 0x29 (right paren), 0xFE (format),
 * 0xFC (recall), and several others all route to 0x08C509 for common
 * processing before CALL 0x022331 (key processor) + CALL 0x08C72F
 * (display refresh) → JP 0x08C331 (event loop return).
 *
 * This probe:
 *   1. Disassembles 0x08C503-0x08C597 (pre-block + main block + post-processing)
 *   2. Also decodes 0x08C59B-0x08C688 (key remapping + catalog dispatch)
 *   3. Identifies CALL/JP targets, RAM refs, IY+offset ops
 *   4. Counts callers of 0x08C509 in the full 4MB ROM
 *   5. Prints structured analysis
 */

import fs from 'node:fs';
import { decodeInstruction } from './ez80-decoder.js';

const TARGET = 0x08C509;
const ROM_SIZE = 0x400000;
const MAX_BYTES = 400;

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

console.log(`=== Phase 581: Decode 0x08C509 — Common Key Processing Path ===\n`);
console.log(`Context: Event loop dispatch cascade at 0x08C3C3 routes keys`);
console.log(`  0x3F(?), 0x28/(, 0x29/), 0xFE(format), 0xFC(recall) to 0x08C509.`);
console.log(`  After common processing: CALL 0x022331 + CALL 0x08C72F -> JP 0x08C331.\n`);

// 1. Disassemble from 0x08C503 (pre-block: LD (D0058E),A / LD A,0xFE) through 0x08C697
console.log(`--- Disassembly from ${hex(0x08C503)} (pre-block + main block) ---\n`);

const listing = [];
const subCalls = [];
const jpTargets = [];
const ramRefs = new Map();
const iyOps = [];
let pc = 0x08C503;
const end = 0x08C6A0;
let terminals = 0;

while (pc < end) {
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

  // Track JP targets
  if (inst.tag === 'jp' || inst.tag === 'jp-conditional') {
    jpTargets.push({ pc, target: inst.target, text, conditional: inst.tag === 'jp-conditional' });
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

// 2. Scan for callers of 0x08C509 in ROM
console.log(`\n--- Callers/jumpers to ${hex(TARGET)} in full ROM ---\n`);

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

// Deduplicate and sort
const uniqueCallers = [...new Map(callers.map(c => [c.offset, c])).values()]
  .sort((a, b) => a.offset - b.offset);

console.log(`  Total references: ${uniqueCallers.length}`);
for (const c of uniqueCallers) {
  console.log(`    ${hex(c.offset)}: ${c.type} ${hex(TARGET)}`);
}

// 3. CALL targets summary
console.log(`\n--- CALL targets (${subCalls.length}) ---\n`);
for (const c of subCalls) {
  console.log(`  ${hex(c.pc)}: ${c.text}`);
}

// 4. JP targets summary
console.log(`\n--- JP targets (${jpTargets.length}) ---\n`);
for (const j of jpTargets) {
  console.log(`  ${hex(j.pc)}: ${j.text}${j.conditional ? ' (conditional)' : ' (unconditional)'}`);
}

// 5. RAM refs
console.log(`\n--- RAM references (>= 0xD00000) ---\n`);
const sortedRam = [...ramRefs.entries()].sort((a, b) => a[0] - b[0]);
for (const [addr, refs] of sortedRam) {
  console.log(`  ${hex(addr)} (${refs.length} ref${refs.length > 1 ? 's' : ''}):`);
  for (const r of refs) {
    console.log(`    ${hex(r.pc)}: ${r.text}`);
  }
}

// 6. IY+ operations
console.log(`\n--- IY+ operations (${iyOps.length}) ---\n`);
for (const op of iyOps) {
  console.log(`  ${hex(op.pc)}: IY+0x${op.offset.toString(16).toUpperCase().padStart(2, '0')}  ${op.text}`);
}

// 7. Summary
console.log(`\n--- Summary ---\n`);
console.log(`  Block: ${hex(TARGET)} (common key processing path)`);
console.log(`  Decoded range: ${hex(0x08C503)} - ${hex(pc)} (${pc - 0x08C503} bytes)`);
console.log(`  Instructions: ${listing.length}`);
console.log(`  CALL targets: ${subCalls.length}`);
console.log(`  JP targets: ${jpTargets.length}`);
console.log(`  Unique RAM refs: ${ramRefs.size}`);
console.log(`  IY+ operations: ${iyOps.length}`);
console.log(`  Callers/jumpers to 0x08C509: ${uniqueCallers.length}`);

console.log(`\n--- Analysis: What does common key processing do? ---\n`);
console.log(`  1. Key remapping: CP checks at 0x08C509 remap special keys:`);
console.log(`     - 0x69 -> 0xFC (format recall)`);
console.log(`     - 0x5B -> 0xFD`);
console.log(`     - 0x28 -> 0xDA (left paren, SET 7 IY+22)`);
console.log(`     - 0x29 -> 0x7F (right paren, SET 1 IY+29)`);
console.log(`  2. Convergence at 0x08C532: CALL 0x022331 (key processor) + CALL 0x08C72F (display refresh)`);
console.log(`  3. Post-processing: RES 4 IY+9, then POP AF to check original key`);
console.log(`  4. If original key == 0 (Z flag from PUSH/POP): JP 0x08C41D (multi-char token loop)`);
console.log(`  5. Otherwise: BIT 7 IY+14 gates a cursor/insert-mode auto-overwrite loop`);
console.log(`  6. Auto-overwrite loop (0x08C549-0x08C581): reads DE from D008D6, HL from D0243A,`);
console.log(`     calls 0x04C973 (compare?), processes chars, calls 0x05C5B3, loops back to 0x08C509`);
console.log(`  7. Exit: RES 2 IY+51, JP 0x08C33D (event loop cleanup)`);

console.log(`\n=== Phase 581 complete ===`);
