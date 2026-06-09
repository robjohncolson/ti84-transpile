#!/usr/bin/env node

/**
 * Phase 581: Decode 0x07BF19 -- QUIT Key Handler
 *
 * The event loop dispatch cascade at 0x08C3C3 checks key code 0xB4 (QUIT) first:
 *   CP 0xB4; CALL Z, 0x07BF19
 *
 * This probe statically disassembles 0x07BF19 and identifies:
 *   1. Screen-mode bit checks (IY+2 bits 4/5/6)
 *   2. RAM variable writes (D0058C, D0058E)
 *   3. CALL targets (screen-mode bit testers)
 *   4. All callers in the full 4MB ROM
 *   5. What QUIT does: maps screen mode to a replacement key code
 */

import fs from 'node:fs';
import { decodeInstruction } from './ez80-decoder.js';

const TARGET = 0x07BF19;
const ROM_SIZE = 0x400000;
const MAX_BYTES = 200;

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

    case 'ld-reg-imm': return `LD ${String(inst.dest).toUpperCase()}, ${hex(inst.value, inst.value > 0xFF ? 6 : 2)}`;
    case 'ld-reg-mem': return `LD ${String(inst.dest).toUpperCase()}, (${hex(inst.addr)})`;
    case 'ld-mem-reg': return `LD (${hex(inst.addr)}), ${String(inst.src).toUpperCase()}`;
    case 'ld-pair-imm': return `LD ${String(inst.pair).toUpperCase()}, ${hex(inst.value, 6)}`;
    case 'ld-pair-mem': {
      if (inst.direction === 'to-mem') return `LD (${hex(inst.addr)}), ${String(inst.pair).toUpperCase()}`;
      return `LD ${String(inst.pair).toUpperCase()}, (${hex(inst.addr)})`;
    }
    case 'ld-reg-reg': return `LD ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'ld-ind-reg': return `LD (${String(inst.dest).toUpperCase()}), ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-ind': return `LD ${String(inst.dest).toUpperCase()}, (${String(inst.src || inst.pair || 'HL').toUpperCase()})`;
    case 'ld-a-indirect': return `LD A, (${String(inst.reg).toUpperCase()})`;
    case 'ld-indirect-a': return `LD (${String(inst.reg).toUpperCase()}), A`;
    case 'ld-special': return `LD ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`;

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

    case 'alu-reg': return `${String(inst.op).toUpperCase()} ${String(inst.src).toUpperCase()}`;
    case 'alu-imm': return `${String(inst.op).toUpperCase()} ${hexByte(inst.value)}`;

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

console.log(`=== Phase 581: Decode 0x07BF19 -- QUIT Key Handler ===\n`);
console.log(`Context: Event loop 0x08C331 -> key dispatch 0x08C3C3 -> CP 0xB4; CALL Z, 0x07BF19`);
console.log(`Screen-mode bit testers: 0x06C72D (bit5), 0x06C737 (bit6), 0x06C73C (bit4)\n`);

// 1. Disassemble from TARGET
console.log(`--- Disassembly from ${hex(TARGET)} ---\n`);

const listing = [];
const subCalls = [];
const jpTargets = [];
const ramRefs = new Map();
const iyOps = [];
let pc = TARGET;
const end = Math.min(TARGET + MAX_BYTES, rom.length);
let hitTerminal = false;

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
    subCalls.push({ pc, target: inst.target, text, conditional: inst.tag === 'call-conditional' });
  }

  // Track JP targets
  if (inst.tag === 'jp' || inst.tag === 'jp-conditional') {
    jpTargets.push({ pc, target: inst.target, text, conditional: inst.tag === 'jp-conditional' });
  }

  // Track RAM refs (>= 0xD00000)
  const addrs = [inst.addr, inst.target, inst.value].filter(
    v => typeof v === 'number' && v >= 0xD00000
  );
  for (const a of addrs) {
    if (!ramRefs.has(a)) ramRefs.set(a, []);
    ramRefs.get(a).push({ pc, text });
  }

  // Track IY+ ops
  if (inst.indexRegister === 'iy' && inst.displacement !== undefined) {
    iyOps.push({ pc, text, offset: inst.displacement });
  }

  // Stop after terminal RET (the main function is short -- ends at first RET)
  if (inst.tag === 'ret') {
    hitTerminal = true;
    pc += len;
    break;
  }

  pc += len;
}

const funcSize = pc - TARGET;

// 2. Scan for callers
console.log(`\n--- Callers of ${hex(TARGET)} in ROM ---\n`);

const callCallers = [];
const jpCallers = [];
const condCallCallers = [];
const condJpCallers = [];

