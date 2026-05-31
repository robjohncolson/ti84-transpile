#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const START_ADDR = 0x030173;
const END_ADDR = 0x030250;
const GLYPH_SELECTOR_ADDR = 0x030202;

const rom = readFileSync(ROM_PATH);

if (rom.length <= END_ADDR) {
  throw new Error(`ROM too small: need ${hexAddr(END_ADDR + 1)} bytes, got ${hexAddr(rom.length)}`);
}

const regs = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
const rp = ['BC', 'DE', 'HL', 'SP'];
const rpPush = ['BC', 'DE', 'HL', 'AF'];
const aluOps = ['ADD A', 'ADC A', 'SUB', 'SBC A', 'AND', 'XOR', 'OR', 'CP'];
const rotOps = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'];
const retCc = new Map([
  [0xc0, 'NZ'],
  [0xc8, 'Z'],
  [0xd0, 'NC'],
  [0xd8, 'C'],
  [0xe0, 'PO'],
  [0xe8, 'PE'],
  [0xf0, 'P'],
  [0xf8, 'M'],
]);
const jpCc = new Map([
  [0xc2, 'NZ'],
  [0xca, 'Z'],
  [0xd2, 'NC'],
  [0xda, 'C'],
  [0xe2, 'PO'],
  [0xea, 'PE'],
  [0xf2, 'P'],
  [0xfa, 'M'],
]);
const callCc = new Map([
  [0xc4, 'NZ'],
  [0xcc, 'Z'],
  [0xd4, 'NC'],
  [0xdc, 'C'],
  [0xe4, 'PO'],
  [0xec, 'PE'],
  [0xf4, 'P'],
  [0xfc, 'M'],
]);

function byteAt(addr) {
  return rom[addr];
}

function readUInt(addr, bytes) {
  let value = 0;
  for (let i = 0; i < bytes; i += 1) {
    value |= byteAt(addr + i) << (8 * i);
  }
  return value >>> 0;
}

function hexByte(value) {
  return value.toString(16).toUpperCase().padStart(2, '0');
}

function hexN(value, digits) {
  return `0x${value.toString(16).toUpperCase().padStart(digits, '0')}`;
}

function hexAddr(value) {
  return hexN(value, 6);
}

function hexImm8(value) {
  return hexN(value, 2);
}

function signed8(value) {
  return value < 0x80 ? value : value - 0x100;
}

function dispText(value) {
  const disp = signed8(value);
  if (disp < 0) {
    return `-0x${(-disp).toString(16).toUpperCase().padStart(2, '0')}`;
  }
  return `+0x${disp.toString(16).toUpperCase().padStart(2, '0')}`;
}

function directAddrText(value, bytes) {
  if (bytes === 2) {
    return `${hexN(value, 4)} (short/MBASE)`;
  }
  return hexAddr(value);
}

function immText(value, bytes) {
  return hexN(value, bytes * 2);
}

function parseModePrefixes(addr) {
  let pc = addr;
  const labels = [];
  let addrBytes = 3;
  let pairBytes = 3;

  for (;;) {
    const op = byteAt(pc);
    const next = byteAt(pc + 1);

    if (op === 0x40) {
      labels.push('.SIS');
      addrBytes = 2;
      pairBytes = 2;
      pc += 1;
      continue;
    }

    if (op === 0xdd && (next === 0x49 || next === 0x52)) {
      labels.push('.SIL');
      addrBytes = 3;
      pairBytes = 2;
      pc += 2;
      continue;
    }

    break;
  }

  return { pc, labels, addrBytes, pairBytes };
}

function withMode(ctx, mnemonic) {
  if (ctx.labels.length === 0) {
    return mnemonic;
  }
  return `${ctx.labels.join(' ')} ${mnemonic}`;
}

function instruction(addr, len, mnemonic) {
  return { len, mnemonic };
}

function decodeAt(addr) {
  const ctx = parseModePrefixes(addr);
  const decoded = decodeCore(ctx.pc, ctx);
  return instruction(ctx.pc - addr + decoded.len, withMode(ctx, decoded.mnemonic));
}

