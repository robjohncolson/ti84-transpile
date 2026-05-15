#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rom = readFileSync(path.join(__dirname, 'ROM.rom'));

const TABLE_ADDR = 0x0525D4;
const RECORD_SIZE = 12;
const RECORD_COUNT = 2;
const FUNCTION_SCAN_LIMIT = 150;

const FUNCTIONS = [
  { addr: 0x054FC6, record: 0, slot: '+3', role: 'record 0 slot +3' },
  { addr: 0x055167, record: 0, slot: '+6', role: 'record 0 slot +6' },
  { addr: 0x05518C, record: 0, slot: '+9', role: 'record 0 slot +9' },
  { addr: 0x054E21, record: 1, slot: '+3', role: 'record 1 slot +3' },
  { addr: 0x054FBC, record: 1, slot: '+6', role: 'record 1 slot +6' },
  { addr: 0x054FC1, record: 1, slot: '+9', role: 'record 1 slot +9' },
];

const CALLERS = [
  0x023D7B,
  0x023DC2,
  0x0254F4,
  0x04CA31,
  0x0551AD,
  0x09ED5E,
];

const KNOWN_TARGETS = new Map([
  [0x000154, '_imulu'],
  [0x0A5424, 'Load_Sfont'],
  [0x07BF3E, 'FontLookup'],
]);

const KNOWN_RAM = new Map([
  [0xD005E9, 'D005E9 descriptor ptr'],
  [0xD005F4, 'D005F4 width mode'],
  [0xD008D2, 'D008D2 pen column scratch'],
  [0xD008D5, 'D008D5 penRow'],
  [0xD02FD6, 'D02FD6 gCurYLoc'],
  [0xD02FD9, 'D02FD9 display bound'],
  [0xD02FDC, 'D02FDC display bound'],
  [0xD02FE0, 'D02FE0 stride/scale'],
  [0xD02FE3, 'D02FE3 stride/scale'],
  [0xD026AA, 'D026AA drawBGColor'],
]);

