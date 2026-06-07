import fs from 'fs';

const TARGET = 0x0801B9;
const WINDOW = 150;
const rom = fs.readFileSync('TI-84_Plus_CE/ROM.rom');

const hex2 = (n) => n.toString(16).toUpperCase().padStart(2, '0');
const hex4 = (n) => n.toString(16).toUpperCase().padStart(4, '0');
const hex6 = (n) => n.toString(16).toUpperCase().padStart(6, '0');
const signed8 = (n) => (n & 0x80 ? n - 0x100 : n);
const inRange = (addr, count = 1) => addr >= 0 && addr + count <= rom.length;

function read24(addr) {
  return rom[addr] | (rom[addr + 1] << 8) | (rom[addr + 2] << 16);
}

function bytesAt(addr, count) {
  const out = [];
  for (let i = 0; i < count && inRange(addr + i); i++) out.push(hex2(rom[addr + i]));
  return out.join(' ');
}

function relTarget(addr, disp, size) {
  return (addr + size + signed8(disp)) & 0xFFFFFF;
}

function idxName(prefix) {
  return prefix === 0xDD ? 'IX' : 'IY';
}

function decodeCB(op) {
  const bit = (op >> 3) & 7;
  const reg = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'][op & 7];
  if (op >= 0x40 && op <= 0x7F) return `BIT ${bit},${reg}`;
  if (op >= 0x80 && op <= 0xBF) return `RES ${bit},${reg}`;
  if (op >= 0xC0) return `SET ${bit},${reg}`;
  return `CB ${hex2(op)}`;
}

function decodeIndexed(prefix, addr) {
  const p = idxName(prefix);
  const op = rom[addr + 1];

  if (op === 0xCB) {
    const d = rom[addr + 2];
    const cb = rom[addr + 3];
    const bit = (cb >> 3) & 7;
    const kind = cb >= 0xC0 ? 'SET' : cb >= 0x80 ? 'RES' : cb >= 0x40 ? 'BIT' : 'CB';
    const suffix = cb & 7;
    const dest = suffix === 6 ? '' : `,${['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'][suffix]}`;
    const operand = `(${p}${signed8(d) < 0 ? '' : '+'}${signed8(d)})`;
    if (kind === 'CB') return { size: 4, text: `CB ${hex2(cb)} ${operand}${dest}` };
    return { size: 4, text: `${kind} ${bit},${operand}${dest}` };
  }

  const d = rom[addr + 2];
  const operand = `(${p}${signed8(d) < 0 ? '' : '+'}${signed8(d)})`;
  const regByLoad = {
    0x46: 'B', 0x4E: 'C', 0x56: 'D', 0x5E: 'E', 0x66: 'H', 0x6E: 'L', 0x7E: 'A',
    0x70: 'B', 0x71: 'C', 0x72: 'D', 0x73: 'E', 0x74: 'H', 0x75: 'L', 0x77: 'A',
  };

  if (op in regByLoad) {
    if (op < 0x70) return { size: 3, text: `LD ${regByLoad[op]},${operand}` };
    return { size: 3, text: `LD ${operand},${regByLoad[op]}` };
  }

  switch (op) {
    case 0x21: return { size: 4, text: `LD ${p},$${hex4(rom[addr + 2] | (rom[addr + 3] << 8))}` };
    case 0x22: return { size: 5, text: `LD ($${hex6(read24(addr + 2))}),${p}` };
    case 0x2A: return { size: 5, text: `LD ${p},($${hex6(read24(addr + 2))})` };
    case 0x23: return { size: 2, text: `INC ${p}` };
    case 0x2B: return { size: 2, text: `DEC ${p}` };
    case 0x34: return { size: 3, text: `INC ${operand}` };
    case 0x35: return { size: 3, text: `DEC ${operand}` };
    case 0x36: return { size: 4, text: `LD ${operand},$${hex2(rom[addr + 3])}` };
    case 0x7C: return { size: 2, text: `LD A,${p}H` };
    case 0x7D: return { size: 2, text: `LD A,${p}L` };
    case 0x84: return { size: 2, text: `ADD A,${p}H` };
    case 0x85: return { size: 2, text: `ADD A,${p}L` };
    case 0x86: return { size: 3, text: `ADD A,${operand}` };
    case 0x8E: return { size: 3, text: `ADC A,${operand}` };
    case 0x96: return { size: 3, text: `SUB ${operand}` };
    case 0xA6: return { size: 3, text: `AND ${operand}` };
    case 0xAE: return { size: 3, text: `XOR ${operand}` };
    case 0xB6: return { size: 3, text: `OR ${operand}` };
    case 0xBE: return { size: 3, text: `CP ${operand}` };
    case 0xE1: return { size: 2, text: `POP ${p}` };
    case 0xE3: return { size: 2, text: `EX (SP),${p}` };
    case 0xE5: return { size: 2, text: `PUSH ${p}` };
    case 0xE9: return { size: 2, text: `JP (${p})` };
    case 0xF9: return { size: 2, text: `LD SP,${p}` };
    default: return { size: 2, text: `${p} prefix opcode $${hex2(op)}` };
  }
}

