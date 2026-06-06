import { readFileSync } from 'fs';

/*
 * Probe: decode ROM function at 0x07D27A
 *
 * Target role:
 *   Type validator tail call for OP1 matrix/list type codes. The caller at
 *   0x07FDD6 masks OP1's type byte with 0x3F, accepts 0x1C/0x1D, saves OP1 to
 *   OP5 via CALL 0x07F95E, then jumps here.
 *
 * Known execution context:
 *   - eZ80 in ADL mode; absolute CALL/JP operands are 24-bit little-endian.
 *   - OP1 is at D005F8, OP5 is at D00624.
 *   - Type codes of interest: 0x1C matrix, 0x1D list, 0x18/0x19 result types.
 *
 * What this probe prints:
 *   1. Raw bytes from 0x07D27A.
 *   2. A conservative ADL-mode disassembly of the function body.
 *   3. Every identified CALL/JP/JR target.
 *   4. Raw bytes and a short decode window at each in-ROM target.
 *
 * Decoder scope:
 *   This is a purpose-built probe, not a complete eZ80 disassembler. It covers
 *   common Z80/eZ80 opcodes seen in ROM validator/copy/router tails, including
 *   24-bit CALL/JP, JR relative branches, ED block-copy opcodes, IX/IY indexed
 *   byte operations, and enough load/ALU/control flow mnemonics to make the
 *   function readable. Unknown opcodes are emitted as DB bytes so target
 *   discovery remains robust.
 */

const rom = readFileSync('TI-84_Plus_CE/ROM.rom');
const MAIN_ADDR = 0x07D27B;
const MAIN_LEN = 100;
const TARGET_LEN = 24;

function readROM(addr, len) {
  return Array.from(rom.slice(addr, addr + len));
}

function hex(b) {
  return b.toString(16).padStart(2, '0');
}

function hex4(a) {
  return '0x' + a.toString(16).padStart(4, '0');
}

function hex6(a) {
  return '0x' + a.toString(16).padStart(6, '0');
}

function addr24(bytes, off) {
  return bytes[off] | (bytes[off + 1] << 8) | (bytes[off + 2] << 16);
}

function signed8(n) {
  return n & 0x80 ? n - 0x100 : n;
}

function relTarget(baseAddr, off, len) {
  return (baseAddr + off + len + signed8(off < 0 ? 0 : 0)) & 0xFFFFFF;
}

function imm8(bytes, off) {
  return '0x' + hex(bytes[off]);
}

function imm16(bytes, off) {
  return hex4(bytes[off] | (bytes[off + 1] << 8));
}

function imm24(bytes, off) {
  return hex6(addr24(bytes, off));
}

function has(bytes, off, count) {
  return off + count <= bytes.length;
}

function bytesText(bytes, off, len) {
  return bytes.slice(off, off + len).map(hex).join(' ');
}

function printBytes(label, startAddr, bytes) {
  console.log(label);
  for (let i = 0; i < bytes.length; i += 16) {
    const chunk = bytes.slice(i, i + 16);
    console.log(hex6(startAddr + i) + ': ' + chunk.map(hex).join(' '));
  }
}

const reg8 = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
const rp = ['BC', 'DE', 'HL', 'SP'];
const rp2 = ['BC', 'DE', 'HL', 'AF'];
const cc = ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'];
const alu = ['ADD A,', 'ADC A,', 'SUB', 'SBC A,', 'AND', 'XOR', 'OR', 'CP'];