// CALL 0x07BF19 = CD 19 BF 07
for (let i = 0; i < rom.length - 3; i++) {
  if (rom[i + 1] === 0x19 && rom[i + 2] === 0xBF && rom[i + 3] === 0x07) {
    if (rom[i] === 0xCD) callCallers.push(i);
    if (rom[i] === 0xC3) jpCallers.push(i);
    // Conditional CALL opcodes: C4=NZ, CC=Z, D4=NC, DC=C, E4=PO, EC=PE, F4=P, FC=M
    const condCalls = { 0xC4: 'NZ', 0xCC: 'Z', 0xD4: 'NC', 0xDC: 'C', 0xE4: 'PO', 0xEC: 'PE', 0xF4: 'P', 0xFC: 'M' };
    if (condCalls[rom[i]]) condCallCallers.push({ addr: i, cond: condCalls[rom[i]] });
    // Conditional JP opcodes: C2=NZ, CA=Z, D2=NC, DA=C, E2=PO, EA=PE, F2=P, FA=M
    const condJps = { 0xC2: 'NZ', 0xCA: 'Z', 0xD2: 'NC', 0xDA: 'C', 0xE2: 'PO', 0xEA: 'PE', 0xF2: 'P', 0xFA: 'M' };
    if (condJps[rom[i]]) condJpCallers.push({ addr: i, cond: condJps[rom[i]] });
  }
}

console.log(`  CALL callers (CD 19 BF 07): ${callCallers.length}`);
for (const c of callCallers) console.log(`    ${hex(c)}`);

console.log(`  Conditional CALL callers: ${condCallCallers.length}`);
for (const c of condCallCallers) console.log(`    ${hex(c.addr)} CALL ${c.cond}`);

console.log(`  JP callers (C3 19 BF 07): ${jpCallers.length}`);
for (const c of jpCallers) console.log(`    ${hex(c)}`);

console.log(`  Conditional JP callers: ${condJpCallers.length}`);
for (const c of condJpCallers) console.log(`    ${hex(c.addr)} JP ${c.cond}`);

const totalCallers = callCallers.length + jpCallers.length + condCallCallers.length + condJpCallers.length;
console.log(`  Total: ${totalCallers}`);

// 3. CALL targets
console.log(`\n--- CALL targets ---\n`);
for (const c of subCalls) {
  let note = '';
  if (c.target === 0x06C72D) note = '  [BIT 5,(IY+2) tester]';
  if (c.target === 0x06C732) note = '  [BIT 7,(IY+2) tester]';
  if (c.target === 0x06C737) note = '  [BIT 6,(IY+2) tester]';
  if (c.target === 0x06C73C) note = '  [BIT 4,(IY+2) tester]';
  console.log(`  ${hex(c.pc)}: ${c.text}${note}`);
}

// 4. RAM refs
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

// 5. IY+ operations
console.log(`\n--- IY+ operations ---\n`);
if (iyOps.length === 0) {
  console.log(`  None (uses IY bit testers via CALL)`);
} else {
  for (const op of iyOps) {
    console.log(`  ${hex(op.pc)}: IY+0x${op.offset.toString(16).toUpperCase().padStart(2, '0')}  ${op.text}`);
  }
}

// 6. Summary
console.log(`\n--- Summary ---\n`);
console.log(`  Function: ${hex(TARGET)} (QUIT key handler)`);
console.log(`  Size: ${funcSize} bytes (${hex(TARGET)} - ${hex(pc - 1)})`);
console.log(`  Instructions: ${listing.length}`);
console.log(`  CALL targets: ${subCalls.length}`);
console.log(`  RAM refs: ${ramRefs.size} unique addresses`);
console.log(`  Callers: ${totalCallers} (CALL: ${callCallers.length}, CALL Z: ${condCallCallers.length}, JP: ${jpCallers.length})`);

console.log(`\n--- Behavior ---\n`);
console.log(`  QUIT handler maps current screen mode (IY+2 bits) to a replacement key code`);
console.log(`  stored in D0058C. The event loop reads D0058C on next iteration.`);
console.log(`  `);
console.log(`  Screen mode -> Key code mapping:`);
console.log(`    BIT 5,(IY+2) set -> D0058C = 0xCC`);
console.log(`    BIT 6,(IY+2) set -> D0058C = 0xAD`);
console.log(`    BIT 4,(IY+2) set -> D0058C = 0xB1`);
console.log(`    None set         -> D0058E = 0xE8, D0058C = 0xFE`);
console.log(`  `);
console.log(`  The function RETURNS to the event loop (RET at ${hex(TARGET + funcSize - 1)}).`);
console.log(`  It does NOT call the init trampoline (0x063033) directly.`);
console.log(`  It does NOT jump to 0x08C331 or 0x08C33D.`);
console.log(`  It simply injects a mode-dependent key code into D0058C and returns.`);
