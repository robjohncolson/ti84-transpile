import fs from 'fs';

const rom = fs.readFileSync('./TI-84_Plus_CE/ROM.rom');

function hex(n, width = 2) {
  return n.toString(16).toUpperCase().padStart(width, '0');
}

function addr(n) {
  return `0x${hex(n, 6)}`;
}

function hexDump(start, end, label) {
  console.log(`\n=== HEX DUMP ${label} (0x${start.toString(16)}-0x${(end - 1).toString(16)}) ===`);
  for (let a = start; a < end; a += 16) {
    const bytes = [];
    for (let i = 0; i < 16 && a + i < end; i++) {
      bytes.push(rom[a + i].toString(16).padStart(2, '0'));
    }
    console.log(`${a.toString(16).padStart(6, '0')}: ${bytes.join(' ')}`);
  }
}

function b(a) {
  return rom[a];
}

function w(a) {
  return rom[a] | (rom[a + 1] << 8);
}

function t(a) {
  return rom[a] | (rom[a + 1] << 8) | (rom[a + 2] << 16);
}

function signed8(v) {
  return v < 0x80 ? v : v - 0x100;
}

function jrTarget(pc) {
  return (pc + 2 + signed8(b(pc + 1))) & 0xFFFFFF;
}

function dbLine(pc) {
  return [1, `DB ${hex(b(pc))}`];
}