function decodePrefixed(bytes, off, prefix) {
  if (!has(bytes, off, 2)) return { len: 1, text: `DB 0x${hex(prefix)}` };
  const op = bytes[off + 1];
  const ireg = prefix === 0xDD ? 'IX' : 'IY';
  const hreg = prefix === 0xDD ? 'IXH' : 'IYH';
  const lreg = prefix === 0xDD ? 'IXL' : 'IYL';

  if (op === 0xCB && has(bytes, off, 4)) {
    const d = signed8(bytes[off + 2]);
    const cb = bytes[off + 3];
    const bit = (cb >> 3) & 0x07;
    const group = cb >> 6;
    if (group === 1) return { len: 4, text: `BIT ${bit},(${ireg}${d < 0 ? '' : '+'}${d})` };
    if (group === 2) return { len: 4, text: `RES ${bit},(${ireg}${d < 0 ? '' : '+'}${d})` };
    if (group === 3) return { len: 4, text: `SET ${bit},(${ireg}${d < 0 ? '' : '+'}${d})` };
    return { len: 4, text: `CB 0x${hex(cb)},(${ireg}${d < 0 ? '' : '+'}${d})` };
  }

  if ((op & 0xCF) === 0x01 && has(bytes, off, 5)) return { len: 5, text: `LD ${ireg},${imm24(bytes, off + 2)}` };
  if (op === 0x21 && has(bytes, off, 5)) return { len: 5, text: `LD ${ireg},${imm24(bytes, off + 2)}` };
  if (op === 0x22 && has(bytes, off, 5)) return { len: 5, text: `LD (${imm24(bytes, off + 2)}),${ireg}` };
  if (op === 0x2A && has(bytes, off, 5)) return { len: 5, text: `LD ${ireg},(${imm24(bytes, off + 2)})` };
  if (op === 0x23) return { len: 2, text: `INC ${ireg}` };
  if (op === 0x2B) return { len: 2, text: `DEC ${ireg}` };
  if (op === 0x34 && has(bytes, off, 3)) return { len: 3, text: `INC (${ireg}${signed8(bytes[off + 2]) < 0 ? '' : '+'}${signed8(bytes[off + 2])})` };
  if (op === 0x35 && has(bytes, off, 3)) return { len: 3, text: `DEC (${ireg}${signed8(bytes[off + 2]) < 0 ? '' : '+'}${signed8(bytes[off + 2])})` };
  if (op === 0x36 && has(bytes, off, 4)) return { len: 4, text: `LD (${ireg}${signed8(bytes[off + 2]) < 0 ? '' : '+'}${signed8(bytes[off + 2])}),${imm8(bytes, off + 3)}` };
  if (op === 0xE1) return { len: 2, text: `POP ${ireg}` };
  if (op === 0xE5) return { len: 2, text: `PUSH ${ireg}` };
  if (op === 0xE9) return { len: 2, text: `JP (${ireg})` };
  if (op === 0xF9) return { len: 2, text: `LD SP,${ireg}` };

  if (op >= 0x40 && op <= 0x7F && op !== 0x76) {
    const dstCode = (op >> 3) & 0x07;
    const srcCode = op & 0x07;
    const dst = dstCode === 4 ? hreg : dstCode === 5 ? lreg : reg8[dstCode];
    const src = srcCode === 4 ? hreg : srcCode === 5 ? lreg : reg8[srcCode];
    if (dst === '(HL)' || src === '(HL)') {
      if (!has(bytes, off, 3)) return { len: 2, text: `DB 0x${hex(prefix)},0x${hex(op)}` };
      const d = signed8(bytes[off + 2]);
      return { len: 3, text: `LD ${dst.replace('(HL)', `(${ireg}${d < 0 ? '' : '+'}${d})`)},${src.replace('(HL)', `(${ireg}${d < 0 ? '' : '+'}${d})`)}` };
    }
    return { len: 2, text: `LD ${dst},${src}` };
  }

  return { len: 2, text: `DB 0x${hex(prefix)},0x${hex(op)}` };
}

function decodeED(bytes, off) {
  if (!has(bytes, off, 2)) return { len: 1, text: 'DB 0xed' };
  const op = bytes[off + 1];
  const known = {
    0x44: 'NEG',
    0x45: 'RETN',
    0x4D: 'RETI',
    0x57: 'LD A,I',
    0x5F: 'LD A,R',
    0x67: 'RRD',
    0x6F: 'RLD',
    0xA0: 'LDI',
    0xA1: 'CPI',
    0xA8: 'LDD',
    0xA9: 'CPD',
    0xB0: 'LDIR',
    0xB1: 'CPIR',
    0xB8: 'LDDR',
    0xB9: 'CPDR',
  };
  if (known[op]) return { len: 2, text: known[op] };
  return { len: 2, text: `DB 0xed,0x${hex(op)}` };
}

