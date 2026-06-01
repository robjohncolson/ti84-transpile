import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

void createExecutor;
void createPeripheralBus;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const romCandidates = [
  path.join(__dirname, 'ROM.rom'),
  path.join(repoRoot, 'ROM.rom'),
  path.join(process.cwd(), 'ROM.rom'),
  path.join(process.cwd(), 'TI-84_Plus_CE', 'ROM.rom'),
];

const romPath = romCandidates.find((candidate) => fs.existsSync(candidate));
if (!romPath) {
  throw new Error(`ROM.rom not found. Checked: ${romCandidates.join(', ')}`);
}

const rom = fs.readFileSync(romPath);
const mem = new Uint8Array(0x1000000);
mem.set(rom.subarray(0, mem.length), 0);

const PREAMBLE_START = 0x0a23ab;
const PREAMBLE_LIMIT = 0x0a23d0;
const INNER_LOOP_START = 0x0a2400;
const INNER_LOOP_LIMIT = 0x0a2500;

const r8 = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
const rp = ['BC', 'DE', 'HL', 'SP'];
const rp2 = ['BC', 'DE', 'HL', 'AF'];
const cc = ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'];
const rot = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'];
const block = new Map([
  [0xa0, 'LDI'],
  [0xa1, 'CPI'],
  [0xa2, 'INI'],
  [0xa3, 'OUTI'],
  [0xa8, 'LDD'],
  [0xa9, 'CPD'],
  [0xaa, 'IND'],
  [0xab, 'OUTD'],
  [0xb0, 'LDIR'],
  [0xb1, 'CPIR'],
  [0xb2, 'INIR'],
  [0xb3, 'OTIR'],
  [0xb8, 'LDDR'],
  [0xb9, 'CPDR'],
  [0xba, 'INDR'],
  [0xbb, 'OTDR'],
]);

const modePrefixes = new Map([
  [0x40, { name: '.SIS', operandBytes: 2, addressBytes: 2 }],
  [0x49, { name: '.LIS', operandBytes: 3, addressBytes: 2 }],
  [0x52, { name: '.SIL', operandBytes: 2, addressBytes: 3 }],
  [0x5b, { name: '.LIL', operandBytes: 3, addressBytes: 3 }],
]);

const defaultMode = { name: '', operandBytes: 3, addressBytes: 3 };
const decodedInstructions = [];

function hex(value, width = 2) {
  return (value >>> 0).toString(16).toUpperCase().padStart(width, '0');
}

function addrHex(value) {
  return hex(value & 0xffffff, 6);
}

function immHex(value, bytes) {
  return `0x${hex(value, bytes * 2)}`;
}

function read8(addr) {
  if (addr < 0 || addr >= mem.length) {
    throw new Error(`Read outside memory at ${addrHex(addr)}`);
  }
  return mem[addr];
}

function readLE(addr, bytes) {
  let value = 0;
  for (let i = 0; i < bytes; i += 1) {
    value |= read8(addr + i) << (i * 8);
  }
  return value >>> 0;
}

function signed8(value) {
  return value & 0x80 ? value - 0x100 : value;
}

function dispText(value) {
  const signed = signed8(value);
  if (signed === 0) {
    return '+0';
  }
  return signed > 0 ? `+${signed}` : `${signed}`;
}

function rawBytes(start, end) {
  const out = [];
  for (let addr = start; addr < end; addr += 1) {
    out.push(hex(read8(addr)));
  }
  return out.join(' ');
}

function addRef(refs, ref) {
  if (!refs.includes(ref)) {
    refs.push(ref);
  }
}

function classifyAddress(addr) {
  if (addr === 0xd008d2) {
    return 'LCD window register D008D2';
  }
  if (addr === 0xd008d5) {
    return 'LCD window register D008D5';
  }
  if (addr >= 0xd40000 && addr < 0xd65800) {
    return 'VRAM range';
  }
  if (addr >= 0xd00000 && addr <= 0xd3ffff) {
    return 'D0 RAM/MMIO range';
  }
  return '';
}