function decodeCore(pc, ctx) {
  const op = byteAt(pc);

  if (op === 0xcb) {
    return instruction(2, decodeCb(byteAt(pc + 1)));
  }

  if (op === 0xed) {
    return decodeEd(pc, ctx);
  }

  if (op === 0xdd || op === 0xfd) {
    return decodeIndexed(pc, op === 0xdd ? 'IX' : 'IY', ctx);
  }

  if (op >= 0x40 && op <= 0x7f) {
    if (op === 0x76) {
      return instruction(1, 'HALT');
    }
    return instruction(1, `LD ${regs[(op >> 3) & 7]},${regs[op & 7]}`);
  }

  if ((op & 0xc7) === 0x06) {
    return instruction(2, `LD ${regs[(op >> 3) & 7]},${hexImm8(byteAt(pc + 1))}`);
  }

  if ((op & 0xcf) === 0x01) {
    const target = rp[(op >> 4) & 3];
    const imm = readUInt(pc + 1, ctx.pairBytes);
    return instruction(1 + ctx.pairBytes, `LD ${target},${immText(imm, ctx.pairBytes)}`);
  }

  if ((op & 0xcf) === 0x03) {
    return instruction(1, `INC ${rp[(op >> 4) & 3]}`);
  }

  if ((op & 0xcf) === 0x0b) {
    return instruction(1, `DEC ${rp[(op >> 4) & 3]}`);
  }

  if ((op & 0xc7) === 0x04) {
    return instruction(1, `INC ${regs[(op >> 3) & 7]}`);
  }

  if ((op & 0xc7) === 0x05) {
    return instruction(1, `DEC ${regs[(op >> 3) & 7]}`);
  }

  if ((op & 0xcf) === 0x09) {
    return instruction(1, `ADD HL,${rp[(op >> 4) & 3]}`);
  }

  if (op >= 0x80 && op <= 0xbf) {
    const alu = aluOps[(op >> 3) & 7];
    const src = regs[op & 7];
    return instruction(1, alu === 'SUB' ? `SUB ${src}` : `${alu},${src}`);
  }

  const immediateAlu = new Map([
    [0xc6, 'ADD A'],
    [0xce, 'ADC A'],
    [0xd6, 'SUB'],
    [0xde, 'SBC A'],
    [0xe6, 'AND'],
    [0xee, 'XOR'],
    [0xf6, 'OR'],
    [0xfe, 'CP'],
  ]);
  if (immediateAlu.has(op)) {
    const alu = immediateAlu.get(op);
    const imm = hexImm8(byteAt(pc + 1));
    return instruction(2, alu === 'SUB' ? `SUB ${imm}` : `${alu},${imm}`);
  }

  if ((op & 0xcf) === 0xc5) {
    return instruction(1, `PUSH ${rpPush[(op >> 4) & 3]}`);
  }

  if ((op & 0xcf) === 0xc1) {
    return instruction(1, `POP ${rpPush[(op >> 4) & 3]}`);
  }

  if (retCc.has(op)) {
    return instruction(1, `RET ${retCc.get(op)}`);
  }

  if (jpCc.has(op)) {
    const target = readUInt(pc + 1, ctx.addrBytes);
    return instruction(1 + ctx.addrBytes, `JP ${jpCc.get(op)},${directAddrText(target, ctx.addrBytes)}`);
  }

  if (callCc.has(op)) {
    const target = readUInt(pc + 1, ctx.addrBytes);
    return instruction(1 + ctx.addrBytes, `CALL ${callCc.get(op)},${directAddrText(target, ctx.addrBytes)}`);
  }

  switch (op) {
    case 0x00:
      return instruction(1, 'NOP');
    case 0x02:
      return instruction(1, 'LD (BC),A');
    case 0x07:
      return instruction(1, 'RLCA');
    case 0x08:
      return instruction(1, "EX AF,AF'");
    case 0x0a:
      return instruction(1, 'LD A,(BC)');
    case 0x0f:
      return instruction(1, 'RRCA');
    case 0x10: {
      const target = pc + 2 + signed8(byteAt(pc + 1));
      return instruction(2, `DJNZ ${hexAddr(target)}`);
    }
    case 0x12:
      return instruction(1, 'LD (DE),A');
    case 0x17:
      return instruction(1, 'RLA');
    case 0x18: {
      const target = pc + 2 + signed8(byteAt(pc + 1));
      return instruction(2, `JR ${hexAddr(target)}`);
    }
    case 0x1a:
      return instruction(1, 'LD A,(DE)');
    case 0x1f:
      return instruction(1, 'RRA');
    case 0x20:
    case 0x28:
    case 0x30:
    case 0x38: {
      const cc = new Map([
        [0x20, 'NZ'],
        [0x28, 'Z'],
        [0x30, 'NC'],
        [0x38, 'C'],
      ]).get(op);
      const target = pc + 2 + signed8(byteAt(pc + 1));
      return instruction(2, `JR ${cc},${hexAddr(target)}`);
    }
    case 0x22: {
      const target = readUInt(pc + 1, ctx.addrBytes);
      return instruction(1 + ctx.addrBytes, `LD (${directAddrText(target, ctx.addrBytes)}),HL`);
    }
    case 0x27:
      return instruction(1, 'DAA');
    case 0x2a: {
      const target = readUInt(pc + 1, ctx.addrBytes);
      return instruction(1 + ctx.addrBytes, `LD HL,(${directAddrText(target, ctx.addrBytes)})`);
    }
    case 0x2f:
      return instruction(1, 'CPL');
    case 0x32: {
      const target = readUInt(pc + 1, ctx.addrBytes);
      return instruction(1 + ctx.addrBytes, `LD (${directAddrText(target, ctx.addrBytes)}),A`);
    }
    case 0x37:
      return instruction(1, 'SCF');
    case 0x3a: {
      const target = readUInt(pc + 1, ctx.addrBytes);
      return instruction(1 + ctx.addrBytes, `LD A,(${directAddrText(target, ctx.addrBytes)})`);
    }
    case 0x3f:
      return instruction(1, 'CCF');
    case 0xc3: {
      const target = readUInt(pc + 1, ctx.addrBytes);
      return instruction(1 + ctx.addrBytes, `JP ${directAddrText(target, ctx.addrBytes)}`);
    }
    case 0xc9:
      return instruction(1, 'RET');
    case 0xcd: {
      const target = readUInt(pc + 1, ctx.addrBytes);
      return instruction(1 + ctx.addrBytes, `CALL ${directAddrText(target, ctx.addrBytes)}`);
    }
    case 0xd9:
      return instruction(1, 'EXX');
    case 0xe3:
      return instruction(1, 'EX (SP),HL');
    case 0xe9:
      return instruction(1, 'JP (HL)');
    case 0xeb:
      return instruction(1, 'EX DE,HL');
    case 0xf3:
      return instruction(1, 'DI');
    case 0xf9:
      return instruction(1, 'LD SP,HL');
    case 0xfb:
      return instruction(1, 'EI');
    default:
      return instruction(1, `DB ${hexImm8(op)}`);
  }
}