function decodeAt(bytes, startAddr, off) {
  const op = bytes[off];

  if (op === 0xDD || op === 0xFD) return decodePrefixed(bytes, off, op);
  if (op === 0xED) return decodeED(bytes, off);

  if (op === 0x00) return { len: 1, text: 'NOP' };
  if (op === 0x08) return { len: 1, text: "EX AF,AF'" };
  if (op === 0x10 && has(bytes, off, 2)) return branchRel(bytes, startAddr, off, 2, 'DJNZ');
  if (op === 0x18 && has(bytes, off, 2)) return branchRel(bytes, startAddr, off, 2, 'JR');
  if ([0x20, 0x28, 0x30, 0x38].includes(op) && has(bytes, off, 2)) {
    return branchRel(bytes, startAddr, off, 2, `JR ${cc[(op >> 3) & 0x03]}`);
  }
  if (op === 0x22 && has(bytes, off, 4)) return { len: 4, text: `LD (${imm24(bytes, off + 1)}),HL` };
  if (op === 0x2A && has(bytes, off, 4)) return { len: 4, text: `LD HL,(${imm24(bytes, off + 1)})` };
  if (op === 0x32 && has(bytes, off, 4)) return { len: 4, text: `LD (${imm24(bytes, off + 1)}),A` };
  if (op === 0x3A && has(bytes, off, 4)) return { len: 4, text: `LD A,(${imm24(bytes, off + 1)})` };

  if ((op & 0xCF) === 0x01 && has(bytes, off, 4)) return { len: 4, text: `LD ${rp[(op >> 4) & 0x03]},${imm24(bytes, off + 1)}` };
  if ((op & 0xCF) === 0x03) return { len: 1, text: `INC ${rp[(op >> 4) & 0x03]}` };
  if ((op & 0xCF) === 0x0B) return { len: 1, text: `DEC ${rp[(op >> 4) & 0x03]}` };
  if ((op & 0xCF) === 0x09) return { len: 1, text: `ADD HL,${rp[(op >> 4) & 0x03]}` };

  if ((op & 0xC7) === 0x04) return { len: 1, text: `INC ${reg8[(op >> 3) & 0x07]}` };
  if ((op & 0xC7) === 0x05) return { len: 1, text: `DEC ${reg8[(op >> 3) & 0x07]}` };
  if ((op & 0xC7) === 0x06 && has(bytes, off, 2)) return { len: 2, text: `LD ${reg8[(op >> 3) & 0x07]},${imm8(bytes, off + 1)}` };

  if (op >= 0x40 && op <= 0x7F) {
    if (op === 0x76) return { len: 1, text: 'HALT' };
    return { len: 1, text: `LD ${reg8[(op >> 3) & 0x07]},${reg8[op & 0x07]}` };
  }

  if (op >= 0x80 && op <= 0xBF) {
    const opName = alu[(op >> 3) & 0x07];
    const operand = reg8[op & 0x07];
    return { len: 1, text: opName === 'SUB' ? `SUB ${operand}` : `${opName}${operand}` };
  }

  if ((op & 0xC7) === 0xC0) return { len: 1, text: `RET ${cc[(op >> 3) & 0x07]}` };
  if ((op & 0xC7) === 0xC2 && has(bytes, off, 4)) return branchAbs(bytes, off, 4, `JP ${cc[(op >> 3) & 0x07]}`);
  if ((op & 0xC7) === 0xC4 && has(bytes, off, 4)) return branchAbs(bytes, off, 4, `CALL ${cc[(op >> 3) & 0x07]}`);
  if ((op & 0xCF) === 0xC1) return { len: 1, text: `POP ${rp2[(op >> 4) & 0x03]}` };
  if ((op & 0xCF) === 0xC5) return { len: 1, text: `PUSH ${rp2[(op >> 4) & 0x03]}` };

  if (op === 0xC3 && has(bytes, off, 4)) return branchAbs(bytes, off, 4, 'JP');
  if (op === 0xC9) return { len: 1, text: 'RET' };
  if (op === 0xCD && has(bytes, off, 4)) return branchAbs(bytes, off, 4, 'CALL');
  if (op === 0xD9) return { len: 1, text: 'EXX' };
  if (op === 0xE3) return { len: 1, text: 'EX (SP),HL' };
  if (op === 0xE6 && has(bytes, off, 2)) return { len: 2, text: `AND ${imm8(bytes, off + 1)}` };
  if (op === 0xE9) return { len: 1, text: 'JP (HL)' };
  if (op === 0xEB) return { len: 1, text: 'EX DE,HL' };
  if (op === 0xF3) return { len: 1, text: 'DI' };
  if (op === 0xF6 && has(bytes, off, 2)) return { len: 2, text: `OR ${imm8(bytes, off + 1)}` };
  if (op === 0xF9) return { len: 1, text: 'LD SP,HL' };
  if (op === 0xFB) return { len: 1, text: 'EI' };
  if (op === 0xFE && has(bytes, off, 2)) return { len: 2, text: `CP ${imm8(bytes, off + 1)}` };

  const shortOps = {
    0x02: 'LD (BC),A',
    0x07: 'RLCA',
    0x0A: 'LD A,(BC)',
    0x0F: 'RRCA',
    0x12: 'LD (DE),A',
    0x17: 'RLA',
    0x1A: 'LD A,(DE)',
    0x1F: 'RRA',
    0x27: 'DAA',
    0x2F: 'CPL',
    0x37: 'SCF',
    0x3F: 'CCF',
  };
  if (shortOps[op]) return { len: 1, text: shortOps[op] };

  const imm8Ops = {
    0xC6: 'ADD A',
    0xCE: 'ADC A',
    0xD3: 'OUT',
    0xD6: 'SUB',
    0xDB: 'IN A',
    0xDE: 'SBC A',
    0xEE: 'XOR',
  };
  if (imm8Ops[op] && has(bytes, off, 2)) return { len: 2, text: `${imm8Ops[op]},${imm8(bytes, off + 1)}` };

  return { len: 1, text: `DB 0x${hex(op)}` };
}