function decodeED(addr) {
  const op = rom[addr + 1];
  const m = {
    0x44: 'NEG', 0x45: 'RETN', 0x4D: 'RETI', 0x57: 'LD A,I', 0x5F: 'LD A,R',
    0x67: 'RRD', 0x6F: 'RLD', 0xA0: 'LDI', 0xA1: 'CPI', 0xA8: 'LDD',
    0xA9: 'CPD', 0xB0: 'LDIR', 0xB1: 'CPIR', 0xB8: 'LDDR', 0xB9: 'CPDR',
  };
  if (m[op]) return { size: 2, text: m[op] };
  return { size: 2, text: `ED ${hex2(op)}` };
}

function decode(addr) {
  const op = rom[addr];
  const r = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
  const rp = ['BC', 'DE', 'HL', 'SP'];
  const cc = ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'];

  if (op === 0xDD || op === 0xFD) return decodeIndexed(op, addr);
  if (op === 0xED) return decodeED(addr);
  if (op === 0xCB) return { size: 2, text: decodeCB(rom[addr + 1]) };
  if (op === 0x40) return { size: 1, text: 'SIS prefix / short-mode prefix' };
  if (op >= 0x40 && op <= 0x7F) return { size: 1, text: op === 0x76 ? 'HALT' : `LD ${r[(op >> 3) & 7]},${r[op & 7]}` };
  if ((op & 0xC7) === 0x04) return { size: 1, text: `INC ${r[(op >> 3) & 7]}` };
  if ((op & 0xC7) === 0x05) return { size: 1, text: `DEC ${r[(op >> 3) & 7]}` };
  if ((op & 0xC7) === 0x06) return { size: 2, text: `LD ${r[(op >> 3) & 7]},$${hex2(rom[addr + 1])}` };
  if (op >= 0x80 && op <= 0xBF) {
    const alu = ['ADD A', 'ADC A', 'SUB', 'SBC A', 'AND', 'XOR', 'OR', 'CP'][(op >> 3) & 7];
    return { size: 1, text: `${alu},${r[op & 7]}`.replace('SUB,', 'SUB ') };
  }
  if ((op & 0xCF) === 0x01) return { size: 4, text: `LD ${rp[(op >> 4) & 3]},$${hex6(read24(addr + 1))}` };
  if ((op & 0xCF) === 0x03) return { size: 1, text: `INC ${rp[(op >> 4) & 3]}` };
  if ((op & 0xCF) === 0x0B) return { size: 1, text: `DEC ${rp[(op >> 4) & 3]}` };
  if ((op & 0xCF) === 0x09) return { size: 1, text: `ADD HL,${rp[(op >> 4) & 3]}` };
  if ((op & 0xC7) === 0xC0) return { size: 1, text: `RET ${cc[(op >> 3) & 7]}` };
  if ((op & 0xC7) === 0xC2) return { size: 4, text: `JP ${cc[(op >> 3) & 7]},$${hex6(read24(addr + 1))}` };
  if ((op & 0xC7) === 0xC4) return { size: 4, text: `CALL ${cc[(op >> 3) & 7]},$${hex6(read24(addr + 1))}` };
  if ((op & 0xC7) === 0xC7) return { size: 1, text: `RST $${hex2(op & 0x38)}` };

  switch (op) {
    case 0x00: return { size: 1, text: 'NOP' };
    case 0x02: return { size: 1, text: 'LD (BC),A' };
    case 0x07: return { size: 1, text: 'RLCA' };
    case 0x08: return { size: 1, text: 'EX AF,AF\'' };
    case 0x0A: return { size: 1, text: 'LD A,(BC)' };
    case 0x0F: return { size: 1, text: 'RRCA' };
    case 0x10: return { size: 2, text: `DJNZ $${hex6(relTarget(addr, rom[addr + 1], 2))}` };
    case 0x12: return { size: 1, text: 'LD (DE),A' };
    case 0x17: return { size: 1, text: 'RLA' };
    case 0x18: return { size: 2, text: `JR $${hex6(relTarget(addr, rom[addr + 1], 2))}` };
    case 0x1A: return { size: 1, text: 'LD A,(DE)' };
    case 0x1F: return { size: 1, text: 'RRA' };
    case 0x20: case 0x28: case 0x30: case 0x38:
      return { size: 2, text: `JR ${['NZ', 'Z', 'NC', 'C'][(op - 0x20) >> 3]},$${hex6(relTarget(addr, rom[addr + 1], 2))}` };
    case 0x22: return { size: 4, text: `LD ($${hex6(read24(addr + 1))}),HL` };
    case 0x27: return { size: 1, text: 'DAA' };
    case 0x2A: return { size: 4, text: `LD HL,($${hex6(read24(addr + 1))})` };
    case 0x2F: return { size: 1, text: 'CPL' };
    case 0x32: return { size: 4, text: `LD ($${hex6(read24(addr + 1))}),A` };
    case 0x37: return { size: 1, text: 'SCF' };
    case 0x3A: return { size: 4, text: `LD A,($${hex6(read24(addr + 1))})` };
    case 0x3F: return { size: 1, text: 'CCF' };
    case 0xC1: return { size: 1, text: 'POP BC' };
    case 0xC3: return { size: 4, text: `JP $${hex6(read24(addr + 1))}` };
    case 0xC5: return { size: 1, text: 'PUSH BC' };
    case 0xC6: return { size: 2, text: `ADD A,$${hex2(rom[addr + 1])}` };
    case 0xC9: return { size: 1, text: 'RET' };
    case 0xCD: return { size: 4, text: `CALL $${hex6(read24(addr + 1))}` };
    case 0xCE: return { size: 2, text: `ADC A,$${hex2(rom[addr + 1])}` };
    case 0xD1: return { size: 1, text: 'POP DE' };
    case 0xD3: return { size: 2, text: `OUT ($${hex2(rom[addr + 1])}),A` };
    case 0xD5: return { size: 1, text: 'PUSH DE' };
    case 0xD6: return { size: 2, text: `SUB $${hex2(rom[addr + 1])}` };
    case 0xD9: return { size: 1, text: 'EXX' };
    case 0xDB: return { size: 2, text: `IN A,($${hex2(rom[addr + 1])})` };
    case 0xDE: return { size: 2, text: `SBC A,$${hex2(rom[addr + 1])}` };
    case 0xE1: return { size: 1, text: 'POP HL' };
    case 0xE3: return { size: 1, text: 'EX (SP),HL' };
    case 0xE5: return { size: 1, text: 'PUSH HL' };
    case 0xE6: return { size: 2, text: `AND $${hex2(rom[addr + 1])}` };
    case 0xE9: return { size: 1, text: 'JP (HL)' };
    case 0xEB: return { size: 1, text: 'EX DE,HL' };
    case 0xEE: return { size: 2, text: `XOR $${hex2(rom[addr + 1])}` };
    case 0xF1: return { size: 1, text: 'POP AF' };
    case 0xF3: return { size: 1, text: 'DI' };
    case 0xF5: return { size: 1, text: 'PUSH AF' };
    case 0xF6: return { size: 2, text: `OR $${hex2(rom[addr + 1])}` };
    case 0xF9: return { size: 1, text: 'LD SP,HL' };
    case 0xFB: return { size: 1, text: 'EI' };
    case 0xFE: return { size: 2, text: `CP $${hex2(rom[addr + 1])}` };
    default: return { size: 1, text: `DB $${hex2(op)}` };
  }
}