function decodeEd(pc, ctx) {
  const op = byteAt(pc + 1);
  const mlt = new Map([
    [0x4c, 'BC'],
    [0x5c, 'DE'],
    [0x6c, 'HL'],
    [0x7c, 'SP'],
  ]);
  const sbc = new Map([
    [0x42, 'BC'],
    [0x52, 'DE'],
    [0x62, 'HL'],
    [0x72, 'SP'],
  ]);
  const adc = new Map([
    [0x4a, 'BC'],
    [0x5a, 'DE'],
    [0x6a, 'HL'],
    [0x7a, 'SP'],
  ]);
  const store = new Map([
    [0x43, 'BC'],
    [0x53, 'DE'],
    [0x63, 'HL'],
    [0x73, 'SP'],
  ]);
  const load = new Map([
    [0x4b, 'BC'],
    [0x5b, 'DE'],
    [0x6b, 'HL'],
    [0x7b, 'SP'],
  ]);

  if (mlt.has(op)) {
    return instruction(2, `MLT ${mlt.get(op)}`);
  }

  if (sbc.has(op)) {
    return instruction(2, `SBC HL,${sbc.get(op)}`);
  }

  if (adc.has(op)) {
    return instruction(2, `ADC HL,${adc.get(op)}`);
  }

  if (store.has(op)) {
    const target = readUInt(pc + 2, ctx.addrBytes);
    return instruction(2 + ctx.addrBytes, `LD (${directAddrText(target, ctx.addrBytes)}),${store.get(op)}`);
  }

  if (load.has(op)) {
    const target = readUInt(pc + 2, ctx.addrBytes);
    return instruction(2 + ctx.addrBytes, `LD ${load.get(op)},(${directAddrText(target, ctx.addrBytes)})`);
  }

  switch (op) {
    case 0x44:
      return instruction(2, 'NEG');
    case 0x45:
      return instruction(2, 'RETN');
    case 0x46:
      return instruction(2, 'IM 0');
    case 0x47:
      return instruction(2, 'LD I,A');
    case 0x4d:
      return instruction(2, 'RETI');
    case 0x4f:
      return instruction(2, 'LD R,A');
    case 0x56:
      return instruction(2, 'IM 1');
    case 0x57:
      return instruction(2, 'LD A,I');
    case 0x5e:
      return instruction(2, 'IM 2');
    case 0x5f:
      return instruction(2, 'LD A,R');
    case 0x67:
      return instruction(2, 'RRD');
    case 0x6f:
      return instruction(2, 'RLD');
    default:
      return instruction(2, `DB ED ${hexImm8(op)}`);
  }
}

