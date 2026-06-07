import { readFileSync } from 'fs';

const ROM_PATH = 'TI-84_Plus_CE/ROM.rom';
const START = 0x0A2032;
const MAX_BYTES = 200;

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
const bytesHex = (addr, len) => Array.from(rom.slice(addr, addr + len), (b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');

const ramNames = new Map([
  [0xD00596, 'D00596 column counter'],
  [0xD00595, 'D00595 current column position'],
  [0xD02505, 'D02505 column limit'],
  [0xD0231A, 'D0231A cursor position'],
  [0xD0231D, 'D0231D cursor state'],
  [0xD008D5, 'D008D5 primary Y coordinate'],
  [0xD014FE, 'D014FE cursor Y'],
  [0xD00080 + 0x2D, 'IY+0x2D font size backing byte'],
]);

const targetComment = (addr, mode = 'touches') => {
  const name = ramNames.get(addr);
  if (!name) return '';
  if (addr === 0xD00596) return `${mode} ${name}; likely column wrap/reset state`;
  if (addr === 0xD008D5 || addr === 0xD014FE || addr === 0xD0231A) return `${mode} ${name}; possible row/Y advance`;
  return `${mode} ${name}`;
};

const observations = {
  columnReset: [],
  yAdvance: [],
  scrollCalls: [],
  ramWrites: [],
  ramReads: [],
  iyFontSizeRefs: [],
  calls: [],
};

const recordRamWrite = (addr, pc, mnemonic) => {
  observations.ramWrites.push({ pc: addrHex(pc), target: ramHex(addr), name: ramNames.get(addr) ?? null, mnemonic });
  if (addr === 0xD00596) observations.columnReset.push({ pc: addrHex(pc), mnemonic });
  if (addr === 0xD008D5 || addr === 0xD014FE || addr === 0xD0231A) observations.yAdvance.push({ pc: addrHex(pc), target: ramHex(addr), mnemonic });
};

const recordRamRead = (addr, pc, mnemonic) => {
  observations.ramReads.push({ pc: addrHex(pc), target: ramHex(addr), name: ramNames.get(addr) ?? null, mnemonic });
};

const annotateCall = (addr, pc, mnemonic) => {
  observations.calls.push({ pc: addrHex(pc), target: addrHex(addr), mnemonic });
  if (addr >= 0x05AD00 && addr <= 0x05ADFF) {
    observations.scrollCalls.push({ pc: addrHex(pc), target: addrHex(addr), mnemonic, note: 'CALL target is in the known 0x05AD scroll module range' });
    return 'calls known scroll module range';
  }
  if (addr >= 0x05AD00 && addr < 0x05AE00) return 'calls scroll-related 0x05ADxx range';
  return '';
};

const decodeEd = (pc) => {
  const op = byteAt(pc + 1);
  if (op === 0x7B || op === 0x73 || op === 0x4B || op === 0x43 || op === 0x5B || op === 0x53 || op === 0x6B || op === 0x63) {
    const addr = u24(pc + 2);
    const regs = { 0x7B: 'SP', 0x73: 'SP', 0x4B: 'BC', 0x43: 'BC', 0x5B: 'DE', 0x53: 'DE', 0x6B: 'HL', 0x63: 'HL' };
    const isLoadFromMem = [0x4B, 0x5B, 0x6B, 0x7B].includes(op);
    const mnemonic = isLoadFromMem ? `LD ${regs[op]},(${ramHex(addr)})` : `LD (${ramHex(addr)}),${regs[op]}`;
    if (isLoadFromMem) recordRamRead(addr, pc, mnemonic);
    else recordRamWrite(addr, pc, mnemonic);
    return { len: 5, mnemonic, comment: targetComment(addr, isLoadFromMem ? 'reads' : 'writes') };
  }
  return { len: 2, mnemonic: `ED ${hex(op)}`, comment: 'unhandled ED extended opcode; inspect eZ80 manual if this is relevant' };
};

const decodeIndexed = (pc, reg) => {
  const op = byteAt(pc + 1);
  if (op === 0xCB) {
    const disp = rel8(pc + 2);
    const cb = byteAt(pc + 3);
    const group = cb >> 6;
    const bit = (cb >> 3) & 7;
    const names = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'];
    const mnemonic = group === 0 ? `${names[bit]} (${reg}${disp < 0 ? '' : '+'}${disp})`
      : group === 1 ? `BIT ${bit},(${reg}${disp < 0 ? '' : '+'}${disp})`
      : group === 2 ? `RES ${bit},(${reg}${disp < 0 ? '' : '+'}${disp})`
      : `SET ${bit},(${reg}${disp < 0 ? '' : '+'}${disp})`;
    return { len: 4, mnemonic, comment: reg === 'IY' && disp === 0x2D ? 'references IY+0x2D font size' : '' };
  }
  const dispOps = new Map([
    [0x34, 'INC'], [0x35, 'DEC'],
  ]);
  if (dispOps.has(op)) {
    const disp = rel8(pc + 2);
    const mnemonic = `${dispOps.get(op)} (${reg}${disp < 0 ? '' : '+'}${disp})`;
    if (reg === 'IY' && disp === 0x2D) observations.iyFontSizeRefs.push({ pc: addrHex(pc), mnemonic });
    return { len: 3, mnemonic, comment: reg === 'IY' && disp === 0x2D ? 'updates IY+0x2D font size byte' : '' };
  }
  if (op === 0x36) {
    const disp = rel8(pc + 2);
    const imm = byteAt(pc + 3);
    const mnemonic = `LD (${reg}${disp < 0 ? '' : '+'}${disp}),${hex(imm)}`;
    if (reg === 'IY' && disp === 0x2D) observations.iyFontSizeRefs.push({ pc: addrHex(pc), mnemonic });
    return { len: 4, mnemonic, comment: reg === 'IY' && disp === 0x2D ? 'writes IY+0x2D font size byte' : '' };
  }
  const loadMap = new Map([[0x46, 'B'], [0x4E, 'C'], [0x56, 'D'], [0x5E, 'E'], [0x66, 'H'], [0x6E, 'L'], [0x7E, 'A'], [0x70, 'B'], [0x71, 'C'], [0x72, 'D'], [0x73, 'E'], [0x74, 'H'], [0x75, 'L'], [0x77, 'A']]);
  if (loadMap.has(op)) {
    const disp = rel8(pc + 2);
    const r = loadMap.get(op);
    const isWrite = op >= 0x70 && op <= 0x77;
    const mnemonic = isWrite ? `LD (${reg}${disp < 0 ? '' : '+'}${disp}),${r}` : `LD ${r},(${reg}${disp < 0 ? '' : '+'}${disp})`;
    if (reg === 'IY' && disp === 0x2D) observations.iyFontSizeRefs.push({ pc: addrHex(pc), mnemonic });
    return { len: 3, mnemonic, comment: reg === 'IY' && disp === 0x2D ? `${isWrite ? 'writes' : 'reads'} IY+0x2D font size byte` : '' };
  }
  return { len: 2, mnemonic: `${reg} prefix ${hex(op)}`, comment: 'unhandled indexed opcode' };
};

const decode = (pc) => {
  const op = byteAt(pc);
  if (op === 0xED) return decodeEd(pc);
  if (op === 0xDD) return decodeIndexed(pc, 'IX');
  if (op === 0xFD) return decodeIndexed(pc, 'IY');

  const simple = {
    0x00: ['NOP', 1], 0x03: ['INC BC', 1], 0x04: ['INC B', 1], 0x05: ['DEC B', 1], 0x07: ['RLCA', 1],
    0x0A: ['LD A,(BC)', 1], 0x0B: ['DEC BC', 1], 0x0C: ['INC C', 1], 0x0D: ['DEC C', 1], 0x0F: ['RRCA', 1],
    0x13: ['INC DE', 1], 0x14: ['INC D', 1], 0x15: ['DEC D', 1], 0x17: ['RLA', 1], 0x19: ['ADD HL,DE', 1],
    0x1A: ['LD A,(DE)', 1], 0x1B: ['DEC DE', 1], 0x1C: ['INC E', 1], 0x1D: ['DEC E', 1], 0x1F: ['RRA', 1],
    0x23: ['INC HL', 1], 0x24: ['INC H', 1], 0x25: ['DEC H', 1], 0x27: ['DAA', 1], 0x29: ['ADD HL,HL', 1],
    0x2A: ['LD HL,(nn)', 4], 0x2B: ['DEC HL', 1], 0x2C: ['INC L', 1], 0x2D: ['DEC L', 1], 0x2F: ['CPL', 1],
    0x33: ['INC SP', 1], 0x34: ['INC (HL)', 1], 0x35: ['DEC (HL)', 1], 0x37: ['SCF', 1], 0x39: ['ADD HL,SP', 1],
    0x3A: ['LD A,(nn)', 4], 0x3B: ['DEC SP', 1], 0x3C: ['INC A', 1], 0x3D: ['DEC A', 1], 0x3F: ['CCF', 1],
    0x76: ['HALT', 1], 0x7E: ['LD A,(HL)', 1], 0x77: ['LD (HL),A', 1], 0xAF: ['XOR A', 1], 0xB7: ['OR A', 1],
    0xC0: ['RET NZ', 1], 0xC8: ['RET Z', 1], 0xC9: ['RET', 1], 0xD0: ['RET NC', 1], 0xD8: ['RET C', 1],
    0xE0: ['RET PO', 1], 0xE8: ['RET PE', 1], 0xF0: ['RET P', 1], 0xF8: ['RET M', 1],
    0xC5: ['PUSH BC', 1], 0xD5: ['PUSH DE', 1], 0xE5: ['PUSH HL', 1], 0xF5: ['PUSH AF', 1],
    0xC1: ['POP BC', 1], 0xD1: ['POP DE', 1], 0xE1: ['POP HL', 1], 0xF1: ['POP AF', 1],
  };
  if (simple[op]) {
    const [mnemonic, len] = simple[op];
    let resolved = mnemonic;
    let comment = '';
    if ((op === 0x2A || op === 0x3A) && len === 4) {
      const addr = u24(pc + 1);
      resolved = op === 0x2A ? `LD HL,(${ramHex(addr)})` : `LD A,(${ramHex(addr)})`;
      recordRamRead(addr, pc, resolved);
      comment = targetComment(addr, 'reads');
    }
    return { len, mnemonic: resolved, comment };
  }

  if ([0x01, 0x11, 0x21, 0x31].includes(op)) {
    const regs = { 0x01: 'BC', 0x11: 'DE', 0x21: 'HL', 0x31: 'SP' };
    return { len: 4, mnemonic: `LD ${regs[op]},${hex(u24(pc + 1), 6)}`, comment: '' };
  }
  if ([0x06, 0x0E, 0x16, 0x1E, 0x26, 0x2E, 0x36, 0x3E].includes(op)) {
    const regs = { 0x06: 'B', 0x0E: 'C', 0x16: 'D', 0x1E: 'E', 0x26: 'H', 0x2E: 'L', 0x36: '(HL)', 0x3E: 'A' };
    return { len: 2, mnemonic: `LD ${regs[op]},${hex(byteAt(pc + 1))}`, comment: '' };
  }
  if ([0x18, 0x20, 0x28, 0x30, 0x38].includes(op)) {
    const cond = { 0x18: 'JR', 0x20: 'JR NZ', 0x28: 'JR Z', 0x30: 'JR NC', 0x38: 'JR C' };
    const target = pc + 2 + rel8(pc + 1);
    return { len: 2, mnemonic: `${cond[op]} ${addrHex(target)}`, comment: 'relative branch inside line-wrap handler' };
  }
  if ([0xC2, 0xCA, 0xD2, 0xDA, 0xE2, 0xEA, 0xF2, 0xFA, 0xC3].includes(op)) {
    const cond = { 0xC2: 'JP NZ', 0xCA: 'JP Z', 0xD2: 'JP NC', 0xDA: 'JP C', 0xE2: 'JP PO', 0xEA: 'JP PE', 0xF2: 'JP P', 0xFA: 'JP M', 0xC3: 'JP' };
    return { len: 4, mnemonic: `${cond[op]} ${addrHex(u24(pc + 1))}`, comment: 'absolute branch; follow target if summary is inconclusive' };
  }
  if ([0xC4, 0xCC, 0xD4, 0xDC, 0xE4, 0xEC, 0xF4, 0xFC, 0xCD].includes(op)) {
    const cond = { 0xC4: 'CALL NZ', 0xCC: 'CALL Z', 0xD4: 'CALL NC', 0xDC: 'CALL C', 0xE4: 'CALL PO', 0xEC: 'CALL PE', 0xF4: 'CALL P', 0xFC: 'CALL M', 0xCD: 'CALL' };
    const addr = u24(pc + 1);
    const mnemonic = `${cond[op]} ${addrHex(addr)}`;
    return { len: 4, mnemonic, comment: annotateCall(addr, pc, mnemonic) };
  }
  if ([0x32, 0x22].includes(op)) {
    const addr = u24(pc + 1);
    const mnemonic = op === 0x32 ? `LD (${ramHex(addr)}),A` : `LD (${ramHex(addr)}),HL`;
    recordRamWrite(addr, pc, mnemonic);
    return { len: 4, mnemonic, comment: targetComment(addr, 'writes') };
  }

  if (op >= 0x40 && op <= 0x7F) {
    const regs = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
    return { len: 1, mnemonic: `LD ${regs[(op >> 3) & 7]},${regs[op & 7]}`, comment: '' };
  }
  if (op >= 0x80 && op <= 0xBF) {
    const alu = ['ADD A', 'ADC A', 'SUB', 'SBC A', 'AND', 'XOR', 'OR', 'CP'];
    const regs = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
    return { len: 1, mnemonic: `${alu[(op >> 3) & 7]} ${regs[op & 7]}`, comment: '' };
  }

  return { len: 1, mnemonic: `DB ${hex(op)}`, comment: 'unknown/unimplemented opcode in this lightweight decoder' };
};

const listing = [];
let pc = START;
let stoppedOnRet = false;

while (pc < START + MAX_BYTES && pc < rom.length) {
  const decoded = decode(pc);
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

const summary = {
  start: addrHex(START),
  bytesDecoded: pc - START,
  stoppedOnRet,
  columnCounterReset: observations.columnReset.length
    ? observations.columnReset
    : 'No direct D00596 write was decoded in this window; check indirect writes through HL/DE or branch targets.',
  yOrRowAdvance: observations.yAdvance.length
    ? observations.yAdvance
    : 'No direct D008D5/D014FE/D0231A write was decoded in this window; check helper calls and indirect writes.',
  scrollModuleCalls: observations.scrollCalls.length
    ? observations.scrollCalls
    : 'No direct CALL into 0x05ADxx scroll module range was decoded in this window.',
  iyFontSizeReferences: observations.iyFontSizeRefs.length
    ? observations.iyFontSizeRefs
    : 'No IY+0x2D reference was decoded in this window.',
  ramWrites: observations.ramWrites,
  ramReadsOfKnownAddresses: observations.ramReads.filter((entry) => entry.name),
  calls: observations.calls,
};

console.log('Decode probe: 0x0A2032 line wrap / column reset handler');
console.log(`ROM: ${ROM_PATH}`);
console.log(`Window: ${addrHex(START)}..${addrHex(pc - 1)} (${pc - START} bytes)`);
console.log('');
console.log('Disassembly:');
for (const row of listing) {
  const comment = row.comment ? ` ; ${row.comment}` : '';
  console.log(`${row.address}: ${row.bytes.padEnd(14)} ${row.instruction}${comment}`);
}
console.log('');
console.log('Structured summary:');
console.log(JSON.stringify(summary, null, 2));