function branchAbs(bytes, off, len, mnemonic) {
  const target = addr24(bytes, off + 1);
  return { len, text: `${mnemonic} ${hex6(target)}`, target, kind: mnemonic.split(' ')[0] };
}

function branchRel(bytes, startAddr, off, len, mnemonic) {
  const disp = signed8(bytes[off + 1]);
  const target = (startAddr + off + len + disp) & 0xFFFFFF;
  return { len, text: `${mnemonic} ${hex6(target)} ; ${disp >= 0 ? '+' : ''}${disp}`, target, kind: mnemonic.split(' ')[0] };
}

function disassemble(startAddr, bytes, options = {}) {
  const targets = [];
  const lines = [];
  let pc = 0;
  while (pc < bytes.length) {
    const decoded = decodeAt(bytes, startAddr, pc);
    const raw = bytesText(bytes, pc, decoded.len).padEnd(14, ' ');
    lines.push(`${hex6(startAddr + pc)}: ${raw} ${decoded.text}`);
    if (decoded.target !== undefined) {
      targets.push({
        from: startAddr + pc,
        target: decoded.target,
        kind: decoded.kind,
        text: decoded.text,
      });
    }
    pc += decoded.len;
    if (options.stopAtRet && decoded.text === 'RET') break;
    if (options.stopAtUnconditionalJump && /^JP 0x[0-9a-f]{6}$/i.test(decoded.text)) break;
  }
  return { lines, targets };
}

const mainBytes = readROM(MAIN_ADDR, MAIN_LEN);
printBytes(`=== ${hex6(MAIN_ADDR)} ROM bytes (${MAIN_LEN}) ===`, MAIN_ADDR, mainBytes);

const main = disassemble(MAIN_ADDR, mainBytes, { stopAtRet: false });
console.log(`\n=== ${hex6(MAIN_ADDR)} disassembly ===`);
for (const line of main.lines) console.log(line);

console.log('\n=== CALL/JP/JR targets ===');
if (main.targets.length === 0) {
  console.log('(none found)');
} else {
  for (const t of main.targets) {
    console.log(`${hex6(t.from)}: ${t.text} -> ${hex6(t.target)}`);
  }
}

const uniqueTargets = [...new Set(main.targets.map(t => t.target))];
for (const t of uniqueTargets) {
  if (t >= 0x000000 && t < rom.length) {
    const bytes = readROM(t, TARGET_LEN);
    printBytes(`\n=== ${hex6(t)} target bytes (${TARGET_LEN}) ===`, t, bytes);
    const decoded = disassemble(t, bytes, { stopAtRet: true, stopAtUnconditionalJump: true });
    console.log(`=== ${hex6(t)} target decode ===`);
    for (const line of decoded.lines) console.log(line);
  } else {
    console.log(`\n=== ${hex6(t)} target is outside ROM length ${hex6(rom.length)} ===`);
  }
}