function addDirectRef(refs, access, addr) {
  const category = classifyAddress(addr);
  addRef(refs, `${access} ${addrHex(addr)}${category ? ` ${category}` : ''}`);
}

function addIndirectRef(refs, access, expr) {
  let note = `${access} ${expr}`;
  if (expr.startsWith('(IX')) {
    note += access === 'READ' ? ' font-data candidate' : ' indexed IX write';
  } else if (expr.startsWith('(IY')) {
    note += ' indexed IY access';
  } else if ((expr === '(HL)' || expr === '(DE)') && access === 'WRITE') {
    note += ' possible VRAM pointer';
  }
  addRef(refs, note);
}

function addBranchRef(refs, mnemonic, target, origin) {
  addRef(refs, `${mnemonic} target=${addrHex(target)}`);
  if (target <= origin) {
    addRef(refs, 'BACKWARD_BRANCH loop candidate');
  }
}

function usesModeSizedOperand(op) {
  const x = op >> 6;
  const y = (op >> 3) & 7;
  const z = op & 7;
  const q = y & 1;

  if (x === 0 && z === 1 && q === 0) {
    return true; // LD rp,imm
  }
  if (x === 0 && z === 2 && y >= 4) {
    return true; // LD direct-memory forms
  }
  if (x === 3 && z === 2) {
    return true; // JP cc,addr
  }
  if (x === 3 && z === 3 && y === 0) {
    return true; // JP addr
  }
  if (x === 3 && z === 4) {
    return true; // CALL cc,addr
  }
  if (x === 3 && z === 5 && q === 1 && y === 0) {
    return true; // CALL addr
  }
  return false;
}

function edUsesModeSizedOperand(op) {
  return (op & 0xcf) === 0x43 || (op & 0xcf) === 0x4b;
}

function indexedUsesModeSizedOperand(op) {
  if (op === 0xcb) {
    return false;
  }
  return usesModeSizedOperand(op);
}

function looksLikeModePrefix(addr) {
  const next = read8(addr);
  if (next === 0xdd || next === 0xfd) {
    return indexedUsesModeSizedOperand(read8(addr + 1));
  }
  if (next === 0xed) {
    return edUsesModeSizedOperand(read8(addr + 1));
  }
  return usesModeSizedOperand(next);
}

function finish(start, pc, prefixTexts, text, refs, flags = {}) {
  const fullText = `${prefixTexts.join(' ')}${prefixTexts.length ? ' ' : ''}${text}`;
  const instruction = {
    addr: start,
    next: pc,
    bytes: rawBytes(start, pc),
    text: fullText,
    refs,
    flags,
  };
  decodedInstructions.push(instruction);
  return instruction;
}

function decodeAt(addr) {
  const start = addr;
  let pc = addr;
  let mode = defaultMode;
  const prefixTexts = [];

  const maybeMode = modePrefixes.get(read8(pc));
  if (maybeMode && looksLikeModePrefix(pc + 1)) {
    mode = maybeMode;
    prefixTexts.push(maybeMode.name);
    pc += 1;
  }

  const op = read8(pc);
  pc += 1;

  if (op === 0xcb) {
    return decodeCB(start, pc, mode, prefixTexts);
  }
  if (op === 0xed) {
    return decodeED(start, pc, mode, prefixTexts);
  }
  if (op === 0xdd || op === 0xfd) {
    return decodeIndexed(start, pc, mode, prefixTexts, op === 0xdd ? 'IX' : 'IY');
  }

  return decodeBase(start, pc, mode, prefixTexts, op);
}

