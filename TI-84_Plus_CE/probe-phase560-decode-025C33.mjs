import { readFileSync } from 'fs';

const ROM_PATH = 'TI-84_Plus_CE/ROM.rom';
const START = 0x025C33;
const MAX_BYTES = 120;

const rom = readFileSync(ROM_PATH);

const hex = (value, width = 2) => '0x' + value.toString(16).toUpperCase().padStart(width, '0');
const addrHex = (value) => hex(value, 6);
const ramHex = (value) => hex(value, 6);
const byteAt = (addr) => rom[addr];
const u16 = (addr) => byteAt(addr) | (byteAt(addr + 1) << 8);
const u24 = (addr) => byteAt(addr) | (byteAt(addr + 1) << 8) | (byteAt(addr + 2) << 16);
const rel8 = (addr) => {
  const value = byteAt(addr);
  return value < 0x80 ? value : value - 0x100;
};
const bytesHex = (addr, len) =>
  Array.from(rom.slice(addr, addr + len), (b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');

// eZ80 ADL-mode instruction-set prefixes.
// When one of these appears as a standalone opcode in ADL mode, it acts as a
// mode prefix that modifies only the *next* instruction's operand addressing:
//   0x40 = .SIS  — next instruction uses 16-bit (short) operands  (IS = index short)
//   0x49 = .LIS  — next instruction uses 24-bit operands,  index short
//   0x52 = .SIL  — next instruction uses 16-bit operands,  index long
//   0x5B = .LIL  — next instruction uses 24-bit operands,  index long
// In practice the TI-84 CE ROM runs in ADL (24-bit) mode.  The .SIS prefix
// makes the immediately-following instruction treat nn/nnnn as 16-bit rather
// than 24-bit, so a prefixed ED 5B / 2A / 22 / etc. consumes only 2 address
// bytes (not 3).
const MODE_PREFIX_NAMES = new Map([
  [0x40, '.SIS'],
  [0x49, '.LIS'],
  [0x52, '.SIL'],
  [0x5B, '.LIL'],
]);

const isModePrefix = (op) => MODE_PREFIX_NAMES.has(op);

const ramNames = new Map([
  [0xD00596, 'D00596 column counter'],
  [0xD00595, 'D00595 column position'],
  [0xD02505, 'D02505 column limit'],
  [0xD0231A, 'D0231A cursor position'],
  [0xD0231D, 'D0231D cursor state'],
  [0xD008D5, 'D008D5 primary Y coordinate'],
  [0xD014FE, 'D014FE cursor Y'],
  [0xD008D2, 'D008D2 X/width coordinate'],
  [0x0108D2, '0x0108D2 unknown (seen via .SIS LD HL)'],
  [0x00017F, '0x00017F unknown (seen via .SIS LD DE)'],
]);

const observations = {
  calls: [],
  jumps: [],
  ramReads: [],
  ramWrites: [],
};

const recordCall = (addr, pc, mnemonic) => {
  observations.calls.push({ pc: addrHex(pc), target: addrHex(addr), mnemonic });
};
const recordJump = (addr, pc, mnemonic) => {
  observations.jumps.push({ pc: addrHex(pc), target: addrHex(addr), mnemonic });
};
const recordRamRead = (addr, pc, mnemonic) => {
  observations.ramReads.push({ pc: addrHex(pc), target: ramHex(addr), name: ramNames.get(addr) ?? null, mnemonic });
};
const recordRamWrite = (addr, pc, mnemonic) => {
  observations.ramWrites.push({ pc: addrHex(pc), target: ramHex(addr), name: ramNames.get(addr) ?? null, mnemonic });
};

// ---- ED-prefix handler --------------------------------------------------
// addrLen: 2 in .SIS mode, 3 in ADL mode (default).
const decodeEd = (pc, addrLen) => {
  const op = byteAt(pc + 1);

  // Block-copy / compare / IO instructions (all 2 bytes total).
  const twoByteED = new Map([
    [0x44, 'NEG'], [0x45, 'RETN'], [0x46, 'IM 0'], [0x47, 'LD I,A'],
    [0x4D, 'RETI'], [0x56, 'IM 1'], [0x57, 'LD A,I'], [0x5E, 'IM 2'],
    [0x52, 'SBC HL,DE'], [0x42, 'SBC HL,BC'], [0x62, 'SBC HL,HL'], [0x72, 'SBC HL,SP'],
    [0x4A, 'ADC HL,BC'], [0x5A, 'ADC HL,DE'], [0x6A, 'ADC HL,HL'], [0x7A, 'ADC HL,SP'],
    [0x67, 'RRD'], [0x6F, 'RLD'],
    [0xA0, 'LDI'], [0xA1, 'CPI'], [0xA2, 'INI'], [0xA3, 'OUTI'],
    [0xA8, 'LDD'], [0xA9, 'CPD'], [0xAA, 'IND'], [0xAB, 'OUTD'],
    [0xB0, 'LDIR'], [0xB1, 'CPIR'], [0xB2, 'INIR'], [0xB3, 'OTIR'],
    [0xB8, 'LDDR'], [0xB9, 'CPDR'], [0xBA, 'INDR'], [0xBB, 'OTDR'],
  ]);
  if (twoByteED.has(op)) {
    return { len: 2, mnemonic: twoByteED.get(op), comment: '' };
  }

  // 16-bit register load/store with memory address.
  // In ADL mode the address is 3 bytes; in .SIS mode only 2 bytes.
  const regForEDOp = new Map([
    [0x43, 'BC'], [0x4B, 'BC'],
    [0x53, 'DE'], [0x5B, 'DE'],
    [0x63, 'HL'], [0x6B, 'HL'],
    [0x73, 'SP'], [0x7B, 'SP'],
  ]);
  if (regForEDOp.has(op)) {
    const reg = regForEDOp.get(op);
    const isLoad = (op & 0x08) !== 0; // load: 4B/5B/6B/7B; store: 43/53/63/73
    let addr, totalLen;
    if (addrLen === 2) {
      addr = u16(pc + 2);
      totalLen = 4; // ED op + 2-byte addr
    } else {
      addr = u24(pc + 2);
      totalLen = 5; // ED op + 3-byte addr
    }
    const mnemonic = isLoad
      ? `LD ${reg},(${ramHex(addr)})`
      : `LD (${ramHex(addr)}),${reg}`;
    if (isLoad) recordRamRead(addr, pc, mnemonic);
    else recordRamWrite(addr, pc, mnemonic);
    return { len: totalLen, mnemonic, comment: ramNames.get(addr) ?? '' };
  }

  return { len: 2, mnemonic: `ED ${hex(op)}`, comment: 'unhandled ED opcode' };
};

// ---- Main per-instruction decode ----------------------------------------
// addrLen: 3 = ADL (normal), 2 = .SIS mode (set when we consumed a 0x40 prefix).
const decodeOne = (pc, addrLen = 3) => {
  const op = byteAt(pc);

  if (op === 0xED) return decodeEd(pc, addrLen);

  // IY / IX prefix.
  if (op === 0xFD || op === 0xDD) {
    const reg = op === 0xFD ? 'IY' : 'IX';
    const subOp = byteAt(pc + 1);
    if (subOp === 0xCB) {
      const disp = rel8(pc + 2);
      const cb = byteAt(pc + 3);
      const group = cb >> 6;
      const bit = (cb >> 3) & 7;
      const names = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'];
      const target = `(${reg}${disp < 0 ? '' : '+'}${disp})`;
      const mnemonic = group === 0 ? `${names[bit]} ${target}`
        : group === 1 ? `BIT ${bit},${target}`
        : group === 2 ? `RES ${bit},${target}`
        : `SET ${bit},${target}`;
      return { len: 4, mnemonic, comment: '' };
    }
    const loadMap = new Map([
      [0x46, 'B'], [0x4E, 'C'], [0x56, 'D'], [0x5E, 'E'], [0x66, 'H'], [0x6E, 'L'], [0x7E, 'A'],
      [0x70, 'B'], [0x71, 'C'], [0x72, 'D'], [0x73, 'E'], [0x74, 'H'], [0x75, 'L'], [0x77, 'A'],
    ]);
    if (loadMap.has(subOp)) {
      const disp = rel8(pc + 2);
      const r = loadMap.get(subOp);
      const isWrite = subOp >= 0x70 && subOp <= 0x77;
      const mnemonic = isWrite
        ? `LD (${reg}${disp < 0 ? '' : '+'}${disp}),${r}`
        : `LD ${r},(${reg}${disp < 0 ? '' : '+'}${disp})`;
      return { len: 3, mnemonic, comment: '' };
    }
    if (subOp === 0x21) {
      const imm = addrLen === 2 ? u16(pc + 2) : u24(pc + 2);
      return { len: addrLen === 2 ? 4 : 5, mnemonic: `LD ${reg},${hex(imm, 4)}`, comment: '' };
    }
    if (subOp === 0x36) {
      const disp = rel8(pc + 2);
      const imm = byteAt(pc + 3);
      return { len: 4, mnemonic: `LD (${reg}${disp < 0 ? '' : '+'}${disp}),${hex(imm)}`, comment: '' };
    }
    if (subOp === 0x34) { const disp = rel8(pc + 2); return { len: 3, mnemonic: `INC (${reg}${disp < 0 ? '' : '+'}${disp})`, comment: '' }; }
    if (subOp === 0x35) { const disp = rel8(pc + 2); return { len: 3, mnemonic: `DEC (${reg}${disp < 0 ? '' : '+'}${disp})`, comment: '' }; }
    if (subOp === 0xE5) return { len: 2, mnemonic: `PUSH ${reg}`, comment: '' };
    if (subOp === 0xE1) return { len: 2, mnemonic: `POP ${reg}`, comment: '' };
    if (subOp === 0x23) return { len: 2, mnemonic: `INC ${reg}`, comment: '' };
    if (subOp === 0x2B) return { len: 2, mnemonic: `DEC ${reg}`, comment: '' };
    if (subOp === 0xE9) return { len: 2, mnemonic: `JP (${reg})`, comment: '' };
    if (subOp === 0xF9) return { len: 2, mnemonic: `LD SP,${reg}`, comment: '' };
    return { len: 2, mnemonic: `${reg} prefix ${hex(subOp)}`, comment: 'unhandled IX/IY opcode' };
  }

  // CB prefix (bit manipulation).
  if (op === 0xCB) {
    const subOp = byteAt(pc + 1);
    const regs8 = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
    const group = subOp >> 6;
    const bit = (subOp >> 3) & 7;
    const r = regs8[subOp & 7];
    const names = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'];
    const mnemonic = group === 0 ? `${names[bit]} ${r}`
      : group === 1 ? `BIT ${bit},${r}`
      : group === 2 ? `RES ${bit},${r}`
      : `SET ${bit},${r}`;
    return { len: 2, mnemonic, comment: '' };
  }

  // Simple 1-byte instructions.
  const simple1 = new Map([
    [0x00, 'NOP'], [0x02, 'LD (BC),A'], [0x07, 'RLCA'], [0x08, "EX AF,AF'"],
    [0x0A, 'LD A,(BC)'], [0x0F, 'RRCA'],
    [0x12, 'LD (DE),A'], [0x17, 'RLA'], [0x19, 'ADD HL,DE'], [0x1A, 'LD A,(DE)'],
    [0x1F, 'RRA'], [0x27, 'DAA'], [0x29, 'ADD HL,HL'], [0x2F, 'CPL'],
    [0x37, 'SCF'], [0x39, 'ADD HL,SP'], [0x3F, 'CCF'],
    [0x76, 'HALT'], [0x77, 'LD (HL),A'], [0x7E, 'LD A,(HL)'],
    [0xAF, 'XOR A'], [0xB7, 'OR A'], [0xEB, 'EX DE,HL'], [0xD9, 'EXX'],
    [0xC9, 'RET'], [0xD3, 'OUT (n),A'],
    [0x03, 'INC BC'], [0x04, 'INC B'], [0x05, 'DEC B'],
    [0x0B, 'DEC BC'], [0x0C, 'INC C'], [0x0D, 'DEC C'],
    [0x13, 'INC DE'], [0x14, 'INC D'], [0x15, 'DEC D'],
    [0x1B, 'DEC DE'], [0x1C, 'INC E'], [0x1D, 'DEC E'],
    [0x23, 'INC HL'], [0x24, 'INC H'], [0x25, 'DEC H'],
    [0x2B, 'DEC HL'], [0x2C, 'INC L'], [0x2D, 'DEC L'],
    [0x33, 'INC SP'], [0x34, 'INC (HL)'], [0x35, 'DEC (HL)'],
    [0x3B, 'DEC SP'], [0x3C, 'INC A'], [0x3D, 'DEC A'],
    [0xC0, 'RET NZ'], [0xC1, 'POP BC'], [0xC5, 'PUSH BC'], [0xC8, 'RET Z'],
    [0xD0, 'RET NC'], [0xD1, 'POP DE'], [0xD5, 'PUSH DE'], [0xD8, 'RET C'],
    [0xE0, 'RET PO'], [0xE1, 'POP HL'], [0xE3, 'EX (SP),HL'], [0xE5, 'PUSH HL'],
    [0xE8, 'RET PE'], [0xE9, 'JP (HL)'],
    [0xF0, 'RET P'], [0xF1, 'POP AF'], [0xF3, 'DI'], [0xF5, 'PUSH AF'],
    [0xF8, 'RET M'], [0xF9, 'LD SP,HL'], [0xFB, 'EI'],
  ]);
  if (simple1.has(op)) {
    return { len: 1, mnemonic: simple1.get(op), comment: '' };
  }

  // LD r,r / LD r,(HL) / LD (HL),r (0x40–0x7F, excluding 0x76=HALT already above).
  if (op >= 0x40 && op <= 0x7F) {
    const regs8 = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
    return { len: 1, mnemonic: `LD ${regs8[(op >> 3) & 7]},${regs8[op & 7]}`, comment: '' };
  }

  // ALU op,r (0x80–0xBF).
  if (op >= 0x80 && op <= 0xBF) {
    const alu = ['ADD A', 'ADC A', 'SUB', 'SBC A', 'AND', 'XOR', 'OR', 'CP'];
    const regs8 = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
    return { len: 1, mnemonic: `${alu[(op >> 3) & 7]} ${regs8[op & 7]}`, comment: '' };
  }

  // LD r,n (8-bit immediate).
  if ([0x06, 0x0E, 0x16, 0x1E, 0x26, 0x2E, 0x36, 0x3E].includes(op)) {
    const dst = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
    const idx = [0x06, 0x0E, 0x16, 0x1E, 0x26, 0x2E, 0x36, 0x3E].indexOf(op);
    return { len: 2, mnemonic: `LD ${dst[idx]},${hex(byteAt(pc + 1))}`, comment: '' };
  }

  // LD rr,nn (16-bit/24-bit immediate load).
  // In ADL mode nn = 3 bytes; in .SIS mode nn = 2 bytes.
  if ([0x01, 0x11, 0x21, 0x31].includes(op)) {
    const regs16 = { 0x01: 'BC', 0x11: 'DE', 0x21: 'HL', 0x31: 'SP' };
    const imm = addrLen === 2 ? u16(pc + 1) : u24(pc + 1);
    return { len: 1 + addrLen, mnemonic: `LD ${regs16[op]},${hex(imm, addrLen * 2)}`, comment: '' };
  }

  // LD HL,(nn) — in ADL mode nn is 3 bytes; in .SIS mode nn is 2 bytes.
  if (op === 0x2A) {
    const addr = addrLen === 2 ? u16(pc + 1) : u24(pc + 1);
    const mnemonic = `LD HL,(${ramHex(addr)})`;
    recordRamRead(addr, pc, mnemonic);
    return { len: 1 + addrLen, mnemonic, comment: ramNames.get(addr) ?? '' };
  }

  // LD (nn),HL — in ADL mode nn is 3 bytes; in .SIS mode nn is 2 bytes.
  if (op === 0x22) {
    const addr = addrLen === 2 ? u16(pc + 1) : u24(pc + 1);
    const mnemonic = `LD (${ramHex(addr)}),HL`;
    recordRamWrite(addr, pc, mnemonic);
    return { len: 1 + addrLen, mnemonic, comment: ramNames.get(addr) ?? '' };
  }

  // LD A,(nn) — in ADL mode nn is 3 bytes; in .SIS mode nn is 2 bytes.
  if (op === 0x3A) {
    const addr = addrLen === 2 ? u16(pc + 1) : u24(pc + 1);
    const mnemonic = `LD A,(${ramHex(addr)})`;
    recordRamRead(addr, pc, mnemonic);
    return { len: 1 + addrLen, mnemonic, comment: ramNames.get(addr) ?? '' };
  }

  // LD (nn),A — in ADL mode nn is 3 bytes; in .SIS mode nn is 2 bytes.
  if (op === 0x32) {
    const addr = addrLen === 2 ? u16(pc + 1) : u24(pc + 1);
    const mnemonic = `LD (${ramHex(addr)}),A`;
    recordRamWrite(addr, pc, mnemonic);
    return { len: 1 + addrLen, mnemonic, comment: ramNames.get(addr) ?? '' };
  }

  // Relative branches (JR).
  if ([0x18, 0x20, 0x28, 0x30, 0x38].includes(op)) {
    const conds = { 0x18: 'JR', 0x20: 'JR NZ', 0x28: 'JR Z', 0x30: 'JR NC', 0x38: 'JR C' };
    const target = pc + 2 + rel8(pc + 1);
    const mnemonic = `${conds[op]} ${addrHex(target)}`;
    recordJump(target, pc, mnemonic);
    return { len: 2, mnemonic, comment: '' };
  }

  // DJNZ.
  if (op === 0x10) {
    const target = pc + 2 + rel8(pc + 1);
    const mnemonic = `DJNZ ${addrHex(target)}`;
    recordJump(target, pc, mnemonic);
    return { len: 2, mnemonic, comment: '' };
  }

  // Absolute jumps (JP cc,nn and JP nn).
  if ([0xC2, 0xCA, 0xD2, 0xDA, 0xE2, 0xEA, 0xF2, 0xFA, 0xC3].includes(op)) {
    const conds = {
      0xC2: 'JP NZ', 0xCA: 'JP Z', 0xD2: 'JP NC', 0xDA: 'JP C',
      0xE2: 'JP PO', 0xEA: 'JP PE', 0xF2: 'JP P', 0xFA: 'JP M', 0xC3: 'JP',
    };
    const target = u24(pc + 1);
    const mnemonic = `${conds[op]} ${addrHex(target)}`;
    recordJump(target, pc, mnemonic);
    return { len: 4, mnemonic, comment: '' };
  }

  // CALL cc,nn and CALL nn.
  if ([0xC4, 0xCC, 0xD4, 0xDC, 0xE4, 0xEC, 0xF4, 0xFC, 0xCD].includes(op)) {
    const conds = {
      0xC4: 'CALL NZ', 0xCC: 'CALL Z', 0xD4: 'CALL NC', 0xDC: 'CALL C',
      0xE4: 'CALL PO', 0xEC: 'CALL PE', 0xF4: 'CALL P', 0xFC: 'CALL M', 0xCD: 'CALL',
    };
    const target = u24(pc + 1);
    const mnemonic = `${conds[op]} ${addrHex(target)}`;
    recordCall(target, pc, mnemonic);
    return { len: 4, mnemonic, comment: '' };
  }

  // ALU with 8-bit immediate.
  const aluImm = new Map([
    [0xC6, 'ADD A'], [0xCE, 'ADC A'], [0xD6, 'SUB'], [0xDE, 'SBC A'],
    [0xE6, 'AND'], [0xEE, 'XOR'], [0xF6, 'OR'], [0xFE, 'CP'],
  ]);
  if (aluImm.has(op)) {
    return { len: 2, mnemonic: `${aluImm.get(op)},${hex(byteAt(pc + 1))}`, comment: '' };
  }

  // RST.
  if ((op & 0xC7) === 0xC7) {
    return { len: 1, mnemonic: `RST ${hex(op & 0x38)}`, comment: '' };
  }

  return { len: 1, mnemonic: `DB ${hex(op)}`, comment: 'unknown opcode — possible decode error; check surrounding prefix handling' };
};

// ---- Top-level disassembly loop with prefix handling --------------------
// The eZ80 mode-prefix bytes (0x40/0x49/0x52/0x5B) consume one byte and then
// modify the *next* instruction's operand size.  We handle them by recording a
// prefix row in the listing and passing addrLen=2 into the next decodeOne call.

const listing = [];
let pc = START;
let stoppedOnRet = false;

while (pc < START + MAX_BYTES && pc < rom.length) {
  const op = byteAt(pc);

  if (isModePrefix(op)) {
    // Emit the prefix as its own row, then decode the next instruction in SIS/LIS mode.
    const prefixName = MODE_PREFIX_NAMES.get(op);
    listing.push({
      address: addrHex(pc),
      bytes: bytesHex(pc, 1),
      instruction: prefixName,
      comment: `eZ80 mode prefix — next instruction uses ${op === 0x40 || op === 0x52 ? '16' : '24'}-bit operand addressing`,
    });
    pc += 1;

    // Now decode the prefixed instruction.
    // .SIS (0x40) and .SIL (0x52) both use 16-bit (2-byte) addresses for nn.
    // .LIS (0x49) and .LIL (0x5B) use 24-bit (3-byte) addresses (same as default ADL).
    const addrLen = (op === 0x40 || op === 0x52) ? 2 : 3;
    const decoded = decodeOne(pc, addrLen);
    listing.push({
      address: addrHex(pc),
      bytes: bytesHex(pc, decoded.len),
      instruction: decoded.mnemonic,
      comment: decoded.comment ? `[${prefixName}] ${decoded.comment}` : `[${prefixName}]`,
    });
    pc += decoded.len;

    if (/^RET(?: |$)/.test(decoded.mnemonic)) {
      stoppedOnRet = true;
      break;
    }
    continue;
  }

  const decoded = decodeOne(pc);
  listing.push({
    address: addrHex(pc),
    bytes: bytesHex(pc, decoded.len),
    instruction: decoded.mnemonic,
    comment: decoded.comment,
  });
  pc += decoded.len;

  if (/^RET(?: |$)/.test(decoded.mnemonic)) {
    stoppedOnRet = true;
    break;
  }
}

// ---- Output --------------------------------------------------------------
console.log('Probe phase 560: quick newline delegate at 0x025C33');
console.log(`ROM: ${ROM_PATH}`);
console.log(`Window: ${addrHex(START)}..${addrHex(pc - 1)} (${pc - START} bytes decoded)`);
console.log('');
console.log('Disassembly:');
for (const row of listing) {
  const comment = row.comment ? ` ; ${row.comment}` : '';
  console.log(`${row.address}: ${row.bytes.padEnd(16)} ${row.instruction}${comment}`);
}

const summary = {
  start: addrHex(START),
  bytesDecoded: pc - START,
  stoppedOnRet,
  calls: observations.calls,
  jumps: observations.jumps,
  ramReads: observations.ramReads,
  ramWrites: observations.ramWrites,
  knownCallTargets: {
    '0x04C979': 'width clipping helper',
    '0x0A23E5': 'blit loop',
  },
};

console.log('');
console.log('Structured summary:');
console.log(JSON.stringify(summary, null, 2));