const REG8 = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
const PAIR16 = ['BC', 'DE', 'HL', 'SP'];
const COND = {
  0xC0: 'NZ',
  0xC2: 'NZ',
  0xC4: 'NZ',
  0xC8: 'Z',
  0xCA: 'Z',
  0xCC: 'Z',
  0xD0: 'NC',
  0xD2: 'NC',
  0xD4: 'NC',
  0xD8: 'C',
  0xDA: 'C',
  0xDC: 'C',
  0xE0: 'PO',
  0xE2: 'PO',
  0xE4: 'PO',
  0xE8: 'PE',
  0xEA: 'PE',
  0xEC: 'PE',
  0xF0: 'P',
  0xF2: 'P',
  0xF4: 'P',
  0xF8: 'M',
  0xFA: 'M',
  0xFC: 'M',
};

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return ((value ?? 0) & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

function bytesHex(addr, len) {
  return Array.from(rom.subarray(addr, addr + len), hexByte).join(' ');
}

function read16(addr) {
  return (rom[addr] | (rom[addr + 1] << 8)) >>> 0;
}

function read24(addr) {
  return (rom[addr] | (rom[addr + 1] << 8) | (rom[addr + 2] << 16)) >>> 0;
}

function signed8(value) {
  return value >= 0x80 ? value - 0x100 : value;
}

function fmtDisp(value) {
  return value >= 0 ? `+${value}` : `${value}`;
}

function fmtIndexed(reg, disp) {
  return `(${reg}${fmtDisp(disp)})`;
}

function labelAddr(addr) {
  return KNOWN_RAM.has(addr) ? `${hex(addr)} [${KNOWN_RAM.get(addr)}]` : hex(addr);
}

function labelTarget(addr) {
  return KNOWN_TARGETS.has(addr) ? `${hex(addr)} [${KNOWN_TARGETS.get(addr)}]` : hex(addr);
}

function resolveSisAddress(addr16) {
  return (0xD00000 | (addr16 & 0xFFFF)) >>> 0;
}

function makeInst(start, totalLen, text, extra = {}) {
  return {
    pc: start,
    len: totalLen,
    text,
    bytes: bytesHex(start, totalLen),
    reads: [],
    writes: [],
    indirectReads: [],
    indirectWrites: [],
    portsRead: [],
    portsWrite: [],
    ...extra,
  };
}

function decodeIndexed(start, pc, modePrefix, regName) {
  const op = rom[pc + 1];
  const pair = regName === 'IX' ? 'IX' : 'IY';
  const tagPair = regName.toLowerCase();
  const prefixText = modePrefix ? 'SIS ' : '';

  if (op === 0x21) {
    const value = read24(pc + 2);
    return makeInst(start, (pc - start) + 5, `${prefixText}LD ${pair}, ${hex(value)}`, {
      tag: 'ld-pair-imm',
      value,
    });
  }

  if (op === 0xE5) {
    return makeInst(start, (pc - start) + 2, `${prefixText}PUSH ${pair}`, { tag: 'push' });
  }

  if (op === 0xE1) {
    return makeInst(start, (pc - start) + 2, `${prefixText}POP ${pair}`, { tag: 'pop' });
  }

  if (op === 0x39) {
    return makeInst(start, (pc - start) + 2, `${prefixText}ADD ${pair}, SP`, { tag: 'add-pair' });
  }

  if (op === 0xCB) {
    const disp = signed8(rom[pc + 2]);
    const sub = rom[pc + 3];
    const operand = fmtIndexed(pair, disp);
    const totalLen = (pc - start) + 4;

    if (sub >= 0x40 && sub <= 0x7F) {
      const bit = (sub - 0x40) >> 3;
      return makeInst(start, totalLen, `${prefixText}BIT ${bit}, ${operand}`, {
        tag: 'indexed-cb-bit',
      });
    }

    if (sub >= 0x80 && sub <= 0xBF) {
      const bit = (sub - 0x80) >> 3;
      return makeInst(start, totalLen, `${prefixText}RES ${bit}, ${operand}`, {
        tag: 'indexed-cb-res',
      });
    }

    if (sub >= 0xC0 && sub <= 0xFF) {
      const bit = (sub - 0xC0) >> 3;
      return makeInst(start, totalLen, `${prefixText}SET ${bit}, ${operand}`, {
        tag: 'indexed-cb-set',
      });
    }

    if (sub === 0x16) {
      return makeInst(start, totalLen, `${prefixText}RL ${operand}`, {
        tag: 'indexed-cb-rotate',
      });
    }

    return makeInst(start, totalLen, `${prefixText}DB ${hexByte(rom[start])} ${hexByte(op)} ${hexByte(rom[pc + 2])} ${hexByte(sub)}`, {
      tag: 'db',
    });
  }

  const disp = signed8(rom[pc + 2]);
  const operand = fmtIndexed(pair, disp);
  const totalLen3 = (pc - start) + 3;

  const regFromOp = {
    0x46: 'B',
    0x4E: 'C',
    0x56: 'D',
    0x5E: 'E',
    0x66: 'H',
    0x6E: 'L',
    0x7E: 'A',
  };

  if (regFromOp[op]) {
    return makeInst(start, totalLen3, `${prefixText}LD ${regFromOp[op]}, ${operand}`, {
      tag: 'ld-reg-idx',
    });
  }

  const regToOp = {
    0x70: 'B',
    0x71: 'C',
    0x72: 'D',
    0x73: 'E',
    0x74: 'H',
    0x75: 'L',
    0x77: 'A',
  };

  if (regToOp[op]) {
    return makeInst(start, totalLen3, `${prefixText}LD ${operand}, ${regToOp[op]}`, {
      tag: 'ld-idx-reg',
    });
  }

  if (op === 0x36) {
    const value = rom[pc + 3];
    return makeInst(start, (pc - start) + 4, `${prefixText}LD ${operand}, ${hex(value, 2)}`, {
      tag: 'ld-idx-imm',
    });
  }

  const pairReadOps = {
    0x07: 'BC',
    0x17: 'DE',
    0x27: 'HL',
  };
  if (pairReadOps[op]) {
    return makeInst(start, totalLen3, `${prefixText}LD ${pairReadOps[op]}, ${operand}`, {
      tag: 'ld-pair-indexed',
    });
  }

  const pairWriteOps = {
    0x0F: 'BC',
    0x1F: 'DE',
    0x2F: 'HL',
  };
  if (pairWriteOps[op]) {
    return makeInst(start, totalLen3, `${prefixText}LD ${operand}, ${pairWriteOps[op]}`, {
      tag: 'ld-indexed-pair',
    });
  }

  if (op === 0x86) {
    return makeInst(start, totalLen3, `${prefixText}ADD A, ${operand}`, {
      tag: 'alu-idx',
    });
  }

  if (op === 0xBE) {
    return makeInst(start, totalLen3, `${prefixText}CP ${operand}`, {
      tag: 'alu-idx',
    });
  }

  return makeInst(start, (pc - start) + 2, `${prefixText}DB ${hexByte(rom[start])} ${hexByte(op)}`, {
    tag: 'db',
  });
}

function decodeED(start, pc, modePrefix) {
  const sub = rom[pc + 1];
  const prefixText = modePrefix ? 'SIS ' : '';

  const addrWidth = modePrefix ? 2 : 3;
  const readAddrValue = () => {
    if (modePrefix) {
      return resolveSisAddress(read16(pc + 2));
    }
    return read24(pc + 2);
  };

  if ([0x4B, 0x5B, 0x6B, 0x7B].includes(sub)) {
    const pair = PAIR16[(sub >> 4) - 4];
    const addr = readAddrValue();
    return makeInst(start, (pc - start) + 2 + addrWidth, `${prefixText}LD ${pair}, (${labelAddr(addr)})`, {
      tag: 'ld-pair-mem',
      reads: [{ addr, width: 3 }],
    });
  }

  if ([0x43, 0x53, 0x63, 0x73].includes(sub)) {
    const pair = PAIR16[(sub >> 4) - 4];
    const addr = readAddrValue();
    return makeInst(start, (pc - start) + 2 + addrWidth, `${prefixText}LD (${labelAddr(addr)}), ${pair}`, {
      tag: 'ld-mem-pair',
      writes: [{ addr, width: 3 }],
    });
  }

  if ([0x42, 0x52, 0x62, 0x72].includes(sub)) {
    const pair = PAIR16[(sub >> 4) - 4];
    return makeInst(start, (pc - start) + 2, `${prefixText}SBC HL, ${pair}`, {
      tag: 'sbc-pair',
    });
  }

  if ([0x4A, 0x5A, 0x6A, 0x7A].includes(sub)) {
    const pair = PAIR16[(sub >> 4) - 4];
    return makeInst(start, (pc - start) + 2, `${prefixText}ADC HL, ${pair}`, {
      tag: 'adc-pair',
    });
  }

  if ([0x4C, 0x5C, 0x6C, 0x7C].includes(sub)) {
    const pair = PAIR16[(sub >> 4) - 4];
    return makeInst(start, (pc - start) + 2, `${prefixText}MLT ${pair}`, {
      tag: 'mlt',
    });
  }

  if (sub === 0x78) {
    return makeInst(start, (pc - start) + 2, `${prefixText}IN A, (C)`, {
      tag: 'in-reg',
      portsRead: ['(C)'],
    });
  }

  if (sub === 0x79) {
    return makeInst(start, (pc - start) + 2, `${prefixText}OUT (C), A`, {
      tag: 'out-reg',
      portsWrite: ['(C)'],
    });
  }

  return makeInst(start, (pc - start) + 2, `${prefixText}DB ED ${hexByte(sub)}`, {
    tag: 'db',
  });
}

function decodeCB(start, pc, modePrefix) {
  const sub = rom[pc + 1];
  const prefixText = modePrefix ? 'SIS ' : '';

  if (sub === 0x14) {
    return makeInst(start, (pc - start) + 2, `${prefixText}RL H`, {
      tag: 'rotate-reg',
    });
  }

  return makeInst(start, (pc - start) + 2, `${prefixText}DB CB ${hexByte(sub)}`, {
    tag: 'db',
  });
}

function decodeAt(start) {
  let pc = start;
  let modePrefix = null;

  if (rom[pc] === 0x40) {
    modePrefix = 'sis';
    pc += 1;
  }

  const op = rom[pc];
  const prefixText = modePrefix ? 'SIS ' : '';

  if (op === 0xDD) {
    return decodeIndexed(start, pc, modePrefix, 'IX');
  }
  if (op === 0xFD) {
    return decodeIndexed(start, pc, modePrefix, 'IY');
  }
  if (op === 0xED) {
    return decodeED(start, pc, modePrefix);
  }
  if (op === 0xCB) {
    return decodeCB(start, pc, modePrefix);
  }

  const addrWidth = modePrefix ? 2 : 3;
  const readAbsAddr = () => {
    if (modePrefix) {
      return resolveSisAddress(read16(pc + 1));
    }
    return read24(pc + 1);
  };

  if (op === 0x00) return makeInst(start, (pc - start) + 1, `${prefixText}NOP`, { tag: 'nop' });
  if (op === 0x18) {
    const target = (pc + 2 + signed8(rom[pc + 1])) >>> 0;
    return makeInst(start, (pc - start) + 2, `${prefixText}JR ${hex(target)}`, { tag: 'jr', target });
  }
  if ([0x20, 0x28, 0x30, 0x38].includes(op)) {
    const target = (pc + 2 + signed8(rom[pc + 1])) >>> 0;
    return makeInst(start, (pc - start) + 2, `${prefixText}JR ${COND[op]}, ${hex(target)}`, {
      tag: 'jr-conditional',
      target,
    });
  }
  if ([0x01, 0x11, 0x21].includes(op)) {
    const pair = { 0x01: 'BC', 0x11: 'DE', 0x21: 'HL' }[op];
    const value = modePrefix ? read16(pc + 1) : read24(pc + 1);
    const width = modePrefix ? 4 : 6;
    return makeInst(start, (pc - start) + 1 + (modePrefix ? 2 : 3), `${prefixText}LD ${pair}, ${hex(value, width)}`, {
      tag: 'ld-pair-imm',
      value,
    });
  }
  if ([0x06, 0x0E, 0x16, 0x1E, 0x26, 0x2E, 0x3E].includes(op)) {
    const reg = { 0x06: 'B', 0x0E: 'C', 0x16: 'D', 0x1E: 'E', 0x26: 'H', 0x2E: 'L', 0x3E: 'A' }[op];
    const value = rom[pc + 1];
    return makeInst(start, (pc - start) + 2, `${prefixText}LD ${reg}, ${hex(value, 2)}`, {
      tag: 'ld-reg-imm',
      value,
    });
  }
  if (op === 0x2A) {
    const addr = readAbsAddr();
    return makeInst(start, (pc - start) + 1 + addrWidth, `${prefixText}LD HL, (${labelAddr(addr)})`, {
      tag: 'ld-pair-mem',
      reads: [{ addr, width: 3 }],
    });
  }
  if (op === 0x3A) {
    const addr = readAbsAddr();
    return makeInst(start, (pc - start) + 1 + addrWidth, `${prefixText}LD A, (${labelAddr(addr)})`, {
      tag: 'ld-reg-mem',
      reads: [{ addr, width: 1 }],
    });
  }
  if (op === 0x22) {
    const addr = readAbsAddr();
    return makeInst(start, (pc - start) + 1 + addrWidth, `${prefixText}LD (${labelAddr(addr)}), HL`, {
      tag: 'ld-mem-pair',
      writes: [{ addr, width: 3 }],
    });
  }
  if (op === 0xC3) {
    const target = read24(pc + 1);
    return makeInst(start, (pc - start) + 4, `${prefixText}JP ${hex(target)}`, {
      tag: 'jp',
      target,
    });
  }
  if ([0xC2, 0xCA, 0xD2, 0xDA, 0xE2, 0xEA, 0xF2, 0xFA].includes(op)) {
    const target = read24(pc + 1);
    return makeInst(start, (pc - start) + 4, `${prefixText}JP ${COND[op]}, ${hex(target)}`, {
      tag: 'jp-conditional',
      target,
    });
  }
  if (op === 0xCD) {
    const target = read24(pc + 1);
    return makeInst(start, (pc - start) + 4, `${prefixText}CALL ${hex(target)}`, {
      tag: 'call',
      target,
    });
  }
  if ([0xC4, 0xCC, 0xD4, 0xDC, 0xE4, 0xEC, 0xF4, 0xFC].includes(op)) {
    const target = read24(pc + 1);
    return makeInst(start, (pc - start) + 4, `${prefixText}CALL ${COND[op]}, ${hex(target)}`, {
      tag: 'call-conditional',
      target,
    });
  }
  if (op === 0xC9) return makeInst(start, (pc - start) + 1, `${prefixText}RET`, { tag: 'ret' });
  if ([0xC0, 0xC8, 0xD0, 0xD8, 0xE0, 0xE8, 0xF0, 0xF8].includes(op)) {
    return makeInst(start, (pc - start) + 1, `${prefixText}RET ${COND[op]}`, { tag: 'ret-conditional' });
  }

  if (op >= 0x40 && op <= 0x7F && op !== 0x76) {
    const dst = REG8[(op >> 3) & 0x07];
    const src = REG8[op & 0x07];
    const reads = src.startsWith('(') ? [] : undefined;
    const writes = dst.startsWith('(') ? [] : undefined;
    const inst = makeInst(start, (pc - start) + 1, `${prefixText}LD ${dst}, ${src}`, {
      tag: 'ld-reg-reg',
    });
    if (src === '(HL)') inst.indirectReads.push('(HL)');
    if (dst === '(HL)') inst.indirectWrites.push('(HL)');
    return inst;
  }

  if ([0x09, 0x19, 0x29, 0x39].includes(op)) {
    const pair = { 0x09: 'BC', 0x19: 'DE', 0x29: 'HL', 0x39: 'SP' }[op];
    return makeInst(start, (pc - start) + 1, `${prefixText}ADD HL, ${pair}`, {
      tag: 'add-pair',
    });
  }

  if ([0x23, 0x2B, 0x33, 0x3B].includes(op)) {
    const pair = { 0x23: 'HL', 0x2B: 'HL', 0x33: 'SP', 0x3B: 'SP' }[op];
    const verb = op === 0x23 || op === 0x33 ? 'INC' : 'DEC';
    return makeInst(start, (pc - start) + 1, `${prefixText}${verb} ${pair}`, {
      tag: verb === 'INC' ? 'inc-pair' : 'dec-pair',
    });
  }

  if ([0x04, 0x05, 0x0C, 0x0D].includes(op)) {
    const reg = { 0x04: 'B', 0x05: 'B', 0x0C: 'C', 0x0D: 'C' }[op];
    const verb = (op & 1) === 0 ? 'INC' : 'DEC';
    return makeInst(start, (pc - start) + 1, `${prefixText}${verb} ${reg}`, {
      tag: verb === 'INC' ? 'inc-reg' : 'dec-reg',
    });
  }

  if ([0xC5, 0xD5, 0xE5, 0xF5].includes(op)) {
    const pair = { 0xC5: 'BC', 0xD5: 'DE', 0xE5: 'HL', 0xF5: 'AF' }[op];
    return makeInst(start, (pc - start) + 1, `${prefixText}PUSH ${pair}`, { tag: 'push' });
  }

  if ([0xC1, 0xD1, 0xE1, 0xF1].includes(op)) {
    const pair = { 0xC1: 'BC', 0xD1: 'DE', 0xE1: 'HL', 0xF1: 'AF' }[op];
    return makeInst(start, (pc - start) + 1, `${prefixText}POP ${pair}`, { tag: 'pop' });
  }

  if (op === 0xEB) {
    return makeInst(start, (pc - start) + 1, `${prefixText}EX DE, HL`, { tag: 'ex-de-hl' });
  }

  if (op >= 0x80 && op <= 0xBF) {
    const opName = ['ADD', 'ADC', 'SUB', 'SBC', 'AND', 'XOR', 'OR', 'CP'][(op - 0x80) >> 3];
    const src = REG8[op & 0x07];
    const inst = makeInst(start, (pc - start) + 1, `${prefixText}${opName} ${src}`, {
      tag: 'alu-reg',
    });
    if (src === '(HL)') inst.indirectReads.push('(HL)');
    return inst;
  }

  if (op === 0xFE) {
    const value = rom[pc + 1];
    return makeInst(start, (pc - start) + 2, `${prefixText}CP ${hex(value, 2)}`, {
      tag: 'alu-imm',
      value,
    });
  }

  if (op === 0xDB) {
    const port = rom[pc + 1];
    return makeInst(start, (pc - start) + 2, `${prefixText}IN A, (${hex(port, 2)})`, {
      tag: 'in-imm',
      portsRead: [hex(port, 2)],
    });
  }

  if (op === 0xD3) {
    const port = rom[pc + 1];
    return makeInst(start, (pc - start) + 2, `${prefixText}OUT (${hex(port, 2)}), A`, {
      tag: 'out-imm',
      portsWrite: [hex(port, 2)],
    });
  }

  return makeInst(start, (pc - start) + 1, `${prefixText}DB ${hexByte(op)}`, { tag: 'db' });
}

function disassembleFunction(start, maxBytes = FUNCTION_SCAN_LIMIT) {
  const rows = [];
  let pc = start;

  while (pc < rom.length && (pc - start) < maxBytes) {
    const inst = decodeAt(pc);
    rows.push(inst);
    pc += Math.max(1, inst.len);
    if (inst.tag === 'ret' || inst.tag === 'jp') {
      break;
    }
  }

  return rows;
}

function unique(values) {
  return [...new Set(values)];
}

function summarizeDirectAccesses(rows, key) {
  const out = [];
  const seen = new Set();
  for (const row of rows) {
    for (const access of row[key]) {
      const token = `${access.addr}:${access.width}`;
      if (seen.has(token)) continue;
      seen.add(token);
      out.push(access);
    }
  }
  return out;
}

function summarizeIndirect(rows, key) {
  return unique(rows.flatMap((row) => row[key]));
}

function summarizePorts(rows, key) {
  return unique(rows.flatMap((row) => row[key]));
}

function metricConstant(rows) {
  if (rows.length >= 2 && rows[0].tag === 'ld-pair-imm' && rows[1].tag === 'ret') {
    return rows[0].value;
  }
  return null;
}

function classifyFunction(addr) {
  switch (addr) {
    case 0x054FC6:
      return {
        label: 'small-font per-character render helper',
        why: 'A is scaled by 0x19, passed to Load_Sfont, then the routine mixes direct D02FD6/D008D5/D02FE0/D02FE3 globals with glyph-table reads. That matches a small-font glyph draw/clip path, not LCD MMIO init.',
      };
    case 0x055167:
      return {
        label: 'variable-width metric lookup',
        why: 'A is scaled by 0x19, passed to Load_Sfont, and the first byte of the returned glyph record is copied into HL and returned as a metric.',
      };
    case 0x05518C:
      return {
        label: 'constant metric helper',
        why: 'The body is only `LD HL, 0x00000D; RET`, so this slot contributes a fixed metric value of 13.',
      };
    case 0x054E21:
      return {
        label: 'large-font per-character render helper',
        why: 'A is scaled by 0x1C, passed to FontLookup, then the routine uses the same D02FD6/D008D5/D02FE0/D02FE3 global family seen in display text code. This looks like a fixed-record font renderer, not panel power/DMA setup.',
      };
    case 0x054FBC:
      return {
        label: 'fixed-width metric helper',
        why: 'The body is only `LD HL, 0x00000C; RET`, so this slot returns a constant width of 12.',
      };
    case 0x054FC1:
      return {
        label: 'constant metric helper',
        why: 'The body is only `LD HL, 0x00000F; RET`, so this slot contributes a fixed metric value of 15.',
      };
    default:
      return {
        label: 'unclassified helper',
        why: 'No rule matched.',
      };
  }
}

function analyzeFunction(spec) {
  const rows = disassembleFunction(spec.addr);
  const calls = unique(
    rows
      .filter((row) => row.tag === 'call' || row.tag === 'call-conditional')
      .map((row) => row.target),
  );
  const reads = summarizeDirectAccesses(rows, 'reads');
  const writes = summarizeDirectAccesses(rows, 'writes');
  const indirectReads = summarizeIndirect(rows, 'indirectReads');
  const indirectWrites = summarizeIndirect(rows, 'indirectWrites');
  const portsRead = summarizePorts(rows, 'portsRead');
  const portsWrite = summarizePorts(rows, 'portsWrite');
  const classification = classifyFunction(spec.addr);

  return {
    ...spec,
    rows,
    calls,
    reads,
    writes,
    indirectReads,
    indirectWrites,
    portsRead,
    portsWrite,
    classification,
    constantMetric: metricConstant(rows),
  };
}

function analyzeCaller(site) {
  const beforeStart = site - 10;
  const beforeBytes = bytesHex(beforeStart, 10);
  const callBytes = bytesHex(site, 4);

  if (rom[site - 5] === 0x01 && rom[site - 1] === 0xC5) {
    const selector = read24(site - 4);
    return {
      site,
      beforeBytes,
      callBytes,
      selector,
      record: selector < RECORD_COUNT ? selector : null,
      why: `Immediate selector: LD BC, ${hex(selector)}; PUSH BC; CALL 0x055316.`,
      tail: `LD BC, ${hex(selector)}; PUSH BC; CALL 0x055316`,
    };
  }

  if (rom[site - 4] === 0xDD && rom[site - 3] === 0x07 && rom[site - 1] === 0xC5) {
    const disp = signed8(rom[site - 2]);
    return {
      site,
      beforeBytes,
      callBytes,
      selector: null,
      record: null,
      why: `Runtime selector: LD BC, ${fmtIndexed('IX', disp)}; PUSH BC; CALL 0x055316.`,
      tail: `LD BC, ${fmtIndexed('IX', disp)}; PUSH BC; CALL 0x055316`,
    };
  }

  return {
    site,
    beforeBytes,
    callBytes,
    selector: null,
    record: null,
    why: 'Selector pattern not recognized from the final 10-byte pre-call window.',
    tail: '(unrecognized pre-call sequence)',
  };
}

function recordPointers(recordIndex) {
  const base = TABLE_ADDR + recordIndex * RECORD_SIZE;
  return {
    selector: read24(base),
    slot3: read24(base + 3),
    slot6: read24(base + 6),
    slot9: read24(base + 9),
  };
}

function printAccessList(title, list) {
  if (list.length === 0) {
    console.log(`  ${title}: none`);
    return;
  }
  console.log(`  ${title}:`);
  for (const item of list) {
    console.log(`    - ${labelAddr(item.addr)} (width ${item.width})`);
  }
}

function printStringList(title, list) {
  if (list.length === 0) {
    console.log(`  ${title}: none`);
    return;
  }
  console.log(`  ${title}: ${list.join(', ')}`);
}

console.log('=== Phase 326: 0x055316 config-table function pointers ===');
console.log();

console.log(`ROM: ${path.join(__dirname, 'ROM.rom')}`);
console.log(`Table @ ${hex(TABLE_ADDR)} (${RECORD_COUNT} records x ${RECORD_SIZE} bytes)`);
console.log();

const rawTable = bytesHex(TABLE_ADDR, RECORD_COUNT * RECORD_SIZE);
console.log('1) Raw table bytes');
console.log(`  ${rawTable}`);
for (let record = 0; record < RECORD_COUNT; record += 1) {
  const base = TABLE_ADDR + record * RECORD_SIZE;
  const ptrs = recordPointers(record);
  console.log(
    `  record ${record} @ ${hex(base)}: selector=${hex(ptrs.selector)} ` +
    `slot+3=${hex(ptrs.slot3)} slot+6=${hex(ptrs.slot6)} slot+9=${hex(ptrs.slot9)}`,
  );
}

console.log();
console.log('2) Function-pointer analysis');

for (const report of FUNCTIONS.map(analyzeFunction)) {
  console.log();
  console.log(`- ${report.role} @ ${hex(report.addr)}`);
  console.log(`  classification: ${report.classification.label}`);
  console.log(`  rationale: ${report.classification.why}`);
  if (report.constantMetric !== null) {
    console.log(`  returned constant: ${hex(report.constantMetric)}`);
  }
  if (report.calls.length === 0) {
    console.log('  CALL targets: none');
  } else {
    console.log(`  CALL targets: ${report.calls.map((addr) => labelTarget(addr)).join(', ')}`);
  }
  printAccessList('direct RAM/MMIO reads', report.reads);
  printAccessList('direct RAM/MMIO writes', report.writes);
  printStringList('indirect reads', report.indirectReads);
  printStringList('indirect writes', report.indirectWrites);
  printStringList('port reads', report.portsRead);
  printStringList('port writes', report.portsWrite);
  console.log('  disassembly:');
  for (const row of report.rows) {
    console.log(`    ${hex(row.pc)}  ${row.bytes.padEnd(18)}  ${row.text}`);
  }
}

console.log();
console.log('3) Caller-site selector confirmation');

for (const caller of CALLERS.map(analyzeCaller)) {
  console.log();
  console.log(`- caller @ ${hex(caller.site)}`);
  console.log(`  bytes[-10..-1]: ${caller.beforeBytes}`);
  console.log(`  call bytes:     ${caller.callBytes}`);
  console.log(`  decoded tail:   ${caller.tail}`);
  if (caller.record !== null) {
    console.log(`  selects:        record ${caller.record}`);
  } else {
    console.log('  selects:        runtime selector');
  }
  console.log(`  why:            ${caller.why}`);
}

console.log();
console.log('4) Summary');
console.log('  - None of the six decoded targets perform IN/OUT port I/O or touch obvious E300xx/F800xx LCD MMIO in the requested decode windows.');
console.log('  - The observed direct accesses stay in D0xxxx RAM/display globals, especially D008D5, D02FD6, D02FE0, and D02FE3.');
console.log('  - Record 0 looks like a variable-width small-font descriptor:');
console.log(`    slot+3=${hex(0x054FC6)} uses Load_Sfont with char*0x19, slot+6=${hex(0x055167)} returns a glyph-dependent byte, slot+9=${hex(0x05518C)} returns 13.`);
console.log('  - Record 1 looks like a fixed-width 12x15-style font descriptor:');
console.log(`    slot+3=${hex(0x054E21)} uses FontLookup with char*0x1C, slot+6=${hex(0x054FBC)} returns 12, slot+9=${hex(0x054FC1)} returns 15.`);
console.log('  - The immediate callers line up with that split: 0x023D7B selects record 1, while 0x023DC2 / 0x0254F4 / 0x04CA31 / 0x0551AD select record 0. 0x09ED5E forwards a runtime selector from (IX+12).');
console.log('  - Taken together, 0x055316 is much more consistent with a text/font descriptor selector than with LCD panel SPI-init selection.');