function decodeBase(start, pc, mode, prefixTexts, op) {
  const refs = [];
  const x = op >> 6;
  const y = (op >> 3) & 7;
  const z = op & 7;
  const p = y >> 1;
  const q = y & 1;

  if (x === 1) {
    if (op === 0x76) {
      return finish(start, pc, prefixTexts, 'HALT', refs);
    }
    const dest = r8[y];
    const src = r8[z];
    if (dest === '(HL)') {
      addIndirectRef(refs, 'WRITE', dest);
    }
    if (src === '(HL)') {
      addIndirectRef(refs, 'READ', src);
    }
    return finish(start, pc, prefixTexts, `LD ${dest},${src}`, refs);
  }

  if (x === 2) {
    const operand = r8[z];
    if (operand === '(HL)') {
      addIndirectRef(refs, 'READ', operand);
    }
    return finish(start, pc, prefixTexts, aluText(y, operand), refs);
  }

  if (x === 0) {
    if (z === 0) {
      if (y === 0) {
        return finish(start, pc, prefixTexts, 'NOP', refs);
      }
      if (y === 1) {
        return finish(start, pc, prefixTexts, "EX AF,AF'", refs);
      }
      const disp = signed8(read8(pc));
      pc += 1;
      const target = (pc + disp) & 0xffffff;
      const mnemonic = y === 2 ? 'DJNZ' : `JR ${cc[y - 4] ?? ''}`.trim();
      addBranchRef(refs, mnemonic, target, start);
      return finish(start, pc, prefixTexts, `${mnemonic} ${addrHex(target)}`, refs);
    }

    if (z === 1) {
      if (q === 0) {
        const value = readLE(pc, mode.operandBytes);
        pc += mode.operandBytes;
        return finish(start, pc, prefixTexts, `LD ${rp[p]},${immHex(value, mode.operandBytes)}`, refs);
      }
      return finish(start, pc, prefixTexts, `ADD HL,${rp[p]}`, refs);
    }

    if (z === 2) {
      if (y === 0) {
        addIndirectRef(refs, 'WRITE', '(BC)');
        return finish(start, pc, prefixTexts, 'LD (BC),A', refs);
      }
      if (y === 1) {
        addIndirectRef(refs, 'READ', '(BC)');
        return finish(start, pc, prefixTexts, 'LD A,(BC)', refs);
      }
      if (y === 2) {
        addIndirectRef(refs, 'WRITE', '(DE)');
        return finish(start, pc, prefixTexts, 'LD (DE),A', refs);
      }
      if (y === 3) {
        addIndirectRef(refs, 'READ', '(DE)');
        return finish(start, pc, prefixTexts, 'LD A,(DE)', refs);
      }
      const direct = readLE(pc, mode.addressBytes);
      pc += mode.addressBytes;
      if (y === 4) {
        addDirectRef(refs, 'WRITE', direct);
        return finish(start, pc, prefixTexts, `LD (${addrHex(direct)}),HL`, refs);
      }
      if (y === 5) {
        addDirectRef(refs, 'READ', direct);
        return finish(start, pc, prefixTexts, `LD HL,(${addrHex(direct)})`, refs);
      }
      if (y === 6) {
        addDirectRef(refs, 'WRITE', direct);
        return finish(start, pc, prefixTexts, `LD (${addrHex(direct)}),A`, refs);
      }
      addDirectRef(refs, 'READ', direct);
      return finish(start, pc, prefixTexts, `LD A,(${addrHex(direct)})`, refs);
    }

    if (z === 3) {
      return finish(start, pc, prefixTexts, `${q === 0 ? 'INC' : 'DEC'} ${rp[p]}`, refs);
    }

    if (z === 4 || z === 5) {
      const operand = r8[y];
      if (operand === '(HL)') {
        addIndirectRef(refs, 'READ', operand);
        addIndirectRef(refs, 'WRITE', operand);
      }
      return finish(start, pc, prefixTexts, `${z === 4 ? 'INC' : 'DEC'} ${operand}`, refs);
    }

    if (z === 6) {
      const value = read8(pc);
      pc += 1;
      const operand = r8[y];
      if (operand === '(HL)') {
        addIndirectRef(refs, 'WRITE', operand);
      }
      return finish(start, pc, prefixTexts, `LD ${operand},0x${hex(value)}`, refs);
    }

    const misc = ['RLCA', 'RRCA', 'RLA', 'RRA', 'DAA', 'CPL', 'SCF', 'CCF'];
    return finish(start, pc, prefixTexts, misc[y], refs);
  }

  if (z === 0) {
    return finish(start, pc, prefixTexts, `RET ${cc[y]}`, refs, { isReturn: true });
  }

  if (z === 1) {
    if (q === 0) {
      return finish(start, pc, prefixTexts, `POP ${rp2[p]}`, refs);
    }
    if (y === 0) {
      return finish(start, pc, prefixTexts, 'RET', refs, { isReturn: true, isUnconditionalRet: true });
    }
    if (y === 1) {
      return finish(start, pc, prefixTexts, 'EXX', refs);
    }
    if (y === 2) {
      addIndirectRef(refs, 'READ', '(HL)');
      return finish(start, pc, prefixTexts, 'JP (HL)', refs);
    }
    if (y === 3) {
      return finish(start, pc, prefixTexts, 'LD SP,HL', refs);
    }
  }

  if (z === 2) {
    const direct = readLE(pc, mode.addressBytes);
    pc += mode.addressBytes;
    addBranchRef(refs, `JP ${cc[y]}`, direct, start);
    return finish(start, pc, prefixTexts, `JP ${cc[y]},${addrHex(direct)}`, refs);
  }

  if (z === 3) {
    if (y === 0) {
      const direct = readLE(pc, mode.addressBytes);
      pc += mode.addressBytes;
      addBranchRef(refs, 'JP', direct, start);
      return finish(start, pc, prefixTexts, `JP ${addrHex(direct)}`, refs);
    }
    if (y === 2) {
      const port = read8(pc);
      pc += 1;
      return finish(start, pc, prefixTexts, `OUT (0x${hex(port)}),A`, refs);
    }
    if (y === 3) {
      const port = read8(pc);
      pc += 1;
      return finish(start, pc, prefixTexts, `IN A,(0x${hex(port)})`, refs);
    }
    if (y === 4) {
      addIndirectRef(refs, 'READ', '(SP)');
      addIndirectRef(refs, 'WRITE', '(SP)');
      return finish(start, pc, prefixTexts, 'EX (SP),HL', refs);
    }
    if (y === 5) {
      return finish(start, pc, prefixTexts, 'EX DE,HL', refs);
    }
    if (y === 6) {
      return finish(start, pc, prefixTexts, 'DI', refs);
    }
    if (y === 7) {
      return finish(start, pc, prefixTexts, 'EI', refs);
    }
  }

  if (z === 4) {
    const direct = readLE(pc, mode.addressBytes);
    pc += mode.addressBytes;
    addBranchRef(refs, `CALL ${cc[y]}`, direct, start);
    return finish(start, pc, prefixTexts, `CALL ${cc[y]},${addrHex(direct)}`, refs);
  }

  if (z === 5) {
    if (q === 0) {
      return finish(start, pc, prefixTexts, `PUSH ${rp2[p]}`, refs);
    }
    if (y === 0) {
      const direct = readLE(pc, mode.addressBytes);
      pc += mode.addressBytes;
      addBranchRef(refs, 'CALL', direct, start);
      return finish(start, pc, prefixTexts, `CALL ${addrHex(direct)}`, refs);
    }
  }

  if (z === 6) {
    const value = read8(pc);
    pc += 1;
    return finish(start, pc, prefixTexts, aluText(y, `0x${hex(value)}`), refs);
  }

  if (z === 7) {
    return finish(start, pc, prefixTexts, `RST 0x${hex(y * 8)}`, refs);
  }

  return finish(start, pc, prefixTexts, `DB 0x${hex(op)}`, refs);
}

