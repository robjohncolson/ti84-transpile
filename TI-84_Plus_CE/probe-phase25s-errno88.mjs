/**
 * probe-phase25s-errno88.mjs
 *
 * Dumps raw ROM bytes at the parser/VAT loop regions to investigate
 * how errNo=0x88 (E_Syntax) gets set during ParseInp execution.
 *
 * Regions:
 *   0x082BE2 — 64 bytes (parser/VAT loop entry)
 *   0x084711 — 48 bytes (parser bounce addresses)
 *
 * Also scans ROM for all LD (0xD008DF),A instructions (opcode 32 DF 08 D0)
 * to find every location that writes errNo.
 */

import { readFileSync } from 'fs';

const rom = readFileSync('TI-84_Plus_CE/ROM.rom');

function dump(label, start, len) {
  console.log(`\n=== ${label} at 0x${start.toString(16).padStart(6, '0')} ===`);
  for (let i = 0; i < len; i += 16) {
    const addr = start + i;
    const bytes = [];
    for (let j = 0; j < 16 && i + j < len; j++) {
      bytes.push(rom[addr + j].toString(16).padStart(2, '0'));
    }
    console.log(`  ${addr.toString(16).padStart(6, '0')}: ${bytes.join(' ')}`);
  }
}

// Dump the two regions of interest
dump('Parser/VAT loop', 0x082BE2, 64);
dump('Parser bounce addresses', 0x084711, 48);

// Also dump the longjmp/error handler region for reference
dump('Error handler (longjmp writes errNo)', 0x061DA0, 48);

// Scan entire ROM for LD (0xD008DF),A  =  opcode 32 DF 08 D0
console.log('\n=== All LD (0xD008DF),A writes to errNo in ROM ===');
for (let i = 0; i < rom.length - 3; i++) {
  if (rom[i] === 0x32 && rom[i + 1] === 0xDF && rom[i + 2] === 0x08 && rom[i + 3] === 0xD0) {
    // Show context: 8 bytes before and 8 bytes after
    const ctxStart = Math.max(0, i - 8);
    const ctxEnd = Math.min(rom.length, i + 12);
    const before = [];
    for (let j = ctxStart; j < i; j++) before.push(rom[j].toString(16).padStart(2, '0'));
    const instr = [];
    for (let j = i; j < i + 4; j++) instr.push(rom[j].toString(16).padStart(2, '0'));
    const after = [];
    for (let j = i + 4; j < ctxEnd; j++) after.push(rom[j].toString(16).padStart(2, '0'));
    console.log(`  0x${i.toString(16).padStart(6, '0')}: ${before.join(' ')} [${instr.join(' ')}] ${after.join(' ')}`);
  }
}

// Also scan for LD A,(0xD008DF) = opcode 3A DF 08 D0
console.log('\n=== All LD A,(0xD008DF) reads of errNo in ROM ===');
for (let i = 0; i < rom.length - 3; i++) {
  if (rom[i] === 0x3A && rom[i + 1] === 0xDF && rom[i + 2] === 0x08 && rom[i + 3] === 0xD0) {
    const ctxStart = Math.max(0, i - 8);
    const ctxEnd = Math.min(rom.length, i + 12);
    const before = [];
    for (let j = ctxStart; j < i; j++) before.push(rom[j].toString(16).padStart(2, '0'));
    const instr = [];
    for (let j = i; j < i + 4; j++) instr.push(rom[j].toString(16).padStart(2, '0'));
    const after = [];
    for (let j = i + 4; j < ctxEnd; j++) after.push(rom[j].toString(16).padStart(2, '0'));
    console.log(`  0x${i.toString(16).padStart(6, '0')}: ${before.join(' ')} [${instr.join(' ')}] ${after.join(' ')}`);
  }
}

console.log('\n=== Disassembly annotations (eZ80 ADL mode) ===');
console.log('Key opcodes:');
console.log('  CD xx yy zz = CALL addr (3-byte LE)');
console.log('  C3 xx yy zz = JP addr');
console.log('  C9 = RET');
console.log('  32 xx yy zz = LD (addr),A');
console.log('  3A xx yy zz = LD A,(addr)');
console.log('  FE xx = CP A,imm');
console.log('  28 xx = JR Z,offset');
console.log('  20 xx = JR NZ,offset');
console.log('  38 xx = JR C,offset');
console.log('  18 xx = JR offset');
console.log('  3E xx = LD A,imm');