function decodeEz80(pc) {
  const op = b(pc);
  const op1 = b(pc + 1);
  const op2 = b(pc + 2);
  const op3 = b(pc + 3);

  if (op === 0x00) return [1, 'NOP'];
  if (op === 0x01) return [3, `LD BC,0x${hex(w(pc + 1), 4)}`];
  if (op === 0x03) return [1, 'INC BC'];
  if (op === 0x06) return [2, `LD B,0x${hex(op1)}`];
  if (op === 0x08) return [1, "EX AF,AF'"];
  if (op === 0x09) return [1, 'ADD HL,BC'];
  if (op === 0x0A) return [1, 'LD A,(BC)'];
  if (op === 0x0C) return [1, 'INC C'];
  if (op === 0x0D) return [1, 'DEC C'];
  if (op === 0x0E) return [2, `LD C,0x${hex(op1)}`];
  if (op === 0x11) return [3, `LD DE,0x${hex(w(pc + 1), 4)}`];
  if (op === 0x13) return [1, 'INC DE'];
  if (op === 0x16) return [2, `LD D,0x${hex(op1)}`];
  if (op === 0x18) return [2, `JR ${addr(jrTarget(pc))}`];
  if (op === 0x19) return [1, 'ADD HL,DE'];
  if (op === 0x1A) return [1, 'LD A,(DE)'];
  if (op === 0x1B) return [1, 'DEC DE'];
  if (op === 0x1E) return [2, `LD E,0x${hex(op1)}`];
  if (op === 0x20) return [2, `JR NZ,${addr(jrTarget(pc))}`];
  if (op === 0x21) return [3, `LD HL,0x${hex(w(pc + 1), 4)}`];
  if (op === 0x22) return [4, `LD (${addr(t(pc + 1))}),HL`];
  if (op === 0x23) return [1, 'INC HL'];
  if (op === 0x24) return [1, 'INC H'];
  if (op === 0x26) return [2, `LD H,0x${hex(op1)}`];
  if (op === 0x28) return [2, `JR Z,${addr(jrTarget(pc))}`];
  if (op === 0x2A) return [4, `LD HL,(${addr(t(pc + 1))})`];
  if (op === 0x2B) return [1, 'DEC HL'];
  if (op === 0x2E) return [2, `LD L,0x${hex(op1)}`];
  if (op === 0x30) return [2, `JR NC,${addr(jrTarget(pc))}`];
  if (op === 0x31) return [4, `LD SP,${addr(t(pc + 1))}`];
  if (op === 0x32) return [4, `LD (${addr(t(pc + 1))}),A`];
  if (op === 0x34) return [1, 'INC (HL)'];
  if (op === 0x36) return [2, `LD (HL),0x${hex(op1)}`];
  if (op === 0x38) return [2, `JR C,${addr(jrTarget(pc))}`];
  if (op === 0x3A) return [4, `LD A,(${addr(t(pc + 1))})`];
  if (op === 0x3C) return [1, 'INC A'];
  if (op === 0x3D) return [1, 'DEC A'];
  if (op === 0x3E) return [2, `LD A,0x${hex(op1)}`];
  if (op >= 0x40 && op <= 0x7F) {
    const regs = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
    if (op === 0x76) return [1, 'HALT'];
    return [1, `LD ${regs[(op >> 3) & 7]},${regs[op & 7]}`];
  }
  if (op >= 0x80 && op <= 0x87) return [1, `ADD A,${['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'][op & 7]}`];
  if (op >= 0x90 && op <= 0x97) return [1, `SUB ${['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'][op & 7]}`];
  if (op === 0xA7) return [1, 'AND A'];
  if (op === 0xAF) return [1, 'XOR A'];
  if (op === 0xB0) return [1, 'OR B'];
  if (op === 0xB1) return [1, 'OR C'];
  if (op === 0xB7) return [1, 'OR A'];
  if (op === 0xC0) return [1, 'RET NZ'];
  if (op === 0xC1) return [1, 'POP BC'];
  if (op === 0xC3) return [4, `JP ${addr(t(pc + 1))}`];
  if (op === 0xC5) return [1, 'PUSH BC'];
  if (op === 0xC8) return [1, 'RET Z'];
  if (op === 0xC9) return [1, 'RET'];
  if (op === 0xCD) return [4, `CALL ${addr(t(pc + 1))}`];
  if (op === 0xD0) return [1, 'RET NC'];
  if (op === 0xD1) return [1, 'POP DE'];
  if (op === 0xD3) return [2, `OUT (0x${hex(op1)}),A`];
  if (op === 0xD5) return [1, 'PUSH DE'];
  if (op === 0xD6) return [2, `SUB 0x${hex(op1)}`];
  if (op === 0xD8) return [1, 'RET C'];
  if (op === 0xDB) return [2, `IN A,(0x${hex(op1)})`];
  if (op === 0xE1) return [1, 'POP HL'];
  if (op === 0xE5) return [1, 'PUSH HL'];
  if (op === 0xE6) return [2, `AND 0x${hex(op1)}`];
  if (op === 0xE9) return [1, 'JP (HL)'];
  if (op === 0xEB) return [1, 'EX DE,HL'];
  if (op === 0xED) {
    if (op1 === 0x4B) return [5, `LD BC,(${addr(t(pc + 2))})`];
    if (op1 === 0x53) return [5, `LD (${addr(t(pc + 2))}),DE`];
    if (op1 === 0x5B) return [5, `LD DE,(${addr(t(pc + 2))})`];
    if (op1 === 0x73) return [5, `LD (${addr(t(pc + 2))}),SP`];
    if (op1 === 0x7B) return [5, `LD SP,(${addr(t(pc + 2))})`];
    if (op1 === 0xB0) return [2, 'LDIR'];
    if (op1 === 0xB8) return [2, 'LDDR'];
    return [2, `ED ${hex(op1)}`];
  }
  if (op === 0xF1) return [1, 'POP AF'];
  if (op === 0xF5) return [1, 'PUSH AF'];
  if (op === 0xF6) return [2, `OR 0x${hex(op1)}`];
  if (op === 0xF9) return [1, 'LD SP,HL'];
  if (op === 0xFA) return [4, `JP M,${addr(t(pc + 1))}`];
  if (op === 0xFE) return [2, `CP 0x${hex(op1)}`];
  if (op === 0xDD) {
    if (op1 === 0x21) return [4, `LD IX,0x${hex(w(pc + 2), 4)}`];
    if (op1 === 0x2A) return [5, `LD IX,(${addr(t(pc + 2))})`];
    if (op1 === 0x22) return [5, `LD (${addr(t(pc + 2))}),IX`];
    if (op1 === 0xE1) return [2, 'POP IX'];
    if (op1 === 0xE5) return [2, 'PUSH IX'];
    return [2, `DD ${hex(op1)}`];
  }
  if (op === 0xFD) {
    if (op1 === 0x21) return [4, `LD IY,0x${hex(w(pc + 2), 4)}`];
    if (op1 === 0x2A) return [5, `LD IY,(${addr(t(pc + 2))})`];
    if (op1 === 0x22) return [5, `LD (${addr(t(pc + 2))}),IY`];
    if (op1 === 0xE1) return [2, 'POP IY'];
    if (op1 === 0xE5) return [2, 'PUSH IY'];
    return [2, `FD ${hex(op1)}`];
  }

  return dbLine(pc);
}

function disassembleRange(start, end, annotations = {}) {
  for (let pc = start; pc < end;) {
    if (annotations[pc]) {
      console.log(annotations[pc]);
    }
    const [len, text] = decodeEz80(pc);
    const bytes = [];
    for (let i = 0; i < len && pc + i < end; i++) {
      bytes.push(hex(b(pc + i)));
    }
    console.log(`${hex(pc, 6)}: ${bytes.join(' ').padEnd(15)} ${text}`);
    pc += len;
  }
}

function scanBytePattern(pattern, label) {
  let count = 0;
  for (let i = 0; i <= rom.length - pattern.length; i++) {
    let ok = true;
    for (let j = 0; j < pattern.length; j++) {
      if (pattern[j] !== null && rom[i + j] !== pattern[j]) {
        ok = false;
        break;
      }
    }
    if (ok) {
      console.log(`  ${label} at ${addr(i)}`);
      count++;
    }
  }
  console.log(`  Total ${label}: ${count}`);
}