function aluText(group, operand) {
  switch (group) {
    case 0:
      return `ADD A,${operand}`;
    case 1:
      return `ADC A,${operand}`;
    case 2:
      return `SUB ${operand}`;
    case 3:
      return `SBC A,${operand}`;
    case 4:
      return `AND ${operand}`;
    case 5:
      return `XOR ${operand}`;
    case 6:
      return `OR ${operand}`;
    case 7:
      return `CP ${operand}`;
    default:
      return `ALU${group} ${operand}`;
  }
}

function decodeCB(start, pc, mode, prefixTexts) {
  void mode;
  const refs = [];
  const op = read8(pc);
  pc += 1;
  const x = op >> 6;
  const y = (op >> 3) & 7;
  const z = op & 7;
  const operand = r8[z];

  if (operand === '(HL)') {
    addIndirectRef(refs, 'READ', operand);
    if (x !== 1) {
      addIndirectRef(refs, 'WRITE', operand);
    }
  }

  if (x === 0) {
    return finish(start, pc, prefixTexts, `${rot[y]} ${operand}`, refs);
  }
  if (x === 1) {
    return finish(start, pc, prefixTexts, `BIT ${y},${operand}`, refs);
  }
  if (x === 2) {
    return finish(start, pc, prefixTexts, `RES ${y},${operand}`, refs);
  }
  return finish(start, pc, prefixTexts, `SET ${y},${operand}`, refs);
}