function disassemble(start, maxBytes) {
  const lines = [];
  let pc = start;
  const end = Math.min(start + maxBytes, rom.length);
  let ret = null;

  while (pc < end) {
    const ins = decode(pc);
    lines.push({ addr: pc, size: ins.size, bytes: bytesAt(pc, ins.size), text: ins.text });
    if (ret === null && /^RET(?: |$)/.test(ins.text)) ret = pc;
    pc += Math.max(ins.size, 1);
  }

  return { lines, ret };
}

function findPattern(pattern) {
  const hits = [];
  for (let i = 0; i <= rom.length - pattern.length; i++) {
    let ok = true;
    for (let j = 0; j < pattern.length; j++) {
      if (rom[i + j] !== pattern[j]) {
        ok = false;
        break;
      }
    }
    if (ok) hits.push(i);
  }
  return hits;
}

const callHits = findPattern([0xCD, 0xB9, 0x01, 0x08]);
const jpHits = findPattern([0xC3, 0xB9, 0x01, 0x08]);
const jpCondHits = [];
for (const op of [0xC2, 0xCA, 0xD2, 0xDA, 0xE2, 0xEA, 0xF2, 0xFA]) {
  for (const hit of findPattern([op, 0xB9, 0x01, 0x08])) jpCondHits.push({ op, hit });
}

