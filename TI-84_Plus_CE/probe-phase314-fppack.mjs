#!/usr/bin/env node
// Phase 314 — Disassemble _fppack (0x0034EE), _fpunpack (0x0034A7), _ultof (0x00380D)
// Uses the project's own ez80-decoder.js to produce full instruction listings.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));

// --- Helpers ---

function hexN(v, w) {
  return '0x' + v.toString(16).toUpperCase().padStart(w, '0');
}

function disassembleRange(label, startAddr, maxAddr) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`  ${label}   ${hexN(startAddr, 6)} .. ${hexN(maxAddr, 6)}`);
  console.log('='.repeat(70));

  let pc = startAddr;
  const instructions = [];

  while (pc < maxAddr) {
    let instr;
    try {
      instr = decodeInstruction(romBytes, pc, 'adl');
    } catch (e) {
      // Fallback: show raw byte and advance
      const byte = romBytes[pc];
      console.log(`  ${hexN(pc, 6)}  ${hexN(byte, 2).slice(2).padEnd(12)}  ??? (decode error: ${e.message})`);
      pc += 1;
      continue;
    }

    // Build hex bytes string
    const bytes = [];
    for (let i = 0; i < instr.length; i++) {
      bytes.push(hexN(romBytes[pc + i], 2).slice(2));
    }
    const hexStr = bytes.join(' ').padEnd(18);

    // Build mnemonic from the instruction object
    const mnemonic = formatInstruction(instr);

    console.log(`  ${hexN(pc, 6)}  ${hexStr}  ${mnemonic}`);
    instructions.push({ addr: pc, instr, mnemonic });

    pc = instr.nextPc;

    // Stop at RET
    if (instr.tag === 'ret' || instr.tag === 'retn' || instr.tag === 'reti') {
      break;
    }
  }

  return instructions;
}