function decodeIndexed(start, pc, mode, prefixTexts, indexReg) {
  const refs = [];
  const op = read8(pc);
  pc += 1;

  if (op === 0xcb) {
    const disp = read8(pc);
    pc += 1;
    const cbOp = read8(pc);
    pc += 1;
    return finish(start, pc, prefixTexts, decodeIndexedCB(indexReg, disp, cbOp, refs), refs);
  }

  const x = op >> 6;
  const y = (op >> 3) & 7;
  const z = op & 7;
  const p = y >> 1;
  const q = y & 1;
  const rpIdx = ['BC', 'DE', indexReg, 'SP'];
  const rp2Idx = ['BC', 'DE', indexReg, 'AF'];

  function indexedMem() {
    const disp = read8(pc);
    pc += 1;
    return `(${indexReg}${dispText(disp)})`;
  }

  function idxReg(code, access) {
    if (code === 6) {
      const expr = indexedMem();
      addIndirectRef(refs, access, expr);
      return expr;
    }
    if (code === 4) {
      return `${indexReg}H`;
    }
    if (code === 5) {
      return `${indexReg}L`;
    }
    return r8[code];
  }

  if (x === 1) {
    if (op === 0x76) {
      return finish(start, pc, prefixTexts, 'HALT', refs);
    }

    let expr = null;
    function sharedIdxReg(code, access) {
      if (code === 6) {
        if (!expr) {
          expr = indexedMem();
        }
        addIndirectRef(refs, access, expr);
        return expr;
      }
      if (code === 4) {
        return `${indexReg}H`;
      }
      if (code === 5) {
        return `${indexReg}L`;
      }
      return r8[code];
    }

    const dest = sharedIdxReg(y, 'WRITE');
    const src = sharedIdxReg(z, 'READ');
    return finish(start, pc, prefixTexts, `LD ${dest},${src}`, refs);
  }

  if (x === 2) {
    const operand = idxReg(z, 'READ');
    return finish(start, pc, prefixTexts, aluText(y, operand), refs);
  }

  if (x === 0) {
    if (z === 1) {
      if (q === 0) {
        const value = readLE(pc, mode.operandBytes);
        pc += mode.operandBytes;
        return finish(start, pc, prefixTexts, `LD ${rpIdx[p]},${immHex(value, mode.operandBytes)}`, refs);
      }
      return finish(start, pc, prefixTexts, `ADD ${indexReg},${rpIdx[p]}`, refs);
    }

    if (z === 2) {
      if (y === 4) {
        const direct = readLE(pc, mode.addressBytes);
        pc += mode.addressBytes;
        addDirectRef(refs, 'WRITE', direct);
        return finish(start, pc, prefixTexts, `LD (${addrHex(direct)}),${indexReg}`, refs);
      }
      if (y === 5) {
        const direct = readLE(pc, mode.addressBytes);
        pc += mode.addressBytes;
        addDirectRef(refs, 'READ', direct);
        return finish(start, pc, prefixTexts, `LD ${indexReg},(${addrHex(direct)})`, refs);
      }
      return decodeBase(start, pc, mode, prefixTexts, op);
    }

    if (z === 3) {
      return finish(start, pc, prefixTexts, `${q === 0 ? 'INC' : 'DEC'} ${rpIdx[p]}`, refs);
    }

    if (z === 4 || z === 5) {
      const operand = idxReg(y, z === 4 ? 'READ' : 'READ');
      if (operand.startsWith('(')) {
        addIndirectRef(refs, 'WRITE', operand);
      }
      return finish(start, pc, prefixTexts, `${z === 4 ? 'INC' : 'DEC'} ${operand}`, refs);
    }

    if (z === 6) {
      const operand = idxReg(y, 'WRITE');
      const value = read8(pc);
      pc += 1;
      return finish(start, pc, prefixTexts, `LD ${operand},0x${hex(value)}`, refs);
    }

    return decodeBase(start, pc, mode, prefixTexts, op);
  }

  if (z === 1) {
    if (q === 0) {
      return finish(start, pc, prefixTexts, `POP ${rp2Idx[p]}`, refs);
    }
    if (y === 2) {
      addIndirectRef(refs, 'READ', `(${indexReg})`);
      return finish(start, pc, prefixTexts, `JP (${indexReg})`, refs);
    }
    if (y === 3) {
      return finish(start, pc, prefixTexts, `LD SP,${indexReg}`, refs);
    }
    return decodeBase(start, pc, mode, prefixTexts, op);
  }

  if (z === 3 && y === 4) {
    addIndirectRef(refs, 'READ', '(SP)');
    addIndirectRef(refs, 'WRITE', '(SP)');
    return finish(start, pc, prefixTexts, `EX (SP),${indexReg}`, refs);
  }

  if (z === 5 && q === 0) {
    return finish(start, pc, prefixTexts, `PUSH ${rp2Idx[p]}`, refs);
  }

  return decodeBase(start, pc, mode, prefixTexts, op);
}

