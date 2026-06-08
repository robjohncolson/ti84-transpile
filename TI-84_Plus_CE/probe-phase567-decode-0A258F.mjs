import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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
  throw new Error('ROM.rom not found. Checked: ' + romCandidates.join(', '));
}

const rom = fs.readFileSync(romPath);
const mem = new Uint8Array(0x1000000);
mem.set(rom.subarray(0, mem.length), 0);

// Target region: remaining column blit paths (4bpp/16bpp)
const REGION_START = 0x0a258f;
const REGION_END = 0x0a2695; // exclusive - first byte of post-blit handler

// Known addresses for annotation
const KNOWN_ADDRS = new Map([
  [0xd000ca, 'D000CA = (IY+0x4A) scroll/render flags'],
  [0xd00081, 'D00081 = (IY+0x01) system flags'],
  [0xd00085, 'D00085 = (IY+0x05) inverse/display flags'],
  [0xd0059c, 'D0059C VRAM scanline pointer'],
  [0xd025ce, 'D025CE row count'],
  [0xd025cf, 'D025CF font app state'],
  [0xd02505, 'D02505 scroll parameter'],
  [0xd006c0, 'D006C0 text buffer base'],
  [0xd005c5, 'D005C5 glyph workspace'],
  [0xd02611, 'D02611 font header'],
  [0x7326aa, '7326AA foreground color (16-bit)'],
  [0x7326ac, '7326AC background color (16-bit)'],
  [0x0a2695, '0A2695 post-blit column handler/row closer'],
  [0x0a2537, '0A2537 row loop top'],
  [0x0a2548, '0A2548 mono/1BPP blit path'],
  [0x0a258f, '0A258F 4bpp/16bpp paths (this region)'],
  [0x0a2400, '0A2400 render setup/glyph param calc'],
  [0x0a23ab, '0A23AB rendering preamble'],
  [0x0a26e5, '0A26E5 pixel fill mask table'],
  [0x0a1a9d, '0A1A9D VRAM ptr helper'],
  [0x0a1b1c, '0A1B1C VRAM ptr helper'],
  [0x0800a0, '0800A0 multi-stub cluster (split check)'],
  [0x08c308, '08C308 BPP mode test'],
  [0x02398e, '02398E font app validator'],
  [0x025758, '025758 app header validator'],
  [0x0a5424, '0A5424 small font glyph loader'],
]);

