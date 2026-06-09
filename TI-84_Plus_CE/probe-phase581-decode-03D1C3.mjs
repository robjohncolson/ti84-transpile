#!/usr/bin/env node

/**
 * Phase 581: Decode 0x03D1C3 — Real Key Scan Function
 *
 * Called by the event loop's key input wrapper 0x0A27DD:
 *   Event loop 0x08C331 -> CALL 0x0A27DD -> CALL 0x03D1C3
 *
 * This probe statically disassembles the ROM bytes at 0x03D1C3 to determine
 * whether this is the keyboard matrix scanner (reads hardware ports) or a
 * higher-level wrapper.
 *
 * Output: full annotated disassembly, CALL/JP targets, RAM refs, IY ops,
 *         port I/O, caller scan, architectural summary.
 */

import fs from 'node:fs';
import { decodeInstruction } from './ez80-decoder.js';

const TARGET = 0x03D1C3;
const GETCSC = 0x03FA09;
const ROM_SIZE = 0x400000;
const MAX_BYTES = 800;  // scan generously — key scan may be large

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
      const dir = inst.direction;
      if (dir === 'to-mem') return `LD (${hex(inst.addr)}), ${String(inst.pair).toUpperCase()}`;
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
    case 'ini': return 'INI';
    case 'inir': return 'INIR';
    case 'ind': return 'IND';
    case 'indr': return 'INDR';
    case 'outi': return 'OUTI';
    case 'otir': return 'OTIR';
    case 'outd': return 'OUTD';
    case 'otdr': return 'OTDR';

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

console.log(`=== Phase 581: Decode 0x03D1C3 — Real Key Scan Function ===\n`);
console.log(`Context: Event loop 0x08C331 -> CALL 0x0A27DD -> CALL 0x03D1C3`);
console.log(`_GetCSC = ${hex(GETCSC)}\n`);

// 1. Disassemble from TARGET through MAX_BYTES
console.log(`--- Disassembly from ${hex(TARGET)} (up to ${MAX_BYTES} bytes) ---\n`);

const listing = [];
const subCalls = [];
const jpTargets = [];
const ramRefs = new Map();    // addr -> [refs...]
const iyOps = [];
const portOps = [];
let pc = TARGET;
const end = Math.min(TARGET + MAX_BYTES, rom.length);
let retCount = 0;
let unconditionalTermCount = 0;
let bytesAfterLastTerm = 0;
let pastFirstTerm = false;

while (pc < end) {
  const inst = decodeInstruction(rom, pc, 'adl');
  if (!inst || !inst.length) {
    const byteVal = rom[pc];
    console.log(`  ${hex(pc)}  ${byteVal.toString(16).toUpperCase().padStart(2, '0')}                   DB 0x${byteVal.toString(16).toUpperCase().padStart(2, '0')}`);
    listing.push({ pc, text: `DB 0x${byteVal.toString(16).toUpperCase().padStart(2, '0')}`, length: 1 });
    pc += 1;
    if (pastFirstTerm) bytesAfterLastTerm += 1;
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
    subCalls.push({ pc, target: inst.target, text, conditional: inst.tag === 'call-conditional' });
  }

  // Track JP targets (unconditional and conditional)
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

  // Track port I/O
  if (inst.tag === 'in-reg-c' || inst.tag === 'out-c-reg' ||
      inst.tag === 'in-a-imm' || inst.tag === 'out-imm-a' ||
      inst.tag === 'ini' || inst.tag === 'inir' || inst.tag === 'ind' || inst.tag === 'indr' ||
      inst.tag === 'outi' || inst.tag === 'otir' || inst.tag === 'outd' || inst.tag === 'otdr') {
    portOps.push({ pc, text });
  }

  // Track termination — keep scanning past conditional RETs,
  // but stop after multiple unconditional terminators
  if (inst.tag === 'ret' || inst.tag === 'reti' || inst.tag === 'retn') {
    retCount++;
    unconditionalTermCount++;
    pastFirstTerm = true;
    bytesAfterLastTerm = 0;
    if (unconditionalTermCount >= 4) break;
  }
  if (inst.tag === 'jp' && !inst.condition) {
    unconditionalTermCount++;
    pastFirstTerm = true;
    bytesAfterLastTerm = 0;
    if (unconditionalTermCount >= 4) break;
  }

  pc += len;
  if (pastFirstTerm) {
    bytesAfterLastTerm += len;
    if (bytesAfterLastTerm > 100) break;
  }
}

const functionSize = pc - TARGET;

// 2. Scan for callers of 0x03D1C3 in ROM
console.log(`\n--- Callers of ${hex(TARGET)} in ROM ---\n`);

const callCallers = [];
const jpCallers = [];