function decodeIndexedCB(indexReg, disp, op, refs) {
  const x = op >> 6;
  const y = (op >> 3) & 7;
  const z = op & 7;
  const expr = `(${indexReg}${dispText(disp)})`;
  const registerTarget = z === 6 ? '' : `,${r8[z]}`;

  addIndirectRef(refs, 'READ', expr);
  if (x !== 1) {
    addIndirectRef(refs, 'WRITE', expr);
  }

  if (x === 0) {
    return `${rot[y]} ${expr}${registerTarget}`;
  }
  if (x === 1) {
    return `BIT ${y},${expr}`;
  }
  if (x === 2) {
    return `RES ${y},${expr}${registerTarget}`;
  }
  return `SET ${y},${expr}${registerTarget}`;
}

function decodeED(start, pc, mode, prefixTexts) {
  const refs = [];
  const op = read8(pc);
  pc += 1;
  const y = (op >> 3) & 7;
  const z = op & 7;
  const p = y >> 1;
  const rpEd = ['BC', 'DE', 'HL', 'SP'];

  const mlt = new Map([
    [0x4c, 'BC'],
    [0x5c, 'DE'],
    [0x6c, 'HL'],
    [0x7c, 'SP'],
  ]);
  if (mlt.has(op)) {
    return finish(start, pc, prefixTexts, `MLT ${mlt.get(op)}`, refs);
  }

  const lea = new Map([
    [0x02, ['BC', 'IX']],
    [0x03, ['BC', 'IY']],
    [0x12, ['DE', 'IX']],
    [0x13, ['DE', 'IY']],
    [0x22, ['HL', 'IX']],
    [0x23, ['HL', 'IY']],
    [0x32, ['IX', 'IX']],
    [0x33, ['IY', 'IY']],
  ]);
  if (lea.has(op)) {
    const [dest, base] = lea.get(op);
    const disp = read8(pc);
    pc += 1;
    addRef(refs, `LEA base=${base} displacement=${dispText(disp)}`);
    return finish(start, pc, prefixTexts, `LEA ${dest},${base}${dispText(disp)}`, refs);
  }

  if (block.has(op)) {
    const name = block.get(op);
    annotateBlockRefs(name, refs);
    return finish(start, pc, prefixTexts, name, refs);
  }

  if ((op & 0xc7) === 0x40) {
    const dest = y === 6 ? '(C)' : r8[y];
    return finish(start, pc, prefixTexts, `IN ${dest},(C)`, refs);
  }

  if ((op & 0xc7) === 0x41) {
    const src = y === 6 ? '0' : r8[y];
    return finish(start, pc, prefixTexts, `OUT (C),${src}`, refs);
  }

  if ((op & 0xcf) === 0x42) {
    return finish(start, pc, prefixTexts, `SBC HL,${rpEd[p]}`, refs);
  }

  if ((op & 0xcf) === 0x4a) {
    return finish(start, pc, prefixTexts, `ADC HL,${rpEd[p]}`, refs);
  }

  if ((op & 0xcf) === 0x43) {
    const direct = readLE(pc, mode.addressBytes);
    pc += mode.addressBytes;
    addDirectRef(refs, 'WRITE', direct);
    return finish(start, pc, prefixTexts, `LD (${addrHex(direct)}),${rpEd[p]}`, refs);
  }

  if ((op & 0xcf) === 0x4b) {
    const direct = readLE(pc, mode.addressBytes);
    pc += mode.addressBytes;
    addDirectRef(refs, 'READ', direct);
    return finish(start, pc, prefixTexts, `LD ${rpEd[p]},(${addrHex(direct)})`, refs);
  }

  if ([0x44, 0x54, 0x64, 0x74].includes(op)) {
    return finish(start, pc, prefixTexts, 'NEG', refs);
  }

  if (op === 0x45 || op === 0x55 || op === 0x65 || op === 0x75) {
    return finish(start, pc, prefixTexts, 'RETN', refs, { isReturn: true });
  }

  if (op === 0x4d || op === 0x5d || op === 0x6d || op === 0x7d) {
    return finish(start, pc, prefixTexts, 'RETI', refs, { isReturn: true });
  }

  if (op === 0x47) {
    return finish(start, pc, prefixTexts, 'LD I,A', refs);
  }
  if (op === 0x4f) {
    return finish(start, pc, prefixTexts, 'LD R,A', refs);
  }
  if (op === 0x57) {
    return finish(start, pc, prefixTexts, 'LD A,I', refs);
  }
  if (op === 0x5f) {
    return finish(start, pc, prefixTexts, 'LD A,R', refs);
  }
  if ([0x46, 0x4e, 0x66, 0x6e].includes(op)) {
    return finish(start, pc, prefixTexts, 'IM 0', refs);
  }
  if ([0x56, 0x76].includes(op)) {
    return finish(start, pc, prefixTexts, 'IM 1', refs);
  }
  if ([0x5e, 0x7e].includes(op)) {
    return finish(start, pc, prefixTexts, 'IM 2', refs);
  }
  if (op === 0x67) {
    addIndirectRef(refs, 'READ', '(HL)');
    addIndirectRef(refs, 'WRITE', '(HL)');
    return finish(start, pc, prefixTexts, 'RRD', refs);
  }
  if (op === 0x6f) {
    addIndirectRef(refs, 'READ', '(HL)');
    addIndirectRef(refs, 'WRITE', '(HL)');
    return finish(start, pc, prefixTexts, 'RLD', refs);
  }

  return finish(start, pc, prefixTexts, `ED 0x${hex(op)}`, refs);
}

