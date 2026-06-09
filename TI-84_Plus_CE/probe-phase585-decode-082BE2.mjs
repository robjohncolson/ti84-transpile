#!/usr/bin/env node
// Phase 585: Decode 0x082BE2 — type mask helper called by 0x0846EA symbol table searcher.
// Static disassembly + caller count + analysis. No CPU boot needed.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romPath = path.join(__dirname, 'ROM.rom');

const TARGET = 0x082BE2;
const MAX_BYTES = 60;

function hex(v, w = 6) {
  return '0x' + (v >>> 0).toString(16).padStart(w, '0');
}

function hexByte(v) {
  return '0x' + (v & 0xff).toString(16).padStart(2, '0');
}

function formatIndexedOperand(indexRegister, displacement) {
  const sign = displacement >= 0 ? '+' : '';
  return `(${indexRegister}${sign}${displacement})`;
}

// Format a decoded instruction into readable assembly.
// The decoder returns {pc, length, nextPc, tag, ...fields} — no .mnemonic/.operandsStr.
function formatInstruction(inst) {
  switch (inst.tag) {
    case 'nop': return 'NOP';
    case 'ret': return 'RET';
    case 'ret-conditional': return `RET ${inst.condition}`;
    case 'call': return `CALL ${hex(inst.target)}`;
    case 'call-conditional': return `CALL ${inst.condition}, ${hex(inst.target)}`;
    case 'jp-abs': return `JP ${hex(inst.target)}`;
    case 'jp-conditional': return `JP ${inst.condition}, ${hex(inst.target)}`;
    case 'jp-hl': return 'JP (HL)';
    case 'jr': return `JR ${hex(inst.target)}`;
    case 'jr-conditional': return `JR ${inst.condition}, ${hex(inst.target)}`;
    case 'ld-reg-reg': return `LD ${inst.dest}, ${inst.src}`;
    case 'ld-reg-imm': return `LD ${inst.dest}, ${hexByte(inst.value)}`;
    case 'ld-reg-ind': return `LD ${inst.dest}, (${inst.src})`;
    case 'ld-ind-reg': return `LD (${inst.dest}), ${inst.src}`;
    case 'ld-pair-imm': return `LD ${inst.pair}, ${hex(inst.value)}`;
    case 'ld-pair-mem': return `LD ${inst.pair}, (${hex(inst.addr)})`;
    case 'ld-mem-pair': return `LD (${hex(inst.addr)}), ${inst.pair}`;
    case 'ld-ind-imm': return `LD (${inst.dest}), ${hexByte(inst.value)}`;
    case 'ld-a-mem': return `LD A, (${hex(inst.addr)})`;
    case 'ld-mem-a': return `LD (${hex(inst.addr)}), A`;
    case 'ld-sp-hl': return 'LD SP, HL';
    case 'push': return `PUSH ${inst.pair}`;
    case 'pop': return `POP ${inst.pair}`;
    case 'add-pair': return `ADD HL, ${inst.src}`;
    case 'inc-pair': return `INC ${inst.pair}`;
    case 'dec-pair': return `DEC ${inst.pair}`;
    case 'inc-reg': return `INC ${inst.reg}`;
    case 'dec-reg': return `DEC ${inst.reg}`;
    case 'alu-reg': return `${inst.op.toUpperCase()} A, ${inst.src}`;
    case 'alu-imm': return `${inst.op.toUpperCase()} A, ${hexByte(inst.value)}`;
    case 'bit-test': return `BIT ${inst.bit}, ${inst.reg}`;
    case 'bit-set': return `SET ${inst.bit}, ${inst.reg}`;
    case 'bit-res': return `RES ${inst.bit}, ${inst.reg}`;
    case 'bit-test-ind': return `BIT ${inst.bit}, (HL)`;
    case 'bit-set-ind': return `SET ${inst.bit}, (HL)`;
    case 'bit-res-ind': return `RES ${inst.bit}, (HL)`;
    case 'ex-de-hl': return 'EX DE, HL';
    case 'ex-af': return "EX AF, AF'";
    case 'exx': return 'EXX';
    case 'di': return 'DI';
    case 'ei': return 'EI';
    case 'halt': return 'HALT';
    case 'rst': return `RST ${hexByte(inst.target)}`;
    case 'djnz': return `DJNZ ${hex(inst.target)}`;
    case 'in-a-n': return `IN A, (${hexByte(inst.port)})`;
    case 'out-n-a': return `OUT (${hexByte(inst.port)}), A`;
    case 'in-reg-c': return `IN ${inst.reg}, (C)`;
    case 'out-c-reg': return `OUT (C), ${inst.reg}`;
    case 'rotate-a': return inst.op.toUpperCase() + 'A';
    case 'rotate-reg': return `${inst.op.toUpperCase()} ${inst.reg}`;
    case 'rotate-ind': return `${inst.op.toUpperCase()} (HL)`;
    case 'scf': return 'SCF';
    case 'ccf': return 'CCF';
    case 'cpl': return 'CPL';
    case 'daa': return 'DAA';
    case 'neg': return 'NEG';
    case 'reti': return 'RETI';
    case 'retn': return 'RETN';
    case 'im': return `IM ${inst.mode}`;
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
    case 'sbc-hl-pair': return `SBC HL, ${inst.src}`;
    case 'adc-hl-pair': return `ADC HL, ${inst.src}`;
    case 'rrd': return 'RRD';
    case 'rld': return 'RLD';
    case 'ld-i-a': return 'LD I, A';
    case 'ld-a-i': return 'LD A, I';
    case 'ld-r-a': return 'LD R, A';
    case 'ld-a-r': return 'LD A, R';
    case 'indexed-ld-reg': return `LD ${inst.dest}, ${formatIndexedOperand(inst.indexRegister, inst.displacement)}`;
    case 'indexed-ld-ind': return `LD ${formatIndexedOperand(inst.indexRegister, inst.displacement)}, ${inst.src}`;
    case 'indexed-ld-imm': return `LD ${formatIndexedOperand(inst.indexRegister, inst.displacement)}, ${hexByte(inst.value)}`;
    case 'indexed-alu': return `${inst.op.toUpperCase()} A, ${formatIndexedOperand(inst.indexRegister, inst.displacement)}`;
    case 'indexed-inc': return `INC ${formatIndexedOperand(inst.indexRegister, inst.displacement)}`;
    case 'indexed-dec': return `DEC ${formatIndexedOperand(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-bit': return `BIT ${inst.bit}, ${formatIndexedOperand(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-set': return `SET ${inst.bit}, ${formatIndexedOperand(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-res': return `RES ${inst.bit}, ${formatIndexedOperand(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-rotate': return `${inst.op.toUpperCase()} ${formatIndexedOperand(inst.indexRegister, inst.displacement)}`;
    case 'indexed-pair-imm': return `LD ${inst.pair}, ${hex(inst.value)}`;
    case 'indexed-pair-mem': return `LD ${inst.pair}, (${hex(inst.addr)})`;
    case 'indexed-mem-pair': return `LD (${hex(inst.addr)}), ${inst.pair}`;
    case 'indexed-push': return `PUSH ${inst.pair}`;
    case 'indexed-pop': return `POP ${inst.pair}`;
    case 'indexed-add-pair': return `ADD ${inst.indexRegister}, ${inst.src}`;
    case 'indexed-inc-pair': return `INC ${inst.pair}`;
    case 'indexed-dec-pair': return `DEC ${inst.pair}`;
    case 'indexed-jp-ind': return `JP (${inst.indexRegister})`;
    case 'indexed-ld-sp': return `LD SP, ${inst.indexRegister}`;
    case 'indexed-ex-sp': return `EX (SP), ${inst.indexRegister}`;
    default: return `[${inst.tag}]`;
  }
}

function main() {
  const rom = fs.readFileSync(romPath);

  console.log(`=== Disassembly of ${hex(TARGET)} (type mask helper) ===\n`);

  // Step 3: Disassemble from TARGET until RET/JP/JR-unconditional or max bytes
  const instructions = [];
  let pc = TARGET;
  const endPc = TARGET + MAX_BYTES;
  let terminated = false;

  while (pc < endPc) {
    const inst = decodeInstruction(rom, pc, 'adl');
    const rawBytes = [];
    for (let i = 0; i < inst.length; i++) {
      rawBytes.push(rom[pc + i].toString(16).padStart(2, '0'));
    }
    const formatted = formatInstruction(inst);
    console.log(`${hex(pc)}  ${rawBytes.join(' ').padEnd(18)} ${formatted}`);
    instructions.push({ pc, inst, formatted });
    pc += inst.length;

    // Terminate on unconditional exit
    if (inst.tag === 'ret' || inst.tag === 'reti' || inst.tag === 'retn' ||
        inst.tag === 'jp-abs' || inst.tag === 'jp-hl' || inst.tag === 'indexed-jp-ind' ||
        inst.tag === 'jr') {
      terminated = true;
      break;
    }
  }

  const funcSize = pc - TARGET;
  console.log(`\nFunction size: ${funcSize} bytes (${hex(TARGET)} to ${hex(pc - 1)})`);
  console.log(`Terminated: ${terminated ? 'yes' : 'hit max bytes limit'}\n`);

  // Step 5: Scan for CALL references (CD E2 2B 08) and also CALL.LIL (ED 9A + 3-byte addr)
  console.log('=== CALL references (CD E2 2B 08) ===\n');
  const callers = [];
  for (let i = 0; i < rom.length - 3; i++) {
    if (rom[i] === 0xCD && rom[i + 1] === 0xE2 && rom[i + 2] === 0x2B && rom[i + 3] === 0x08) {
      callers.push({ offset: i, kind: 'CALL' });
    }
  }
  // Also check for CALL.LIL prefix (ED 9A CD ...)
  for (let i = 0; i < rom.length - 4; i++) {
    if (rom[i] === 0xED && rom[i + 1] === 0x9A &&
        rom[i + 2] === 0xE2 && rom[i + 3] === 0x2B && rom[i + 4] === 0x08) {
      callers.push({ offset: i, kind: 'CALL.LIL' });
    }
  }
  console.log(`Total references: ${callers.length}`);
  for (const c of callers) {
    console.log(`  ${hex(c.offset)}: ${c.kind} ${hex(TARGET)}`);
  }

  // Also scan for JP references (C3 E2 2B 08)
  console.log('\n=== JP references (C3 E2 2B 08) ===\n');
  const jpRefs = [];
  for (let i = 0; i < rom.length - 3; i++) {
    if (rom[i] === 0xC3 && rom[i + 1] === 0xE2 && rom[i + 2] === 0x2B && rom[i + 3] === 0x08) {
      jpRefs.push(i);
    }
  }
  console.log(`Total JP references: ${jpRefs.length}`);
  for (const addr of jpRefs) {
    console.log(`  ${hex(addr)}: JP ${hex(TARGET)}`);
  }

  // Step 6: Identify RAM addresses, port I/O, call targets
  console.log('\n=== References ===\n');

  const ramAddrs = new Set();
  const portIO = [];
  const callTargets = [];

  for (const { inst } of instructions) {
    // RAM addresses (>= 0xD00000)
    for (const prop of ['addr', 'target', 'value']) {
      const v = inst[prop];
      if (v !== undefined && v >= 0xD00000 && v < 0x1000000) {
        // Skip branch targets that are just nearby code
        if (prop === 'target' && v < 0xD00000) continue;
        ramAddrs.add(v);
      }
    }

    // Port I/O
    if (inst.tag === 'in-a-n' || inst.tag === 'out-n-a') {
      portIO.push(`${inst.tag === 'in-a-n' ? 'IN' : 'OUT'} port ${hexByte(inst.port)}`);
    }
    if (inst.tag === 'in-reg-c' || inst.tag === 'out-c-reg') {
      portIO.push(`${inst.tag.startsWith('in') ? 'IN' : 'OUT'} (C) reg=${inst.reg}`);
    }

    // Call targets
    if (inst.tag === 'call' || inst.tag === 'call-conditional') {
      callTargets.push(inst.target);
    }
  }

  console.log('RAM addresses:');
  if (ramAddrs.size === 0) {
    console.log('  none');
  } else {
    for (const addr of [...ramAddrs].sort((a, b) => a - b)) {
      console.log(`  ${hex(addr)}`);
    }
  }

  console.log('\nPort I/O:');
  console.log(portIO.length === 0 ? '  none' : portIO.map(p => `  ${p}`).join('\n'));

  console.log('\nCALL targets:');
  if (callTargets.length === 0) {
    console.log('  none (leaf function)');
  } else {
    for (const t of callTargets) {
      console.log(`  ${hex(t)}`);
    }
  }

  // Step 7: Summary
  console.log('\n=== Summary ===\n');
  console.log(`Address:        ${hex(TARGET)}`);
  console.log(`Size:           ${funcSize} bytes`);
  console.log(`Instructions:   ${instructions.length}`);
  console.log(`Caller count:   ${callers.length} CALL + ${jpRefs.length} JP = ${callers.length + jpRefs.length} total`);
  console.log(`RAM refs:       ${ramAddrs.size > 0 ? [...ramAddrs].map(a => hex(a)).join(', ') : 'none'}`);
  console.log(`Port I/O:       ${portIO.length > 0 ? portIO.join(', ') : 'none'}`);
  console.log(`Subcalls:       ${callTargets.length > 0 ? callTargets.map(t => hex(t)).join(', ') : 'none (leaf)'}`);

  // Behavioral notes
  console.log('\n=== Behavioral analysis ===\n');
  for (const { inst, formatted } of instructions) {
    if (inst.tag === 'alu-imm') {
      console.log(`  ALU immediate: ${formatted} (value=${hexByte(inst.value)})`);
    }
    if (inst.tag === 'alu-reg') {
      console.log(`  ALU register: ${formatted}`);
    }
    if (inst.tag.startsWith('bit-test') || inst.tag.startsWith('indexed-cb-bit')) {
      console.log(`  BIT test: ${formatted}`);
    }
    if (inst.tag.startsWith('rotate') || inst.tag.startsWith('indexed-cb-rotate')) {
      console.log(`  Shift/rotate: ${formatted}`);
    }
  }

  const isLeaf = callTargets.length === 0;
  const hasMemWrite = instructions.some(({ inst }) =>
    inst.tag === 'ld-ind-reg' || inst.tag === 'ld-mem-pair' || inst.tag === 'ld-mem-a' ||
    inst.tag === 'ld-ind-imm' || inst.tag === 'indexed-ld-ind' || inst.tag === 'indexed-ld-imm');
  const hasPush = instructions.some(({ inst }) => inst.tag === 'push' || inst.tag === 'indexed-push');
  const hasPop = instructions.some(({ inst }) => inst.tag === 'pop' || inst.tag === 'indexed-pop');

  console.log(`\n  Leaf function: ${isLeaf ? 'yes' : 'no'}`);
  console.log(`  Memory writes: ${hasMemWrite ? 'yes' : 'no'}`);
  console.log(`  Stack usage:   ${hasPush ? 'PUSH' : '-'} ${hasPop ? 'POP' : '-'}`);
  console.log(`  Side effects:  ${!isLeaf || hasMemWrite || portIO.length > 0 ? 'YES' : 'pure register transform'}`);
}

main();