// CALL 0x03D1C3 = CD C3 D1 03
for (let i = 0; i < rom.length - 3; i++) {
  if (rom[i] === 0xCD && rom[i+1] === 0xC3 && rom[i+2] === 0xD1 && rom[i+3] === 0x03) {
    callCallers.push(i);
  }
}
// JP 0x03D1C3 = C3 C3 D1 03
for (let i = 0; i < rom.length - 3; i++) {
  if (rom[i] === 0xC3 && rom[i+1] === 0xC3 && rom[i+2] === 0xD1 && rom[i+3] === 0x03) {
    jpCallers.push(i);
  }
}

console.log(`  CALL callers (CD C3 D1 03): ${callCallers.length}`);
for (const c of callCallers) {
  console.log(`    ${hex(c)}`);
}
console.log(`  JP callers (C3 C3 D1 03): ${jpCallers.length}`);
for (const c of jpCallers) {
  console.log(`    ${hex(c)}`);
}
console.log(`  Total: ${callCallers.length + jpCallers.length}`);

// 3. Check for _GetCSC relationship
console.log(`\n--- _GetCSC (${hex(GETCSC)}) relationship ---\n`);

const callsGetCSC = subCalls.some(c => c.target === GETCSC);
const jpsGetCSC = jpTargets.some(j => j.target === GETCSC);

console.log(`  Direct CALL to _GetCSC: ${callsGetCSC ? 'YES' : 'NO'}`);
console.log(`  JP to _GetCSC: ${jpsGetCSC ? 'YES' : 'NO'}`);

if (callsGetCSC) {
  const matches = subCalls.filter(c => c.target === GETCSC);
  for (const m of matches) {
    console.log(`    at ${hex(m.pc)}: ${m.text}`);
  }
}
if (jpsGetCSC) {
  const matches = jpTargets.filter(j => j.target === GETCSC);
  for (const m of matches) {
    console.log(`    at ${hex(m.pc)}: ${m.text}`);
  }
}

// 4. Port I/O (direct keyboard reads)
console.log(`\n--- Port I/O operations ---\n`);
if (portOps.length === 0) {
  console.log(`  None in decoded window — likely reads keyboard via sub-calls`);
} else {
  for (const p of portOps) {
    console.log(`  ${hex(p.pc)}: ${p.text}`);
  }
}

// 5. All CALL targets
console.log(`\n--- CALL targets ---\n`);
for (const c of subCalls) {
  const isGetCSC = c.target === GETCSC ? '  *** _GetCSC ***' : '';
  console.log(`  ${hex(c.pc)}: ${c.text}${isGetCSC}`);
}

// 6. All JP targets
console.log(`\n--- JP targets ---\n`);
for (const j of jpTargets) {
  const inFunction = (j.target >= TARGET && j.target < TARGET + MAX_BYTES) ? '  [internal]' : '  [external]';
  const isGetCSC = j.target === GETCSC ? '  *** _GetCSC ***' : '';
  console.log(`  ${hex(j.pc)}: ${j.text}${inFunction}${isGetCSC}`);
}

// 7. RAM refs
console.log(`\n--- RAM references (>= 0xD00000) ---\n`);
const sortedRam = [...ramRefs.entries()].sort((a, b) => a[0] - b[0]);
if (sortedRam.length === 0) {
  console.log(`  None`);
} else {
  for (const [addr, refs] of sortedRam) {
    console.log(`  ${hex(addr)} (${refs.length} ref${refs.length > 1 ? 's' : ''}):`);
    for (const r of refs) {
      console.log(`    ${hex(r.pc)}: ${r.text}`);
    }
  }
}

// 8. IY+ operations
console.log(`\n--- IY+ operations ---\n`);
if (iyOps.length === 0) {
  console.log(`  None`);
} else {
  for (const op of iyOps) {
    console.log(`  ${hex(op.pc)}: IY+0x${op.offset.toString(16).toUpperCase().padStart(2, '0')}  ${op.text}`);
  }
}

// 9. Summary
console.log(`\n--- Summary ---\n`);
console.log(`  Function: ${hex(TARGET)} (Real Key Scan)`);
console.log(`  Decoded range: ${hex(TARGET)} - ${hex(pc)} (${functionSize} bytes)`);
console.log(`  Instructions: ${listing.length}`);
console.log(`  CALL targets: ${subCalls.length}`);
console.log(`  JP targets: ${jpTargets.length}`);
console.log(`  Unique RAM refs: ${ramRefs.size}`);
console.log(`  IY+ operations: ${iyOps.length}`);
console.log(`  Port I/O ops: ${portOps.length}`);
console.log(`  Callers (CALL): ${callCallers.length}`);
console.log(`  Callers (JP): ${jpCallers.length}`);
console.log(`  Wraps _GetCSC: ${callsGetCSC || jpsGetCSC ? 'YES' : 'NO'}`);
console.log(`  Direct port I/O: ${portOps.length > 0 ? 'YES' : 'NO'}`);