// Attempt basic inline disassembly of the two regions
function disasm(label, start, len) {
  console.log(`\n=== Disassembly: ${label} ===`);
  let pc = start;
  const end = start + len;
  while (pc < end) {
    const op = rom[pc];
    let line = `  ${pc.toString(16).padStart(6, '0')}: `;
    const rawBytes = [];

    if (op === 0xC9) {
      rawBytes.push(rom[pc]);
      line += `${rawBytes.map(b => b.toString(16).padStart(2,'0')).join(' ').padEnd(16)} RET`;
      pc += 1;
    } else if (op === 0xC3 && pc + 3 < end) {
      for (let j = 0; j < 4; j++) rawBytes.push(rom[pc + j]);
      const addr = rom[pc+1] | (rom[pc+2] << 8) | (rom[pc+3] << 16);
      line += `${rawBytes.map(b => b.toString(16).padStart(2,'0')).join(' ').padEnd(16)} JP 0x${addr.toString(16).padStart(6,'0')}`;
      pc += 4;
    } else if (op === 0xCD && pc + 3 < end) {
      for (let j = 0; j < 4; j++) rawBytes.push(rom[pc + j]);
      const addr = rom[pc+1] | (rom[pc+2] << 8) | (rom[pc+3] << 16);
      line += `${rawBytes.map(b => b.toString(16).padStart(2,'0')).join(' ').padEnd(16)} CALL 0x${addr.toString(16).padStart(6,'0')}`;
      pc += 4;
    } else if (op === 0x32 && pc + 3 < end) {
      for (let j = 0; j < 4; j++) rawBytes.push(rom[pc + j]);
      const addr = rom[pc+1] | (rom[pc+2] << 8) | (rom[pc+3] << 16);
      line += `${rawBytes.map(b => b.toString(16).padStart(2,'0')).join(' ').padEnd(16)} LD (0x${addr.toString(16).padStart(6,'0')}),A`;
      pc += 4;
    } else if (op === 0x3A && pc + 3 < end) {
      for (let j = 0; j < 4; j++) rawBytes.push(rom[pc + j]);
      const addr = rom[pc+1] | (rom[pc+2] << 8) | (rom[pc+3] << 16);
      line += `${rawBytes.map(b => b.toString(16).padStart(2,'0')).join(' ').padEnd(16)} LD A,(0x${addr.toString(16).padStart(6,'0')})`;
      pc += 4;
    } else if (op === 0x3E) {
      rawBytes.push(rom[pc], rom[pc+1]);
      line += `${rawBytes.map(b => b.toString(16).padStart(2,'0')).join(' ').padEnd(16)} LD A,0x${rom[pc+1].toString(16).padStart(2,'0')}`;
      pc += 2;
    } else if (op === 0xFE) {
      rawBytes.push(rom[pc], rom[pc+1]);
      line += `${rawBytes.map(b => b.toString(16).padStart(2,'0')).join(' ').padEnd(16)} CP A,0x${rom[pc+1].toString(16).padStart(2,'0')}`;
      pc += 2;
    } else if (op === 0x28) {
      rawBytes.push(rom[pc], rom[pc+1]);
      const off = rom[pc+1] < 128 ? rom[pc+1] : rom[pc+1] - 256;
      const target = pc + 2 + off;
      line += `${rawBytes.map(b => b.toString(16).padStart(2,'0')).join(' ').padEnd(16)} JR Z,0x${target.toString(16).padStart(6,'0')}`;
      pc += 2;
    } else if (op === 0x20) {
      rawBytes.push(rom[pc], rom[pc+1]);
      const off = rom[pc+1] < 128 ? rom[pc+1] : rom[pc+1] - 256;
      const target = pc + 2 + off;
      line += `${rawBytes.map(b => b.toString(16).padStart(2,'0')).join(' ').padEnd(16)} JR NZ,0x${target.toString(16).padStart(6,'0')}`;
      pc += 2;
    } else if (op === 0x38) {
      rawBytes.push(rom[pc], rom[pc+1]);
      const off = rom[pc+1] < 128 ? rom[pc+1] : rom[pc+1] - 256;
      const target = pc + 2 + off;
      line += `${rawBytes.map(b => b.toString(16).padStart(2,'0')).join(' ').padEnd(16)} JR C,0x${target.toString(16).padStart(6,'0')}`;
      pc += 2;
    } else if (op === 0x18) {
      rawBytes.push(rom[pc], rom[pc+1]);
      const off = rom[pc+1] < 128 ? rom[pc+1] : rom[pc+1] - 256;
      const target = pc + 2 + off;
      line += `${rawBytes.map(b => b.toString(16).padStart(2,'0')).join(' ').padEnd(16)} JR 0x${target.toString(16).padStart(6,'0')}`;
      pc += 2;
    } else if (op === 0xAF) {
      rawBytes.push(rom[pc]);
      line += `${rawBytes.map(b => b.toString(16).padStart(2,'0')).join(' ').padEnd(16)} XOR A`;
      pc += 1;
    } else if (op === 0xB7) {
      rawBytes.push(rom[pc]);
      line += `${rawBytes.map(b => b.toString(16).padStart(2,'0')).join(' ').padEnd(16)} OR A`;
      pc += 1;
    } else if (op === 0xE5) {
      rawBytes.push(rom[pc]);
      line += `${rawBytes.map(b => b.toString(16).padStart(2,'0')).join(' ').padEnd(16)} PUSH HL`;
      pc += 1;
    } else if (op === 0xE1) {
      rawBytes.push(rom[pc]);
      line += `${rawBytes.map(b => b.toString(16).padStart(2,'0')).join(' ').padEnd(16)} POP HL`;
      pc += 1;
    } else if (op === 0xC5) {
      rawBytes.push(rom[pc]);
      line += `${rawBytes.map(b => b.toString(16).padStart(2,'0')).join(' ').padEnd(16)} PUSH BC`;
      pc += 1;
    } else if (op === 0xC1) {
      rawBytes.push(rom[pc]);
      line += `${rawBytes.map(b => b.toString(16).padStart(2,'0')).join(' ').padEnd(16)} POP BC`;
      pc += 1;
    } else if (op === 0xD5) {
      rawBytes.push(rom[pc]);
      line += `${rawBytes.map(b => b.toString(16).padStart(2,'0')).join(' ').padEnd(16)} PUSH DE`;
      pc += 1;
    } else if (op === 0xD1) {
      rawBytes.push(rom[pc]);
      line += `${rawBytes.map(b => b.toString(16).padStart(2,'0')).join(' ').padEnd(16)} POP DE`;
      pc += 1;
    } else if (op === 0xF5) {
      rawBytes.push(rom[pc]);
      line += `${rawBytes.map(b => b.toString(16).padStart(2,'0')).join(' ').padEnd(16)} PUSH AF`;
      pc += 1;
    } else if (op === 0xF1) {
      rawBytes.push(rom[pc]);
      line += `${rawBytes.map(b => b.toString(16).padStart(2,'0')).join(' ').padEnd(16)} POP AF`;
      pc += 1;
    } else if (op === 0x21 && pc + 3 < end) {
      for (let j = 0; j < 4; j++) rawBytes.push(rom[pc + j]);
      const val = rom[pc+1] | (rom[pc+2] << 8) | (rom[pc+3] << 16);
      line += `${rawBytes.map(b => b.toString(16).padStart(2,'0')).join(' ').padEnd(16)} LD HL,0x${val.toString(16).padStart(6,'0')}`;
      pc += 4;
    } else if (op === 0x11 && pc + 3 < end) {
      for (let j = 0; j < 4; j++) rawBytes.push(rom[pc + j]);
      const val = rom[pc+1] | (rom[pc+2] << 8) | (rom[pc+3] << 16);
      line += `${rawBytes.map(b => b.toString(16).padStart(2,'0')).join(' ').padEnd(16)} LD DE,0x${val.toString(16).padStart(6,'0')}`;
      pc += 4;
    } else if (op === 0x01 && pc + 3 < end) {
      for (let j = 0; j < 4; j++) rawBytes.push(rom[pc + j]);
      const val = rom[pc+1] | (rom[pc+2] << 8) | (rom[pc+3] << 16);
      line += `${rawBytes.map(b => b.toString(16).padStart(2,'0')).join(' ').padEnd(16)} LD BC,0x${val.toString(16).padStart(6,'0')}`;
      pc += 4;
    } else if (op === 0xED) {
      // ED-prefixed opcodes
      const op2 = rom[pc + 1];
      if (op2 === 0xB0) {
        rawBytes.push(rom[pc], rom[pc+1]);
        line += `${rawBytes.map(b => b.toString(16).padStart(2,'0')).join(' ').padEnd(16)} LDIR`;
        pc += 2;
      } else if (op2 === 0xB8) {
        rawBytes.push(rom[pc], rom[pc+1]);
        line += `${rawBytes.map(b => b.toString(16).padStart(2,'0')).join(' ').padEnd(16)} LDDR`;
        pc += 2;
      } else {
        rawBytes.push(rom[pc]);
        line += `${rawBytes.map(b => b.toString(16).padStart(2,'0')).join(' ').padEnd(16)} DB 0x${op.toString(16).padStart(2,'0')}`;
        pc += 1;
      }
    } else if (op === 0xCB) {
      rawBytes.push(rom[pc], rom[pc+1]);
      line += `${rawBytes.map(b => b.toString(16).padStart(2,'0')).join(' ').padEnd(16)} CB prefix 0x${rom[pc+1].toString(16).padStart(2,'0')}`;
      pc += 2;
    } else if (op === 0x77) {
      rawBytes.push(rom[pc]);
      line += `${rawBytes.map(b => b.toString(16).padStart(2,'0')).join(' ').padEnd(16)} LD (HL),A`;
      pc += 1;
    } else if (op === 0x7E) {
      rawBytes.push(rom[pc]);
      line += `${rawBytes.map(b => b.toString(16).padStart(2,'0')).join(' ').padEnd(16)} LD A,(HL)`;
      pc += 1;
    } else if (op === 0x23) {
      rawBytes.push(rom[pc]);
      line += `${rawBytes.map(b => b.toString(16).padStart(2,'0')).join(' ').padEnd(16)} INC HL`;
      pc += 1;
    } else if (op === 0x2B) {
      rawBytes.push(rom[pc]);
      line += `${rawBytes.map(b => b.toString(16).padStart(2,'0')).join(' ').padEnd(16)} DEC HL`;
      pc += 1;
    } else if (op === 0x3C) {
      rawBytes.push(rom[pc]);
      line += `${rawBytes.map(b => b.toString(16).padStart(2,'0')).join(' ').padEnd(16)} INC A`;
      pc += 1;
    } else if (op === 0x3D) {
      rawBytes.push(rom[pc]);
      line += `${rawBytes.map(b => b.toString(16).padStart(2,'0')).join(' ').padEnd(16)} DEC A`;
      pc += 1;
    } else if (op === 0xC0) {
      rawBytes.push(rom[pc]);
      line += `${rawBytes.map(b => b.toString(16).padStart(2,'0')).join(' ').padEnd(16)} RET NZ`;
      pc += 1;
    } else if (op === 0xC8) {
      rawBytes.push(rom[pc]);
      line += `${rawBytes.map(b => b.toString(16).padStart(2,'0')).join(' ').padEnd(16)} RET Z`;
      pc += 1;
    } else if (op === 0xD0) {
      rawBytes.push(rom[pc]);
      line += `${rawBytes.map(b => b.toString(16).padStart(2,'0')).join(' ').padEnd(16)} RET NC`;
      pc += 1;
    } else if (op === 0xD8) {
      rawBytes.push(rom[pc]);
      line += `${rawBytes.map(b => b.toString(16).padStart(2,'0')).join(' ').padEnd(16)} RET C`;
      pc += 1;
    } else {
      rawBytes.push(rom[pc]);
      line += `${rawBytes.map(b => b.toString(16).padStart(2,'0')).join(' ').padEnd(16)} DB 0x${op.toString(16).padStart(2,'0')}`;
      pc += 1;
    }
    console.log(line);
  }
}

disasm('Parser/VAT loop', 0x082BE2, 64);
disasm('Parser bounce addresses', 0x084711, 48);
disasm('Error handler (longjmp)', 0x061DA0, 48);

console.log('\nDone.');