function annotateBlockRefs(name, refs) {
  if (name.startsWith('LD')) {
    addIndirectRef(refs, 'READ', '(HL)');
    addIndirectRef(refs, 'WRITE', '(DE)');
    return;
  }
  if (name.startsWith('CP')) {
    addIndirectRef(refs, 'READ', '(HL)');
    return;
  }
  if (name.startsWith('IN')) {
    addIndirectRef(refs, 'WRITE', '(HL)');
    return;
  }
  if (name.startsWith('OT') || name.startsWith('OUT')) {
    addIndirectRef(refs, 'READ', '(HL)');
  }
}

function printInstruction(instruction) {
  const refs = instruction.refs.length ? ` ; refs: ${instruction.refs.join('; ')}` : '';
  console.log(`${addrHex(instruction.addr)}  ${instruction.bytes.padEnd(18)}  ${instruction.text}${refs}`);
}

function dumpSection(title, start, limit, options = {}) {
  console.log(`\n=== ${title} ${addrHex(start)}-${addrHex(limit)} ===`);
  let pc = start;
  let stopReason = `limit ${addrHex(limit)}`;

  while (pc < limit) {
    const instruction = decodeAt(pc);
    printInstruction(instruction);

    if (instruction.next <= pc) {
      stopReason = `decoder made no progress at ${addrHex(pc)}`;
      break;
    }
    pc = instruction.next;

    if (options.stopOnUnconditionalRet && instruction.flags.isUnconditionalRet) {
      stopReason = `unconditional RET at ${addrHex(instruction.addr)}`;
      break;
    }
  }

  console.log(`--- stop: ${stopReason}; next=${addrHex(pc)} ---`);
}