function decodeIndexed(pc, indexReg, ctx) {
  const op = byteAt(pc + 1);
  const high = `${indexReg}H`;
  const low = `${indexReg}L`;
  const indexedRegs = ['B', 'C', 'D', 'E', high, low, `(${indexReg})`, 'A'];
  const indexedRp = ['BC', 'DE', indexReg, 'SP'];

  if (op === 0xcb) {
    return instruction(4, decodeIndexedCb(indexReg, byteAt(pc + 2), byteAt(pc + 3)));
  }

  if (op >= 0x40 && op <= 0x7f && op !== 0x76) {
    if ((op & 7) === 6) {
      return instruction(3, `LD ${indexedRegs[(op >> 3) & 7]},(${indexReg}${dispText(byteAt(pc + 2))})`);
    }
    if (((op >> 3) & 7) === 6) {
      return instruction(3, `LD (${indexReg}${dispText(byteAt(pc + 2))}),${indexedRegs[op & 7]}`);
    }
    return instruction(2, `LD ${indexedRegs[(op >> 3) & 7]},${indexedRegs[op & 7]}`);
  }

  if ((op & 0xc7) === 0x06) {
    const dst = indexedRegs[(op >> 3) & 7];
    if (dst === `(${indexReg})`) {
      return instruction(4, `LD (${indexReg}${dispText(byteAt(pc + 2))}),${hexImm8(byteAt(pc + 3))}`);
    }
    return instruction(3, `LD ${dst},${hexImm8(byteAt(pc + 2))}`);
  }

  if ((op & 0xcf) === 0x09) {
    return instruction(2, `ADD ${indexReg},${indexedRp[(op >> 4) & 3]}`);
  }

  if (op >= 0x80 && op <= 0xbf) {
    const alu = aluOps[(op >> 3) & 7];
    const src = (op & 7) === 6 ? `(${indexReg}${dispText(byteAt(pc + 2))})` : indexedRegs[op & 7];
    const len = (op & 7) === 6 ? 3 : 2;
    return instruction(len, alu === 'SUB' ? `SUB ${src}` : `${alu},${src}`);
  }

  switch (op) {
    case 0x21: {
      const imm = readUInt(pc + 2, ctx.pairBytes);
      return instruction(2 + ctx.pairBytes, `LD ${indexReg},${immText(imm, ctx.pairBytes)}`);
    }
    case 0x22: {
      const target = readUInt(pc + 2, ctx.addrBytes);
      return instruction(2 + ctx.addrBytes, `LD (${directAddrText(target, ctx.addrBytes)}),${indexReg}`);
    }
    case 0x23:
      return instruction(2, `INC ${indexReg}`);
    case 0x24:
      return instruction(2, `INC ${high}`);
    case 0x25:
      return instruction(2, `DEC ${high}`);
    case 0x2a: {
      const target = readUInt(pc + 2, ctx.addrBytes);
      return instruction(2 + ctx.addrBytes, `LD ${indexReg},(${directAddrText(target, ctx.addrBytes)})`);
    }
    case 0x2b:
      return instruction(2, `DEC ${indexReg}`);
    case 0x2c:
      return instruction(2, `INC ${low}`);
    case 0x2d:
      return instruction(2, `DEC ${low}`);
    case 0x34:
      return instruction(3, `INC (${indexReg}${dispText(byteAt(pc + 2))})`);
    case 0x35:
      return instruction(3, `DEC (${indexReg}${dispText(byteAt(pc + 2))})`);
    case 0x36:
      return instruction(4, `LD (${indexReg}${dispText(byteAt(pc + 2))}),${hexImm8(byteAt(pc + 3))}`);
    case 0xe1:
      return instruction(2, `POP ${indexReg}`);
    case 0xe3:
      return instruction(2, `EX (SP),${indexReg}`);
    case 0xe5:
      return instruction(2, `PUSH ${indexReg}`);
    case 0xe9:
      return instruction(2, `JP (${indexReg})`);
    case 0xf9:
      return instruction(2, `LD SP,${indexReg}`);
    default:
      return instruction(1, `DB ${hexImm8(byteAt(pc))}`);
  }
}