const r8 = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
const rp = ['BC', 'DE', 'HL', 'SP'];
const rp2 = ['BC', 'DE', 'HL', 'AF'];
const cc = ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'];
const rot = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'];
const block = new Map([
  [0xa0, 'LDI'], [0xa1, 'CPI'], [0xa2, 'INI'], [0xa3, 'OUTI'],
  [0xa8, 'LDD'], [0xa9, 'CPD'], [0xaa, 'IND'], [0xab, 'OUTD'],
  [0xb0, 'LDIR'], [0xb1, 'CPIR'], [0xb2, 'INIR'], [0xb3, 'OTIR'],
  [0xb8, 'LDDR'], [0xb9, 'CPDR'], [0xba, 'INDR'], [0xbb, 'OTDR'],
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
  return '0x' + hex(value, bytes * 2);
}

function read8(addr) {
  if (addr < 0 || addr >= mem.length) {
    throw new Error('Read outside memory at ' + addrHex(addr));
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
  if (signed === 0) return '+0';
  return signed > 0 ? '+' + signed : '' + signed;
}

function rawBytes(start, end) {
  const out = [];
  for (let addr = start; addr < end; addr += 1) {
    out.push(hex(read8(addr)));
  }
  return out.join(' ');
}

function addRef(refs, ref) {
  if (!refs.includes(ref)) refs.push(ref);
}

function classifyAddress(addr) {
  const known = KNOWN_ADDRS.get(addr);
  if (known) return known;
  if (addr >= 0xd40000 && addr < 0xd65800) return 'VRAM';
  if (addr >= 0xd00000 && addr <= 0xd3ffff) return 'D0 RAM/MMIO';
  if (addr >= 0x0a2000 && addr < 0x0a3000) return 'text render cluster';
  if (addr >= 0xe00000 && addr < 0xe40000) return 'LCD MMIO';
  return '';
}

function addDirectRef(refs, access, addr) {
  const category = classifyAddress(addr);
  addRef(refs, access + ' ' + addrHex(addr) + (category ? ' [' + category + ']' : ''));
}

function addIndirectRef(refs, access, expr) {
  let note = access + ' ' + expr;
  if (expr.startsWith('(IX')) note += ' glyph-data';
  else if (expr.startsWith('(IY')) note += ' system-flags';
  else if ((expr === '(HL)' || expr === '(DE)') && access === 'WRITE') note += ' VRAM-candidate';
  addRef(refs, note);
}

function addBranchRef(refs, mnemonic, target, origin) {
  const category = classifyAddress(target);
  addRef(refs, mnemonic + ' -> ' + addrHex(target) + (category ? ' [' + category + ']' : ''));
  if (target <= origin) addRef(refs, 'BACKWARD (loop)');
  if (target >= REGION_END) addRef(refs, 'EXIT to post-blit');
  if (target < REGION_START) addRef(refs, 'EXIT backward (pre-region)');
}

function usesModeSizedOperand(op) {
  const x = op >> 6;
  const y = (op >> 3) & 7;
  const z = op & 7;
  const q = y & 1;
  if (x === 0 && z === 1 && q === 0) return true;
  if (x === 0 && z === 2 && y >= 4) return true;
  if (x === 3 && z === 2) return true;
  if (x === 3 && z === 3 && y === 0) return true;
  if (x === 3 && z === 4) return true;
  if (x === 3 && z === 5 && q === 1 && y === 0) return true;
  return false;
}

function edUsesModeSizedOperand(op) {
  return (op & 0xcf) === 0x43 || (op & 0xcf) === 0x4b;
}

function indexedUsesModeSizedOperand(op) {
  if (op === 0xcb) return false;
  return usesModeSizedOperand(op);
}

function looksLikeModePrefix(addr) {
  const next = read8(addr);
  if (next === 0xdd || next === 0xfd) return indexedUsesModeSizedOperand(read8(addr + 1));
  if (next === 0xed) return edUsesModeSizedOperand(read8(addr + 1));
  return usesModeSizedOperand(next);
}

function finish(start, pc, prefixTexts, text, refs, flags) {
  flags = flags || {};
  const fullText = (prefixTexts.length ? prefixTexts.join(' ') + ' ' : '') + text;
  const instruction = { addr: start, next: pc, bytes: rawBytes(start, pc), text: fullText, refs: refs, flags: flags };
  decodedInstructions.push(instruction);
  return instruction;
}

function aluText(group, operand) {
  var ops = ['ADD A,', 'ADC A,', 'SUB ', 'SBC A,', 'AND ', 'XOR ', 'OR ', 'CP '];
  return ops[group] + operand;
}

function decodeAt(addr) {
  var start = addr;
  var pc = addr;
  var mode = defaultMode;
  var prefixTexts = [];

  var maybeMode = modePrefixes.get(read8(pc));
  if (maybeMode && looksLikeModePrefix(pc + 1)) {
    mode = maybeMode;
    prefixTexts.push(maybeMode.name);
    pc += 1;
  }

  var op = read8(pc);
  pc += 1;

  if (op === 0xcb) return decodeCB(start, pc, mode, prefixTexts);
  if (op === 0xed) return decodeED(start, pc, mode, prefixTexts);
  if (op === 0xdd || op === 0xfd) return decodeIndexed(start, pc, mode, prefixTexts, op === 0xdd ? 'IX' : 'IY');
  return decodeBase(start, pc, mode, prefixTexts, op);
}

function decodeBase(start, pc, mode, prefixTexts, op) {
  var refs = [];
  var x = op >> 6;
  var y = (op >> 3) & 7;
  var z = op & 7;
  var p = y >> 1;
  var q = y & 1;

  if (x === 1) {
    if (op === 0x76) return finish(start, pc, prefixTexts, 'HALT', refs);
    var dest = r8[y];
    var src = r8[z];
    if (dest === '(HL)') addIndirectRef(refs, 'WRITE', dest);
    if (src === '(HL)') addIndirectRef(refs, 'READ', src);
    return finish(start, pc, prefixTexts, 'LD ' + dest + ',' + src, refs);
  }

  if (x === 2) {
    var operand = r8[z];
    if (operand === '(HL)') addIndirectRef(refs, 'READ', operand);
    return finish(start, pc, prefixTexts, aluText(y, operand), refs);
  }

  if (x === 0) {
    if (z === 0) {
      if (y === 0) return finish(start, pc, prefixTexts, 'NOP', refs);
      if (y === 1) return finish(start, pc, prefixTexts, "EX AF,AF'", refs);
      var disp = signed8(read8(pc));
      pc += 1;
      var target = (pc + disp) & 0xffffff;
      var mnemonic = y === 2 ? 'DJNZ' : y === 3 ? 'JR' : 'JR ' + cc[y - 4];
      addBranchRef(refs, mnemonic, target, start);
      return finish(start, pc, prefixTexts, mnemonic + ' ' + addrHex(target), refs);
    }
    if (z === 1) {
      if (q === 0) {
        var value = readLE(pc, mode.operandBytes);
        pc += mode.operandBytes;
        return finish(start, pc, prefixTexts, 'LD ' + rp[p] + ',' + immHex(value, mode.operandBytes), refs);
      }
      return finish(start, pc, prefixTexts, 'ADD HL,' + rp[p], refs);
    }
    if (z === 2) {
      if (y === 0) { addIndirectRef(refs, 'WRITE', '(BC)'); return finish(start, pc, prefixTexts, 'LD (BC),A', refs); }
      if (y === 1) { addIndirectRef(refs, 'READ', '(BC)'); return finish(start, pc, prefixTexts, 'LD A,(BC)', refs); }
      if (y === 2) { addIndirectRef(refs, 'WRITE', '(DE)'); return finish(start, pc, prefixTexts, 'LD (DE),A', refs); }
      if (y === 3) { addIndirectRef(refs, 'READ', '(DE)'); return finish(start, pc, prefixTexts, 'LD A,(DE)', refs); }
      var direct = readLE(pc, mode.addressBytes);
      pc += mode.addressBytes;
      if (y === 4) { addDirectRef(refs, 'WRITE', direct); return finish(start, pc, prefixTexts, 'LD (' + addrHex(direct) + '),HL', refs); }
      if (y === 5) { addDirectRef(refs, 'READ', direct); return finish(start, pc, prefixTexts, 'LD HL,(' + addrHex(direct) + ')', refs); }
      if (y === 6) { addDirectRef(refs, 'WRITE', direct); return finish(start, pc, prefixTexts, 'LD (' + addrHex(direct) + '),A', refs); }
      addDirectRef(refs, 'READ', direct); return finish(start, pc, prefixTexts, 'LD A,(' + addrHex(direct) + ')', refs);
    }
    if (z === 3) return finish(start, pc, prefixTexts, (q === 0 ? 'INC' : 'DEC') + ' ' + rp[p], refs);
    if (z === 4 || z === 5) {
      var operand2 = r8[y];
      if (operand2 === '(HL)') { addIndirectRef(refs, 'READ', operand2); addIndirectRef(refs, 'WRITE', operand2); }
      return finish(start, pc, prefixTexts, (z === 4 ? 'INC' : 'DEC') + ' ' + operand2, refs);
    }
    if (z === 6) {
      var value2 = read8(pc); pc += 1;
      var operand3 = r8[y];
      if (operand3 === '(HL)') addIndirectRef(refs, 'WRITE', operand3);
      return finish(start, pc, prefixTexts, 'LD ' + operand3 + ',0x' + hex(value2), refs);
    }
    var misc = ['RLCA', 'RRCA', 'RLA', 'RRA', 'DAA', 'CPL', 'SCF', 'CCF'];
    return finish(start, pc, prefixTexts, misc[y], refs);
  }

  // x === 3
  if (z === 0) return finish(start, pc, prefixTexts, 'RET ' + cc[y], refs, { isReturn: true });
  if (z === 1) {
    if (q === 0) return finish(start, pc, prefixTexts, 'POP ' + rp2[p], refs);
    if (y === 0) return finish(start, pc, prefixTexts, 'RET', refs, { isReturn: true, isUnconditionalRet: true });
    if (y === 1) return finish(start, pc, prefixTexts, 'EXX', refs);
    if (y === 2) { addIndirectRef(refs, 'READ', '(HL)'); return finish(start, pc, prefixTexts, 'JP (HL)', refs); }
    if (y === 3) return finish(start, pc, prefixTexts, 'LD SP,HL', refs);
  }
  if (z === 2) {
    var direct2 = readLE(pc, mode.addressBytes);
    pc += mode.addressBytes;
    addBranchRef(refs, 'JP ' + cc[y], direct2, start);
    return finish(start, pc, prefixTexts, 'JP ' + cc[y] + ',' + addrHex(direct2), refs);
  }
  if (z === 3) {
    if (y === 0) {
      var direct3 = readLE(pc, mode.addressBytes);
      pc += mode.addressBytes;
      addBranchRef(refs, 'JP', direct3, start);
      return finish(start, pc, prefixTexts, 'JP ' + addrHex(direct3), refs);
    }
    if (y === 2) { var port = read8(pc); pc += 1; return finish(start, pc, prefixTexts, 'OUT (0x' + hex(port) + '),A', refs); }
    if (y === 3) { var port2 = read8(pc); pc += 1; return finish(start, pc, prefixTexts, 'IN A,(0x' + hex(port2) + ')', refs); }
    if (y === 4) { addIndirectRef(refs, 'READ', '(SP)'); addIndirectRef(refs, 'WRITE', '(SP)'); return finish(start, pc, prefixTexts, 'EX (SP),HL', refs); }
    if (y === 5) return finish(start, pc, prefixTexts, 'EX DE,HL', refs);
    if (y === 6) return finish(start, pc, prefixTexts, 'DI', refs);
    if (y === 7) return finish(start, pc, prefixTexts, 'EI', refs);
  }
  if (z === 4) {
    var direct4 = readLE(pc, mode.addressBytes);
    pc += mode.addressBytes;
    addBranchRef(refs, 'CALL ' + cc[y], direct4, start);
    return finish(start, pc, prefixTexts, 'CALL ' + cc[y] + ',' + addrHex(direct4), refs);
  }
  if (z === 5) {
    if (q === 0) return finish(start, pc, prefixTexts, 'PUSH ' + rp2[p], refs);
    if (y === 0) {
      var direct5 = readLE(pc, mode.addressBytes);
      pc += mode.addressBytes;
      addBranchRef(refs, 'CALL', direct5, start);
      return finish(start, pc, prefixTexts, 'CALL ' + addrHex(direct5), refs);
    }
  }
  if (z === 6) {
    var value3 = read8(pc); pc += 1;
    return finish(start, pc, prefixTexts, aluText(y, '0x' + hex(value3)), refs);
  }
  if (z === 7) return finish(start, pc, prefixTexts, 'RST 0x' + hex(y * 8), refs);
  return finish(start, pc, prefixTexts, 'DB 0x' + hex(op), refs);
}

function decodeCB(start, pc, _mode, prefixTexts) {
  var refs = [];
  var op = read8(pc); pc += 1;
  var x = op >> 6;
  var y = (op >> 3) & 7;
  var z = op & 7;
  var operand = r8[z];
  if (operand === '(HL)') { addIndirectRef(refs, 'READ', operand); if (x !== 1) addIndirectRef(refs, 'WRITE', operand); }
  if (x === 0) return finish(start, pc, prefixTexts, rot[y] + ' ' + operand, refs);
  if (x === 1) return finish(start, pc, prefixTexts, 'BIT ' + y + ',' + operand, refs);
  if (x === 2) return finish(start, pc, prefixTexts, 'RES ' + y + ',' + operand, refs);
  return finish(start, pc, prefixTexts, 'SET ' + y + ',' + operand, refs);
}

function decodeIndexed(start, pc, mode, prefixTexts, indexReg) {
  var refs = [];
  var op = read8(pc); pc += 1;

  if (op === 0xcb) {
    var disp = read8(pc); pc += 1;
    var cbOp = read8(pc); pc += 1;
    return finish(start, pc, prefixTexts, decodeIndexedCB(indexReg, disp, cbOp, refs), refs);
  }

  var x = op >> 6;
  var y = (op >> 3) & 7;
  var z = op & 7;
  var p = y >> 1;
  var q = y & 1;
  var rpIdx = ['BC', 'DE', indexReg, 'SP'];
  var rp2Idx = ['BC', 'DE', indexReg, 'AF'];

  // Track pc changes for displacement reads
  var pcRef = { val: pc };

  function indexedMem() {
    var d = read8(pcRef.val); pcRef.val += 1;
    return '(' + indexReg + dispText(d) + ')';
  }

  function idxReg(code, access) {
    if (code === 6) { var expr = indexedMem(); addIndirectRef(refs, access, expr); return expr; }
    if (code === 4) return indexReg + 'H';
    if (code === 5) return indexReg + 'L';
    return r8[code];
  }

  if (x === 1) {
    if (op === 0x76) return finish(start, pcRef.val, prefixTexts, 'HALT', refs);
    var expr = null;
    function sharedIdxReg(code, access) {
      if (code === 6) { if (!expr) expr = indexedMem(); addIndirectRef(refs, access, expr); return expr; }
      if (code === 4) return indexReg + 'H';
      if (code === 5) return indexReg + 'L';
      return r8[code];
    }
    var dest = sharedIdxReg(y, 'WRITE');
    var src = sharedIdxReg(z, 'READ');
    return finish(start, pcRef.val, prefixTexts, 'LD ' + dest + ',' + src, refs);
  }

  if (x === 2) {
    var operand = idxReg(z, 'READ');
    return finish(start, pcRef.val, prefixTexts, aluText(y, operand), refs);
  }

  if (x === 0) {
    if (z === 1) {
      if (q === 0) { var value = readLE(pcRef.val, mode.operandBytes); pcRef.val += mode.operandBytes; return finish(start, pcRef.val, prefixTexts, 'LD ' + rpIdx[p] + ',' + immHex(value, mode.operandBytes), refs); }
      return finish(start, pcRef.val, prefixTexts, 'ADD ' + indexReg + ',' + rpIdx[p], refs);
    }
    if (z === 2) {
      if (y === 4) { var direct = readLE(pcRef.val, mode.addressBytes); pcRef.val += mode.addressBytes; addDirectRef(refs, 'WRITE', direct); return finish(start, pcRef.val, prefixTexts, 'LD (' + addrHex(direct) + '),' + indexReg, refs); }
      if (y === 5) { var direct2 = readLE(pcRef.val, mode.addressBytes); pcRef.val += mode.addressBytes; addDirectRef(refs, 'READ', direct2); return finish(start, pcRef.val, prefixTexts, 'LD ' + indexReg + ',(' + addrHex(direct2) + ')', refs); }
      return decodeBase(start, pcRef.val, mode, prefixTexts, op);
    }
    if (z === 3) return finish(start, pcRef.val, prefixTexts, (q === 0 ? 'INC' : 'DEC') + ' ' + rpIdx[p], refs);
    if (z === 4 || z === 5) {
      var operand2 = idxReg(y, 'READ');
      if (operand2.startsWith('(')) addIndirectRef(refs, 'WRITE', operand2);
      return finish(start, pcRef.val, prefixTexts, (z === 4 ? 'INC' : 'DEC') + ' ' + operand2, refs);
    }
    if (z === 6) {
      var operand3 = idxReg(y, 'WRITE');
      var value2 = read8(pcRef.val); pcRef.val += 1;
      return finish(start, pcRef.val, prefixTexts, 'LD ' + operand3 + ',0x' + hex(value2), refs);
    }
    return decodeBase(start, pcRef.val, mode, prefixTexts, op);
  }

  // x === 3
  pc = pcRef.val;
  if (z === 1) {
    if (q === 0) return finish(start, pc, prefixTexts, 'POP ' + rp2Idx[p], refs);
    if (y === 2) { addIndirectRef(refs, 'READ', '(' + indexReg + ')'); return finish(start, pc, prefixTexts, 'JP (' + indexReg + ')', refs); }
    if (y === 3) return finish(start, pc, prefixTexts, 'LD SP,' + indexReg, refs);
    return decodeBase(start, pc, mode, prefixTexts, op);
  }
  if (z === 3 && y === 4) { addIndirectRef(refs, 'READ', '(SP)'); addIndirectRef(refs, 'WRITE', '(SP)'); return finish(start, pc, prefixTexts, 'EX (SP),' + indexReg, refs); }
  if (z === 5 && q === 0) return finish(start, pc, prefixTexts, 'PUSH ' + rp2Idx[p], refs);
  return decodeBase(start, pc, mode, prefixTexts, op);
}

function decodeIndexedCB(indexReg, disp, op, refs) {
  var x = op >> 6;
  var y = (op >> 3) & 7;
  var z = op & 7;
  var expr = '(' + indexReg + dispText(disp) + ')';
  var registerTarget = z === 6 ? '' : ',' + r8[z];
  addIndirectRef(refs, 'READ', expr);
  if (x !== 1) addIndirectRef(refs, 'WRITE', expr);
  if (x === 0) return rot[y] + ' ' + expr + registerTarget;
  if (x === 1) return 'BIT ' + y + ',' + expr;
  if (x === 2) return 'RES ' + y + ',' + expr + registerTarget;
  return 'SET ' + y + ',' + expr + registerTarget;
}

function decodeED(start, pc, mode, prefixTexts) {
  var refs = [];
  var op = read8(pc); pc += 1;
  var y = (op >> 3) & 7;
  var z = op & 7;
  var p = y >> 1;
  var rpEd = ['BC', 'DE', 'HL', 'SP'];

  var mlt = new Map([[0x4c, 'BC'], [0x5c, 'DE'], [0x6c, 'HL'], [0x7c, 'SP']]);
  if (mlt.has(op)) return finish(start, pc, prefixTexts, 'MLT ' + mlt.get(op), refs);

  var lea = new Map([
    [0x02, ['BC', 'IX']], [0x03, ['BC', 'IY']], [0x12, ['DE', 'IX']], [0x13, ['DE', 'IY']],
    [0x22, ['HL', 'IX']], [0x23, ['HL', 'IY']], [0x32, ['IX', 'IX']], [0x33, ['IY', 'IY']],
  ]);
  if (lea.has(op)) {
    var pair = lea.get(op);
    var d = read8(pc); pc += 1;
    addRef(refs, 'LEA base=' + pair[1] + ' disp=' + dispText(d));
    return finish(start, pc, prefixTexts, 'LEA ' + pair[0] + ',' + pair[1] + dispText(d), refs);
  }

  if (block.has(op)) {
    var name = block.get(op);
    if (name.startsWith('LD')) { addIndirectRef(refs, 'READ', '(HL)'); addIndirectRef(refs, 'WRITE', '(DE)'); }
    else if (name.startsWith('CP')) addIndirectRef(refs, 'READ', '(HL)');
    else if (name.startsWith('IN')) addIndirectRef(refs, 'WRITE', '(HL)');
    else if (name.startsWith('OT') || name.startsWith('OUT')) addIndirectRef(refs, 'READ', '(HL)');
    return finish(start, pc, prefixTexts, name, refs);
  }

  if ((op & 0xc7) === 0x40) { var dest = y === 6 ? '(C)' : r8[y]; return finish(start, pc, prefixTexts, 'IN ' + dest + ',(C)', refs); }
  if ((op & 0xc7) === 0x41) { var src = y === 6 ? '0' : r8[y]; return finish(start, pc, prefixTexts, 'OUT (C),' + src, refs); }
  if ((op & 0xcf) === 0x42) return finish(start, pc, prefixTexts, 'SBC HL,' + rpEd[p], refs);
  if ((op & 0xcf) === 0x4a) return finish(start, pc, prefixTexts, 'ADC HL,' + rpEd[p], refs);
  if ((op & 0xcf) === 0x43) { var direct = readLE(pc, mode.addressBytes); pc += mode.addressBytes; addDirectRef(refs, 'WRITE', direct); return finish(start, pc, prefixTexts, 'LD (' + addrHex(direct) + '),' + rpEd[p], refs); }
  if ((op & 0xcf) === 0x4b) { var direct2 = readLE(pc, mode.addressBytes); pc += mode.addressBytes; addDirectRef(refs, 'READ', direct2); return finish(start, pc, prefixTexts, 'LD ' + rpEd[p] + ',(' + addrHex(direct2) + ')', refs); }
  if ([0x44, 0x54, 0x64, 0x74].includes(op)) return finish(start, pc, prefixTexts, 'NEG', refs);
  if (op === 0x45 || op === 0x55 || op === 0x65 || op === 0x75) return finish(start, pc, prefixTexts, 'RETN', refs, { isReturn: true });
  if (op === 0x4d || op === 0x5d || op === 0x6d || op === 0x7d) return finish(start, pc, prefixTexts, 'RETI', refs, { isReturn: true });
  if (op === 0x47) return finish(start, pc, prefixTexts, 'LD I,A', refs);
  if (op === 0x4f) return finish(start, pc, prefixTexts, 'LD R,A', refs);
  if (op === 0x57) return finish(start, pc, prefixTexts, 'LD A,I', refs);
  if (op === 0x5f) return finish(start, pc, prefixTexts, 'LD A,R', refs);
  if ([0x46, 0x4e, 0x66, 0x6e].includes(op)) return finish(start, pc, prefixTexts, 'IM 0', refs);
  if ([0x56, 0x76].includes(op)) return finish(start, pc, prefixTexts, 'IM 1', refs);
  if ([0x5e, 0x7e].includes(op)) return finish(start, pc, prefixTexts, 'IM 2', refs);
  if (op === 0x67) { addIndirectRef(refs, 'READ', '(HL)'); addIndirectRef(refs, 'WRITE', '(HL)'); return finish(start, pc, prefixTexts, 'RRD', refs); }
  if (op === 0x6f) { addIndirectRef(refs, 'READ', '(HL)'); addIndirectRef(refs, 'WRITE', '(HL)'); return finish(start, pc, prefixTexts, 'RLD', refs); }
  return finish(start, pc, prefixTexts, 'ED 0x' + hex(op), refs);
}

// ===== Main =====

console.log('=== Phase 567: Decode 0x0A258F-0x0A2694 (4bpp/16bpp column blit paths) ===');
console.log('ROM: ' + romPath + ' (' + rom.length + ' bytes)');
console.log('ADL mode assumed (24-bit default); .SIS/.LIS/.SIL/.LIL prefixes detected.');
console.log('');

// Context: dump a few bytes before to show the 1BPP path exit
console.log('--- Context: last instructions of 1BPP path (before 0x0A258F) ---');
var ctx = 0x0a2585;
while (ctx < REGION_START) {
  var instr = decodeAt(ctx);
  var refs = instr.refs.length ? '  ; ' + instr.refs.join('; ') : '';
  console.log(addrHex(instr.addr) + '  ' + instr.bytes.padEnd(20) + '  ' + instr.text + refs);
  ctx = instr.next;
}
// Remove context instructions from decodedInstructions
decodedInstructions.length = 0;

console.log('');
console.log('--- Main region: 0x' + addrHex(REGION_START) + ' - 0x' + addrHex(REGION_END) + ' (' + (REGION_END - REGION_START) + ' bytes) ---');
console.log('');

var pc = REGION_START;
var instrCount = 0;
var branchTargets = new Set();
var callTargets = new Set();
var externalJumps = new Set();

while (pc < REGION_END) {
  var instr2 = decodeAt(pc);
  var refs2 = instr2.refs.length ? '  ; ' + instr2.refs.join('; ') : '';
  console.log(addrHex(instr2.addr) + '  ' + instr2.bytes.padEnd(20) + '  ' + instr2.text + refs2);
  instrCount += 1;

  if (instr2.next <= pc) {
    console.log('  *** DECODER STALL at ' + addrHex(pc) + ' ***');
    break;
  }

  // Collect branch/call targets
  for (var ref of instr2.refs) {
    var m = ref.match(/-> ([0-9A-F]{6})/);
    if (m) {
      var target = parseInt(m[1], 16);
      if (instr2.text.includes('CALL')) {
        callTargets.add(target);
      } else {
        branchTargets.add(target);
      }
      if (target < REGION_START || target >= REGION_END) {
        externalJumps.add(target);
      }
    }
  }

  pc = instr2.next;
}

// ===== Summary =====
console.log('');
console.log('=== SUMMARY ===');
console.log('Total bytes decoded: ' + (pc - REGION_START) + ' of ' + (REGION_END - REGION_START));
console.log('Instructions: ' + instrCount);
console.log('Final PC: 0x' + addrHex(pc));
console.log('');

console.log('--- Internal branch targets (within region) ---');
var internalTargets = [...branchTargets].filter(function(t) { return t >= REGION_START && t < REGION_END; }).sort(function(a, b) { return a - b; });
for (var t of internalTargets) {
  console.log('  0x' + addrHex(t));
}

console.log('');
console.log('--- External branch/jump targets ---');
for (var t2 of [...externalJumps].sort(function(a, b) { return a - b; })) {
  var cat = classifyAddress(t2);
  console.log('  0x' + addrHex(t2) + (cat ? ' [' + cat + ']' : ''));
}

console.log('');
console.log('--- CALL targets ---');
for (var t3 of [...callTargets].sort(function(a, b) { return a - b; })) {
  var cat2 = classifyAddress(t3);
  console.log('  0x' + addrHex(t3) + (cat2 ? ' [' + cat2 + ']' : ''));
}

console.log('');
console.log('--- RAM/MMIO references ---');
var ramRefs = new Map();
for (var di of decodedInstructions) {
  for (var ref3 of di.refs) {
    var addrMatch = ref3.match(/(READ|WRITE) ([0-9A-F]{6})/);
    if (addrMatch) {
      var addr = parseInt(addrMatch[2], 16);
      if (addr >= 0xd00000 || (addr >= 0x700000 && addr < 0x800000)) {
        if (!ramRefs.has(addrMatch[2])) ramRefs.set(addrMatch[2], []);
        ramRefs.get(addrMatch[2]).push({ addr: di.addr, access: addrMatch[1] });
      }
    }
  }
}
for (var [addr2, accesses] of [...ramRefs].sort()) {
  var cat3 = classifyAddress(parseInt(addr2, 16));
  console.log('  0x' + addr2 + (cat3 ? ' [' + cat3 + ']' : ''));
  for (var a of accesses) {
    console.log('    ' + a.access + ' at 0x' + addrHex(a.addr));
  }
}

console.log('');
console.log('--- IY-indexed accesses (system flags) ---');
var iyAccesses = decodedInstructions.filter(function(i) { return i.text.includes('(IY'); });
for (var iy of iyAccesses) {
  console.log('  ' + addrHex(iy.addr) + '  ' + iy.text);
  var iyMatch = iy.text.match(/\(IY([+-]\d+)\)/);
  if (iyMatch) {
    var offset = parseInt(iyMatch[1]);
    var absAddr = 0xd00080 + offset;
    var cat4 = classifyAddress(absAddr);
    console.log('           -> absolute: 0x' + addrHex(absAddr) + (cat4 ? ' [' + cat4 + ']' : ''));
  }
}

console.log('');
console.log('--- IX-indexed accesses (glyph data) ---');
var ixAccesses = decodedInstructions.filter(function(i) { return i.text.includes('(IX'); });
for (var ix of ixAccesses) {
  console.log('  ' + addrHex(ix.addr) + '  ' + ix.text);
}

console.log('');
console.log('--- Loop structures (DJNZ / backward branches) ---');
var loops = decodedInstructions.filter(function(i) { return i.refs.some(function(r) { return r.includes('BACKWARD') || r.includes('DJNZ'); }); });
for (var lp of loops) {
  console.log('  ' + addrHex(lp.addr) + '  ' + lp.text + '  ; ' + lp.refs.join('; '));
}

console.log('');
console.log('--- Potential function boundaries (RET / JP to outside region) ---');
var boundaries = decodedInstructions.filter(function(i) {
  return i.flags.isReturn || i.refs.some(function(r) { return r.includes('EXIT'); });
});
for (var b of boundaries) {
  console.log('  ' + addrHex(b.addr) + '  ' + b.text + '  ; ' + b.refs.join('; '));
}

console.log('');
console.log('--- Shift/rotate ops (color bit processing) ---');
var shiftOps = decodedInstructions.filter(function(i) {
  return /SLA|SRL|SRA|RL |RR |RLC|RRC|RLCA|RRCA|RLA|RRA/.test(i.text);
});
for (var s of shiftOps) {
  console.log('  ' + addrHex(s.addr) + '  ' + s.text);
}

console.log('');
console.log('--- Color address references (0x7326AA/AC) ---');
var colorRefs = decodedInstructions.filter(function(i) {
  return i.refs.some(function(r) { return r.includes('7326'); });
});
for (var c of colorRefs) {
  console.log('  ' + addrHex(c.addr) + '  ' + c.text + '  ; ' + c.refs.join('; '));
}

console.log('');
console.log('=== END Phase 567 ===');