function printFilteredSummary(title, predicate) {
  const matches = decodedInstructions.filter(predicate);
  console.log(`\n${title}: ${matches.length}`);
  for (const instruction of matches) {
    const refs = instruction.refs.length ? ` ; ${instruction.refs.join('; ')}` : '';
    console.log(`  ${addrHex(instruction.addr)}  ${instruction.text}${refs}`);
  }
}

console.log(`ROM decode probe phase 483`);
console.log(`ROM path: ${romPath}`);
console.log(`ROM bytes loaded: ${rom.length}`);
console.log('Default decode mode: eZ80 ADL-style 24-bit immediates/addresses; .SIS/.LIS/.SIL/.LIL prefixes override operand/address width when detected.');

dumpSection('Shared preamble', PREAMBLE_START, PREAMBLE_LIMIT, { stopOnUnconditionalRet: true });
dumpSection('Pixel rendering inner loop', INNER_LOOP_START, INNER_LOOP_LIMIT, { stopOnUnconditionalRet: true });

console.log('\n=== Static highlights ===');
printFilteredSummary('LCD window register references', (instruction) =>
  instruction.refs.some((ref) => ref.includes('D008D2') || ref.includes('D008D5')));
printFilteredSummary('Direct D0 RAM/MMIO references', (instruction) =>
  instruction.refs.some((ref) => ref.includes('D0 RAM/MMIO')));
printFilteredSummary('Direct VRAM references', (instruction) =>
  instruction.refs.some((ref) => ref.includes('VRAM range')));
printFilteredSummary('Indirect writes that may be VRAM writes', (instruction) =>
  instruction.refs.some((ref) => ref.includes('possible VRAM pointer')));
printFilteredSummary('IX indexed reads, likely font glyph byte reads', (instruction) =>
  instruction.refs.some((ref) => ref.includes('IX') && ref.includes('font-data candidate')));
printFilteredSummary('Loop and branch structure', (instruction) =>
  instruction.refs.some((ref) => ref.includes('target=') || ref.includes('BACKWARD_BRANCH')));