function formatInstruction(instr) {
  const tag = instr.tag;

  switch (tag) {
    case 'nop': return 'NOP';
    case 'ret': return 'RET';
    case 'retn': return 'RETN';
    case 'reti': return 'RETI';
    case 'halt': return 'HALT';
    case 'di': return 'DI';
    case 'ei': return 'EI';
    case 'exx': return 'EXX';
    case 'ex-af': return "EX AF, AF'";
    case 'ex-de-hl': return 'EX DE, HL';
    case 'ex-sp-hl': return 'EX (SP), HL';
    case 'ex-sp-pair': return `EX (SP), ${instr.pair.toUpperCase()}`;
    case 'scf': return 'SCF';
    case 'ccf': return 'CCF';
    case 'cpl': return 'CPL';
    case 'neg': return 'NEG';
    case 'daa': return 'DAA';
    case 'rlca': return 'RLCA';
    case 'rrca': return 'RRCA';
    case 'rla': return 'RLA';
    case 'rra': return 'RRA';
    case 'rrd': return 'RRD';
    case 'rld': return 'RLD';
    case 'ldi': return 'LDI';
    case 'ldir': return 'LDIR';
    case 'ldd': return 'LDD';
    case 'lddr': return 'LDDR';
    case 'cpi': return 'CPI';
    case 'cpir': return 'CPIR';
    case 'cpd': return 'CPD';
    case 'cpdr': return 'CPDR';

    case 'ld-reg-reg':
      return `LD ${instr.dest.toUpperCase()}, ${instr.src.toUpperCase()}`;
    case 'ld-reg-imm':
      return `LD ${instr.dest.toUpperCase()}, ${hexN(instr.value, 2)}`;
    case 'ld-reg-ind':
      return `LD ${instr.dest.toUpperCase()}, (${instr.src.toUpperCase()})`;
    case 'ld-ind-reg':
      return `LD (${instr.dest.toUpperCase()}), ${instr.src.toUpperCase()}`;
    case 'ld-ind-imm':
      return `LD (HL), ${hexN(instr.value, 2)}`;
    case 'ld-pair-imm':
      return `LD ${instr.pair.toUpperCase()}, ${hexN(instr.value, 6)}`;
    case 'ld-pair-mem':
      if (instr.direction === 'from-mem') {
        return `LD ${instr.pair.toUpperCase()}, (${hexN(instr.addr, 6)})`;
      }
      return `LD (${hexN(instr.addr, 6)}), ${instr.pair.toUpperCase()}`;
    case 'ld-mem-reg':
      return `LD (${hexN(instr.addr, 6)}), ${instr.src.toUpperCase()}`;
    case 'ld-reg-mem':
      return `LD ${instr.dest.toUpperCase()}, (${hexN(instr.addr, 6)})`;
    case 'ld-mem-pair':
      return `LD (${hexN(instr.addr, 6)}), ${instr.pair.toUpperCase()}`;
    case 'ld-pair-ind':
      return `LD ${instr.pair.toUpperCase()}, (${instr.src.toUpperCase()})`;
    case 'ld-ind-pair':
      return `LD (${instr.dest.toUpperCase()}), ${instr.pair.toUpperCase()}`;
    case 'ld-sp-hl':
      return 'LD SP, HL';
    case 'ld-sp-pair':
      return `LD SP, ${instr.pair.toUpperCase()}`;

    case 'ld-reg-ixd':
      return `LD ${instr.dest.toUpperCase()}, (${instr.indexRegister.toUpperCase()}${instr.displacement >= 0 ? '+' : ''}${instr.displacement})`;
    case 'ld-ixd-reg':
      return `LD (${instr.indexRegister.toUpperCase()}${instr.displacement >= 0 ? '+' : ''}${instr.displacement}), ${instr.src.toUpperCase()}`;
    case 'ld-ixd-imm':
      return `LD (${instr.indexRegister.toUpperCase()}${instr.displacement >= 0 ? '+' : ''}${instr.displacement}), ${hexN(instr.value, 2)}`;
    case 'ld-pair-indexed':
      return `LD ${instr.pair.toUpperCase()}, (${instr.indexRegister.toUpperCase()}${instr.displacement >= 0 ? '+' : ''}${instr.displacement})`;
    case 'ld-indexed-pair':
      return `LD (${instr.indexRegister.toUpperCase()}${instr.displacement >= 0 ? '+' : ''}${instr.displacement}), ${instr.pair.toUpperCase()}`;

    case 'ld-special':
      return `LD ${instr.dest.toUpperCase()}, ${instr.src.toUpperCase()}`;

    case 'inc-reg': return `INC ${instr.reg.toUpperCase()}`;
    case 'dec-reg': return `DEC ${instr.reg.toUpperCase()}`;
    case 'inc-pair': return `INC ${instr.pair.toUpperCase()}`;
    case 'dec-pair': return `DEC ${instr.pair.toUpperCase()}`;
    case 'inc-ixd':
      return `INC (${instr.indexRegister.toUpperCase()}${instr.displacement >= 0 ? '+' : ''}${instr.displacement})`;
    case 'dec-ixd':
      return `DEC (${instr.indexRegister.toUpperCase()}${instr.displacement >= 0 ? '+' : ''}${instr.displacement})`;

    case 'add-pair':
      return `ADD ${instr.dest.toUpperCase()}, ${instr.src.toUpperCase()}`;
    case 'adc-pair':
      return `ADC HL, ${instr.src.toUpperCase()}`;
    case 'sbc-pair':
      return `SBC HL, ${instr.src.toUpperCase()}`;

    case 'alu-reg':
      return `${instr.op.toUpperCase()} A, ${instr.src.toUpperCase()}`;
    case 'alu-imm':
      return `${instr.op.toUpperCase()} A, ${hexN(instr.value, 2)}`;
    case 'alu-ixd':
      return `${instr.op.toUpperCase()} A, (${instr.indexRegister.toUpperCase()}${instr.displacement >= 0 ? '+' : ''}${instr.displacement})`;

    case 'push': return `PUSH ${instr.pair.toUpperCase()}`;
    case 'pop': return `POP ${instr.pair.toUpperCase()}`;

    case 'jp':
      return `JP ${hexN(instr.target, 6)}`;
    case 'jp-conditional':
      return `JP ${instr.condition.toUpperCase()}, ${hexN(instr.target, 6)}`;
    case 'jp-indirect':
      return `JP (${instr.indirectRegister.toUpperCase()})`;
    case 'jr':
      return `JR ${hexN(instr.target, 6)}`;
    case 'jr-conditional':
      return `JR ${instr.condition.toUpperCase()}, ${hexN(instr.target, 6)}`;
    case 'djnz':
      return `DJNZ ${hexN(instr.target, 6)}`;

    case 'call':
      return `CALL ${hexN(instr.target, 6)}`;
    case 'call-conditional':
      return `CALL ${instr.condition.toUpperCase()}, ${hexN(instr.target, 6)}`;

    case 'ret-conditional':
      return `RET ${instr.condition.toUpperCase()}`;
    case 'rst':
      return `RST ${hexN(instr.target, 2)}`;

    case 'rotate-reg':
      return `${instr.op.toUpperCase()} ${instr.reg.toUpperCase()}`;
    case 'rotate-ind':
      return `${instr.op.toUpperCase()} (${instr.indirectRegister.toUpperCase()})`;

    case 'bit-test':
      return `BIT ${instr.bit}, ${instr.reg.toUpperCase()}`;
    case 'bit-test-ind':
      return `BIT ${instr.bit}, (${instr.indirectRegister.toUpperCase()})`;
    case 'bit-set':
      return `SET ${instr.bit}, ${instr.reg.toUpperCase()}`;
    case 'bit-set-ind':
      return `SET ${instr.bit}, (${instr.indirectRegister.toUpperCase()})`;
    case 'bit-res':
      return `RES ${instr.bit}, ${instr.reg.toUpperCase()}`;
    case 'bit-res-ind':
      return `RES ${instr.bit}, (${instr.indirectRegister.toUpperCase()})`;

    case 'indexed-cb-rotate':
      return `${instr.operation.toUpperCase()} (${instr.indexRegister.toUpperCase()}${instr.displacement >= 0 ? '+' : ''}${instr.displacement})`;
    case 'indexed-cb-bit':
      return `BIT ${instr.bit}, (${instr.indexRegister.toUpperCase()}${instr.displacement >= 0 ? '+' : ''}${instr.displacement})`;
    case 'indexed-cb-set':
      return `SET ${instr.bit}, (${instr.indexRegister.toUpperCase()}${instr.displacement >= 0 ? '+' : ''}${instr.displacement})`;
    case 'indexed-cb-res':
      return `RES ${instr.bit}, (${instr.indexRegister.toUpperCase()}${instr.displacement >= 0 ? '+' : ''}${instr.displacement})`;

    case 'in0': return `IN0 ${instr.reg.toUpperCase()}, (${hexN(instr.port, 2)})`;
    case 'out0': return `OUT0 (${hexN(instr.port, 2)}), ${instr.reg.toUpperCase()}`;
    case 'in-reg': return `IN ${instr.reg.toUpperCase()}, (C)`;
    case 'in-imm': return `IN A, (${hexN(instr.port, 2)})`;
    case 'out-reg': return `OUT (C), ${instr.reg.toUpperCase()}`;
    case 'out-imm': return `OUT (${hexN(instr.port, 2)}), A`;

    case 'mlt': return `MLT ${instr.reg.toUpperCase()}`;
    case 'tst-reg': return `TST A, ${instr.reg.toUpperCase()}`;
    case 'tst-ind': return 'TST A, (HL)';
    case 'tst-imm': return `TST A, ${hexN(instr.value, 2)}`;

    case 'lea':
      return `LEA ${instr.dest.toUpperCase()}, ${instr.base.toUpperCase()}${instr.displacement >= 0 ? '+' : ''}${instr.displacement}`;

    case 'stmix': return 'STMIX';
    case 'rsmix': return 'RSMIX';
    case 'ld-mb-a': return 'LD MB, A';
    case 'ld-a-mb': return 'LD A, MB';
    case 'slp': return 'SLP';

    default:
      return `[${tag}] ${JSON.stringify(instr)}`;
  }
}