const result = disassemble(TARGET, WINDOW);

console.log('Probe phase 551: decode 0x0801B9 - font size detection');
console.log(`ROM size: ${rom.length} bytes`);
console.log(`Target: $${hex6(TARGET)}`);
console.log(`Raw ${WINDOW} bytes:`);
for (let off = 0; off < WINDOW; off += 16) {
  const addr = TARGET + off;
  const count = Math.min(16, WINDOW - off);
  console.log(`  $${hex6(addr)}: ${bytesAt(addr, count)}`);
}

console.log('');
console.log('Disassembly:');
for (const line of result.lines) {
  const marker = line.addr === result.ret ? ' ; first RET candidate / boundary' : '';
  console.log(`  $${hex6(line.addr)}  ${line.bytes.padEnd(14)} ${line.text}${marker}`);
}

console.log('');
console.log('References to $0801B9:');
console.log(`  CALL exact CD B9 01 08: ${callHits.length}`);
for (const hit of callHits) console.log(`    $${hex6(hit)} -> CALL $0801B9`);
console.log(`  JP exact C3 B9 01 08: ${jpHits.length}`);
for (const hit of jpHits) console.log(`    $${hex6(hit)} -> JP $0801B9`);
console.log(`  JP cc exact op B9 01 08: ${jpCondHits.length}`);
for (const { op, hit } of jpCondHits) console.log(`    $${hex6(hit)} -> opcode $${hex2(op)} $0801B9`);

console.log('');
console.log('Analysis notes:');
console.log('  - Inspect the disassembly up to the first RET candidate for function boundaries.');
console.log('  - IY-indexed BIT/SET/RES lines identify flag reads/writes such as (IY+17) or (IY+20).');
console.log('  - LD/CP/OR/AND/XOR/RET lines show whether the routine returns status through A/HL/flags.');
console.log('  - CALL lines inside the target window identify helper routines that need follow-up decoding.');
console.log('  - If the routine contains SET/RES on an IY flag before RET, it directly mutates caller-visible OS flags.');