function xrefScan(target, label) {
  const b0 = target & 0xFF;
  const b1 = (target >> 8) & 0xFF;
  const b2 = (target >> 16) & 0xFF;
  let count = 0;
  for (let i = 0; i < rom.length - 2; i++) {
    if (rom[i] === b0 && rom[i + 1] === b1 && rom[i + 2] === b2) {
      if (i > 0 && (rom[i - 1] === 0xCD || rom[i - 1] === 0xC3)) {
        const kind = rom[i - 1] === 0xCD ? 'CALL' : 'JP';
        console.log(`  ${label} ${kind} ref at ${addr(i - 1)}`);
        count++;
      } else {
        console.log(`  ${label} raw immediate at ${addr(i)}`);
      }
    }
  }
  console.log(`  Total ${label} CALL/JP xrefs: ${count}`);
}

function ramXrefScan(target, label) {
  const b0 = target & 0xFF;
  const b1 = (target >> 8) & 0xFF;
  const b2 = (target >> 16) & 0xFF;
  let count = 0;
  for (let i = 0; i < rom.length - 4; i++) {
    if (rom[i + 2] === b0 && rom[i + 3] === b1 && rom[i + 4] === b2) {
      if (rom[i] === 0xED && (rom[i + 1] === 0x73 || rom[i + 1] === 0x7B || rom[i + 1] === 0x4B || rom[i + 1] === 0x53 || rom[i + 1] === 0x5B)) {
        console.log(`  ${label} ${decodeEz80(i)[1]} at ${addr(i)}`);
        count++;
      }
    }
    if (rom[i + 1] === b0 && rom[i + 2] === b1 && rom[i + 3] === b2) {
      if (rom[i] === 0x22 || rom[i] === 0x2A || rom[i] === 0x32 || rom[i] === 0x3A) {
        console.log(`  ${label} ${decodeEz80(i)[1]} at ${addr(i)}`);
        count++;
      }
    }
  }
  console.log(`  Total decoded ${label} data xrefs: ${count}`);
}

hexDump(0x061DEF, 0x061E60, '0x061DEF-0x061E5F setjmp/longjmp');
hexDump(0x03E29B, 0x03E2CE, '0x03E29B-0x03E2CD error recovery caller');

console.log('\n=== DISASSEMBLY 0x061DEF (setjmp-style frame setup) ===');
disassembleRange(0x061DEF, 0x061E20, {
  0x061DEF: '; function boundary: 0x061DEF entry',
});

console.log('\n=== DISASSEMBLY 0x061E20 (longjmp-style teardown) ===');
disassembleRange(0x061E20, 0x061E60, {
  0x061E20: '; function boundary: 0x061E20 entry',
});

console.log('\n=== DISASSEMBLY 0x03E29B (error recovery caller) ===');
disassembleRange(0x03E29B, 0x03E2CE, {
  0x03E29B: '; caller boundary: 0x03E29B entry',
});

console.log('\n=== SETJMP/LONGJMP PATTERN SCANS IN DUMPED REGION ===');
for (const pc of [0x061DEF, 0x061E20]) {
  const end = pc === 0x061DEF ? 0x061E20 : 0x061E60;
  console.log(`\n${addr(pc)}-${addr(end - 1)}`);
  for (let a = pc; a < end;) {
    const [len, text] = decodeEz80(a);
    if (
      text.includes('SP') ||
      text.includes('PUSH') ||
      text.includes('POP') ||
      text.includes('IX') ||
      text.includes('IY') ||
      text.includes('D008E0') ||
      text.includes('D007E0')
    ) {
      console.log(`  ${addr(a)} ${text}`);
    }
    a += len;
  }
}

console.log('\n=== INTERPRETATION CHECKLIST ===');
console.log('  Function boundaries to confirm from RET/JP terminators printed above:');
console.log('    setjmp candidate: 0x061DEF through the instruction immediately before 0x061E20');
console.log('    longjmp candidate: 0x061E20 through the first terminating RET/JP in the 0x061E20-0x061E5F window');
console.log('  jmp_buf check: look for ED 73 E0 08 D0 / ED 7B E0 08 D0 and adjacent stores/loads to D008E0+N.');
console.log('  Calling convention check: compare PUSH/POP pairs for AF, BC, DE, HL, IX, IY in each function.');

console.log('\n=== FULL ROM XREF SCANS ===');
xrefScan(0x061DEF, 'setjmp 0x061DEF');
xrefScan(0x061E20, 'longjmp 0x061E20');
xrefScan(0x03E29B, 'caller 0x03E29B');

console.log('\n=== RAM DATA XREF SCANS ===');
ramXrefScan(0xD008E0, 'D008E0 saved SP');
ramXrefScan(0xD008E3, 'D008E3 possible jmp_buf+3');
ramXrefScan(0xD008E6, 'D008E6 possible jmp_buf+6');
ramXrefScan(0xD007E0, 'D007E0 calculator mode');

console.log('\n=== RAW OPCODE PATTERN SCANS ===');
scanBytePattern([0xED, 0x73, 0xE0, 0x08, 0xD0], 'LD (D008E0),SP');
scanBytePattern([0xED, 0x7B, 0xE0, 0x08, 0xD0], 'LD SP,(D008E0)');
scanBytePattern([0xF9], 'LD SP,HL');
scanBytePattern([0xDD, 0xE1], 'POP IX');
scanBytePattern([0xFD, 0xE1], 'POP IY');