// --- Main ---

console.log('Phase 314 — Soft-Float Pack/Unpack/ULtoF Disassembly');
console.log('ROM size:', romBytes.length, 'bytes');

// 1. _fpunpack: 0x0034A7 .. 0x0034ED
const unpackInstrs = disassembleRange('_fpunpack', 0x0034A7, 0x0034EE);

// 2. _fppack: 0x0034EE .. 0x003569 (or RET)
const packInstrs = disassembleRange('_fppack', 0x0034EE, 0x003569);

// 3. _ultof: 0x00380D (brief, until RET or ~40 bytes)
const ultofInstrs = disassembleRange('_ultof', 0x00380D, 0x003850);

// 4. Also show the FLTMAX literal at 0x003565
console.log('\n--- FLTMAX literal at 0x003565 ---');
const fltmax = [];
for (let i = 0; i < 4; i++) {
  fltmax.push(hexN(romBytes[0x003565 + i], 2).slice(2));
}
console.log(`  ${hexN(0x003565, 6)}  ${fltmax.join(' ')}  (as u32 LE: 0x${
  (romBytes[0x003565] | (romBytes[0x003566] << 8) | (romBytes[0x003567] << 16) | (romBytes[0x003568] << 24)) >>> 0
  .toString(16).padStart(8, '0')})`);

// Decode the FLTMAX as IEEE-754 single
const fltmaxBuf = Buffer.from(romBytes.slice(0x003565, 0x003569));
const fltmaxVal = fltmaxBuf.readFloatLE(0);
console.log(`  IEEE-754 single LE value: ${fltmaxVal}`);

// 5. Raw hex dump for _fppack region for manual cross-check
console.log('\n--- Raw hex dump: _fppack 0x0034EE..0x003569 ---');
for (let row = 0x0034EE; row < 0x003569; row += 16) {
  const bytes = [];
  for (let i = 0; i < 16 && row + i < 0x003569; i++) {
    bytes.push(hexN(romBytes[row + i], 2).slice(2));
  }
  console.log(`  ${hexN(row, 6)}  ${bytes.join(' ')}`);
}

console.log('\n--- Done ---');