function decodeCb(op) {
  const target = regs[op & 7];
  const group = op >> 6;
  const bit = (op >> 3) & 7;

  if (group === 0) {
    return `${rotOps[bit]} ${target}`;
  }
  if (group === 1) {
    return `BIT ${bit},${target}`;
  }
  if (group === 2) {
    return `RES ${bit},${target}`;
  }
  return `SET ${bit},${target}`;
}

function decodeIndexedCb(indexReg, displacement, op) {
  const mem = `(${indexReg}${dispText(displacement)})`;
  const reg = regs[op & 7];
  const group = op >> 6;
  const bit = (op >> 3) & 7;

  if (group === 0) {
    return reg === '(HL)' ? `${rotOps[bit]} ${mem}` : `${rotOps[bit]} ${mem},${reg}`;
  }
  if (group === 1) {
    return `BIT ${bit},${mem}`;
  }
  if (group === 2) {
    return reg === '(HL)' ? `RES ${bit},${mem}` : `RES ${bit},${mem},${reg}`;
  }
  return reg === '(HL)' ? `SET ${bit},${mem}` : `SET ${bit},${mem},${reg}`;
}

function formatBytes(addr, len) {
  const out = [];
  for (let i = 0; i < len; i += 1) {
    out.push(hexByte(byteAt(addr + i)));
  }
  return out.join(' ');
}

function disassembleRange(start, end) {
  for (let pc = start; pc <= end;) {
    const decoded = decodeAt(pc);
    const hexBytes = formatBytes(pc, decoded.len).padEnd(17, ' ');
    console.log(`${hexAddr(pc)}: ${hexBytes}  ${decoded.mnemonic}`);
    pc += decoded.len;
  }
}

function hexDump(start, end) {
  for (let addr = start; addr <= end; addr += 16) {
    const lineEnd = Math.min(addr + 15, end);
    const bytes = [];
    for (let pc = addr; pc <= lineEnd; pc += 1) {
      bytes.push(hexByte(byteAt(pc)));
    }
    console.log(`${hexAddr(addr)}: ${bytes.join(' ')}`);
  }
}

console.log(`ROM: ${ROM_PATH}`);
console.log(`Disassembly ${hexAddr(START_ADDR)}-${hexAddr(END_ADDR)}`);
disassembleRange(START_ADDR, END_ADDR);

console.log('');
console.log(`Hex dump ${hexAddr(GLYPH_SELECTOR_ADDR)}-${hexAddr(END_ADDR)}`);
hexDump(GLYPH_SELECTOR_ADDR, END_ADDR);
