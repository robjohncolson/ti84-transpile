import { readFileSync } from 'fs';

const ROM_PATH = 'TI-84_Plus_CE/ROM.rom';
const START = 0x0A2013;
// Decode through 0x0A2040 + a little margin so we don't stop early.
// The function has two conditional RETs before the final RET at ~0x0A2030,
// so we must NOT stop on conditional RETs — only on unconditional RET (0xC9)
// after we have passed the guard region (first ~8 bytes).
const GUARD_END_OFFSET = 8;   // don't treat any RET in the first 8 bytes as final
const MAX_BYTES = 60;          // hard ceiling in case something goes wrong

const rom = readFileSync(ROM_PATH);

const hex    = (value, width = 2) => '0x' + value.toString(16).toUpperCase().padStart(width, '0');
const addrHex = (value) => hex(value, 6);
const ramHex  = (value) => hex(value, 6);
const byteAt  = (addr) => rom[addr];
const u16     = (addr) => byteAt(addr) | (byteAt(addr + 1) << 8);
const u24     = (addr) => byteAt(addr) | (byteAt(addr + 1) << 8) | (byteAt(addr + 2) << 16);
const rel8    = (addr) => { const v = byteAt(addr); return v < 0x80 ? v : v - 0x100; };
const bytesHex = (addr, len) =>
  Array.from(rom.slice(addr, addr + len), (b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');

const ramNames = new Map([
  [0xD00596, 'D00596 column counter'],
  [0xD00595, 'D00595 current column position'],
  [0xD02505, 'D02505 column limit'],
  [0xD0231A, 'D0231A cursor position'],
  [0xD0231D, 'D0231D cursor state'],
  [0xD008D5, 'D008D5 primary Y coordinate'],
  [0xD014FE, 'D014FE cursor Y'],
  [0xD00824, 'D00824 state byte (polled for busy-wait)'],
  [0xD00080 + 0x09, 'IY+0x09 flag byte (bit 0 = guard)'],
  [0xD00080 + 0x15, 'IY+0x15 flag byte (bit 6 = gate)'],
  [0xD00080 + 0x2D, 'IY+0x2D font size backing byte'],
]);

const observations = {
  calls: [],
  ramWrites: [],
  ramReads: [],
  yAdvance: [],
  iyFlagRefs: [],
};

const recordRamRead = (addr, pc, mnemonic) => {
  observations.ramReads.push({ pc: addrHex(pc), target: ramHex(addr), name: ramNames.get(addr) ?? null, mnemonic });
};

const recordRamWrite = (addr, pc, mnemonic) => {
  observations.ramWrites.push({ pc: addrHex(pc), target: ramHex(addr), name: ramNames.get(addr) ?? null, mnemonic });
  if ([0xD008D5, 0xD014FE, 0xD0231A].includes(addr)) {
    observations.yAdvance.push({ pc: addrHex(pc), target: ramHex(addr), mnemonic });
  }
};

const annotateCall = (addr, pc, mnemonic) => {
  observations.calls.push({ pc: addrHex(pc), target: addrHex(addr), mnemonic });
};

const decodeEd = (pc) => {
  const op = byteAt(pc + 1);
  const regMap = { 0x7B: 'SP', 0x73: 'SP', 0x4B: 'BC', 0x43: 'BC', 0x5B: 'DE', 0x53: 'DE', 0x6B: 'HL', 0x63: 'HL' };
  if (regMap[op] !== undefined) {
    const addr = u24(pc + 2);
    const isLoad = [0x4B, 0x5B, 0x6B, 0x7B].includes(op);
    const mnemonic = isLoad
      ? `LD ${regMap[op]},(${ramHex(addr)})`
      : `LD (${ramHex(addr)}),${regMap[op]}`;
    if (isLoad) recordRamRead(addr, pc, mnemonic);
    else recordRamWrite(addr, pc, mnemonic);
    const comment = ramNames.get(addr) ? (isLoad ? `reads ${ramNames.get(addr)}` : `writes ${ramNames.get(addr)}`) : '';
    return { len: 5, mnemonic, comment };
  }
  if (op === 0xB0) return { len: 2, mnemonic: 'LDIR', comment: '' };
  if (op === 0xB8) return { len: 2, mnemonic: 'LDDR', comment: '' };
  return { len: 2, mnemonic: `ED ${hex(op)}`, comment: 'unhandled ED opcode' };
};

const decodeIndexed = (pc, reg) => {
  const op = byteAt(pc + 1);

  // DDCB / FDCB: bit operations with displacement
  if (op === 0xCB) {
    const disp = rel8(pc + 2);
    const cb   = byteAt(pc + 3);
    const group = cb >> 6;
    const bit  = (cb >> 3) & 7;
    const dispStr = disp < 0 ? `${disp}` : `+${disp}`;
    const mnemonic = group === 1
      ? `BIT ${bit},(${reg}${dispStr})`
      : group === 2
      ? `RES ${bit},(${reg}${dispStr})`
      : `SET ${bit},(${reg}${dispStr})`;

    let comment = '';
    if (reg === 'IY') {
      const absAddr = 0xD00080 + disp;
      const name = ramNames.get(absAddr);
      comment = name ? `tests/modifies ${name}` : `tests/modifies IY${dispStr} = ${ramHex(absAddr)}`;
      observations.iyFlagRefs.push({ pc: addrHex(pc), mnemonic, comment });
    }
    return { len: 4, mnemonic, comment };
  }

  // displacement-based loads
  const loadMap = new Map([
    [0x46, 'B'], [0x4E, 'C'], [0x56, 'D'], [0x5E, 'E'],
    [0x66, 'H'], [0x6E, 'L'], [0x7E, 'A'],
    [0x70, 'B'], [0x71, 'C'], [0x72, 'D'], [0x73, 'E'],
    [0x74, 'H'], [0x75, 'L'], [0x77, 'A'],
  ]);
  if (loadMap.has(op)) {
    const disp = rel8(pc + 2);
    const r = loadMap.get(op);
    const isWrite = op >= 0x70;
    const dispStr = disp < 0 ? `${disp}` : `+${disp}`;
    const mnemonic = isWrite
      ? `LD (${reg}${dispStr}),${r}`
      : `LD ${r},(${reg}${dispStr})`;
    let comment = '';
    if (reg === 'IY') {
      const absAddr = 0xD00080 + disp;
      const name = ramNames.get(absAddr);
      comment = name ? `${isWrite ? 'writes' : 'reads'} ${name}` : '';
    }
    return { len: 3, mnemonic, comment };
  }

  // INC/DEC (reg+d)
  if (op === 0x34 || op === 0x35) {
    const disp = rel8(pc + 2);
    const dispStr = disp < 0 ? `${disp}` : `+${disp}`;
    return { len: 3, mnemonic: `${op === 0x34 ? 'INC' : 'DEC'} (${reg}${dispStr})`, comment: '' };
  }
  // LD reg16, nn
  if (op === 0x21) return { len: 4, mnemonic: `LD ${reg},${hex(u24(pc + 2), 6)}`, comment: '' };
  // PUSH / POP
  if (op === 0xE5) return { len: 2, mnemonic: `PUSH ${reg}`, comment: '' };
  if (op === 0xE1) return { len: 2, mnemonic: `POP ${reg}`, comment: '' };

  return { len: 2, mnemonic: `${reg} prefix ${hex(op)}`, comment: 'unhandled indexed opcode' };
};

const decode = (pc) => {
  const op = byteAt(pc);
  if (op === 0xED) return decodeEd(pc);
  if (op === 0xDD) return decodeIndexed(pc, 'IX');
  if (op === 0xFD) return decodeIndexed(pc, 'IY');

  // simple / fixed-length opcodes
  const simple = {
    0x00: ['NOP', 1], 0x76: ['HALT', 1],
    0xAF: ['XOR A', 1], 0xB7: ['OR A', 1],
    0xC9: ['RET', 1],
    0xC0: ['RET NZ', 1], 0xC8: ['RET Z', 1],
    0xD0: ['RET NC', 1], 0xD8: ['RET C', 1],
    0xE0: ['RET PO', 1], 0xE8: ['RET PE', 1],
    0xF0: ['RET P', 1],  0xF8: ['RET M', 1],
    0xC5: ['PUSH BC', 1], 0xD5: ['PUSH DE', 1],
    0xE5: ['PUSH HL', 1], 0xF5: ['PUSH AF', 1],
    0xC1: ['POP BC', 1],  0xD1: ['POP DE', 1],
    0xE1: ['POP HL', 1],  0xF1: ['POP AF', 1],
    0x23: ['INC HL', 1], 0x2B: ['DEC HL', 1],
    0x03: ['INC BC', 1], 0x0B: ['DEC BC', 1],
    0x13: ['INC DE', 1], 0x1B: ['DEC DE', 1],
    0x3C: ['INC A', 1],  0x3D: ['DEC A', 1],
    0x04: ['INC B', 1],  0x05: ['DEC B', 1],
    0x0C: ['INC C', 1],  0x0D: ['DEC C', 1],
    0x27: ['DAA', 1], 0x2F: ['CPL', 1], 0x37: ['SCF', 1], 0x3F: ['CCF', 1],
    0x09: ['ADD HL,BC', 1], 0x19: ['ADD HL,DE', 1],
    0x29: ['ADD HL,HL', 1], 0x39: ['ADD HL,SP', 1],
  };
  if (simple[op]) {
    const [mnemonic, len] = simple[op];
    return { len, mnemonic, comment: '' };
  }

  // LD rr,nn (eZ80 24-bit imm)
  if ([0x01, 0x11, 0x21, 0x31].includes(op)) {
    const regs = { 0x01: 'BC', 0x11: 'DE', 0x21: 'HL', 0x31: 'SP' };
    return { len: 4, mnemonic: `LD ${regs[op]},${hex(u24(pc + 1), 6)}`, comment: '' };
  }

  // LD r,n
  if ([0x06, 0x0E, 0x16, 0x1E, 0x26, 0x2E, 0x3E].includes(op)) {
    const regs = { 0x06: 'B', 0x0E: 'C', 0x16: 'D', 0x1E: 'E', 0x26: 'H', 0x2E: 'L', 0x3E: 'A' };
    return { len: 2, mnemonic: `LD ${regs[op]},${hex(byteAt(pc + 1))}`, comment: '' };
  }

  // LD A,(nn)
  if (op === 0x3A) {
    const addr = u24(pc + 1);
    const mnemonic = `LD A,(${ramHex(addr)})`;
    recordRamRead(addr, pc, mnemonic);
    const name = ramNames.get(addr);
    return { len: 4, mnemonic, comment: name ? `reads ${name}` : '' };
  }
  // LD (nn),A
  if (op === 0x32) {
    const addr = u24(pc + 1);
    const mnemonic = `LD (${ramHex(addr)}),A`;
    recordRamWrite(addr, pc, mnemonic);
    const name = ramNames.get(addr);
    return { len: 4, mnemonic, comment: name ? `writes ${name}` : '' };
  }

  // JR unconditional and conditional
  if ([0x18, 0x20, 0x28, 0x30, 0x38].includes(op)) {
    const cond = { 0x18: 'JR', 0x20: 'JR NZ', 0x28: 'JR Z', 0x30: 'JR NC', 0x38: 'JR C' };
    const target = pc + 2 + rel8(pc + 1);
    return { len: 2, mnemonic: `${cond[op]} ${addrHex(target)}`, comment: `branch target ${addrHex(target)}` };
  }

  // JP cc,nn and JP nn
  if ([0xC2, 0xCA, 0xD2, 0xDA, 0xE2, 0xEA, 0xF2, 0xFA, 0xC3].includes(op)) {
    const cond = { 0xC2: 'JP NZ', 0xCA: 'JP Z', 0xD2: 'JP NC', 0xDA: 'JP C', 0xE2: 'JP PO', 0xEA: 'JP PE', 0xF2: 'JP P', 0xFA: 'JP M', 0xC3: 'JP' };
    return { len: 4, mnemonic: `${cond[op]} ${addrHex(u24(pc + 1))}`, comment: '' };
  }

  // CALL cc,nn and CALL nn
  if ([0xC4, 0xCC, 0xD4, 0xDC, 0xE4, 0xEC, 0xF4, 0xFC, 0xCD].includes(op)) {
    const cond = { 0xC4: 'CALL NZ', 0xCC: 'CALL Z', 0xD4: 'CALL NC', 0xDC: 'CALL C', 0xE4: 'CALL PO', 0xEC: 'CALL PE', 0xF4: 'CALL P', 0xFC: 'CALL M', 0xCD: 'CALL' };
    const addr = u24(pc + 1);
    const mnemonic = `${cond[op]} ${addrHex(addr)}`;
    annotateCall(addr, pc, mnemonic);
    return { len: 4, mnemonic, comment: '' };
  }

  // LD r,r (register-to-register moves 0x40..0x7F, excluding HALT)
  if (op >= 0x40 && op <= 0x7F && op !== 0x76) {
    const regs = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
    return { len: 1, mnemonic: `LD ${regs[(op >> 3) & 7]},${regs[op & 7]}`, comment: '' };
  }

  // ALU r (0x80..0xBF)
  if (op >= 0x80 && op <= 0xBF) {
    const alu = ['ADD A', 'ADC A', 'SUB', 'SBC A', 'AND', 'XOR', 'OR', 'CP'];
    const regs = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
    return { len: 1, mnemonic: `${alu[(op >> 3) & 7]},${regs[op & 7]}`, comment: '' };
  }

  // ALU n (immediate: 0xC6, 0xCE, 0xD6, 0xDE, 0xE6, 0xEE, 0xF6, 0xFE)
  if ([0xC6, 0xCE, 0xD6, 0xDE, 0xE6, 0xEE, 0xF6, 0xFE].includes(op)) {
    const alu = ['ADD A', 'ADC A', 'SUB', 'SBC A', 'AND', 'XOR', 'OR', 'CP'];
    const y = (op >> 3) & 7;
    return { len: 2, mnemonic: `${alu[y]},${hex(byteAt(pc + 1))}`, comment: '' };
  }

  return { len: 1, mnemonic: `DB ${hex(op)}`, comment: 'unknown opcode' };
};

// ---- main decode loop -------------------------------------------------------
// Strategy: decode all bytes without stopping on conditional RETs.
// Stop ONLY on unconditional RET (0xC9) that appears AFTER the guard region.
const listing = [];
let pc = START;
let stoppedReason = '';

while (pc < START + MAX_BYTES) {
  const decoded = decode(pc);
  const offset = pc - START;
  listing.push({
    address: addrHex(pc),
    bytes: bytesHex(pc, decoded.len),
    instruction: decoded.mnemonic,
    comment: decoded.comment,
  });
  pc += decoded.len;

  // Stop on unconditional RET only after we're past the guard region
  if (decoded.mnemonic === 'RET' && offset >= GUARD_END_OFFSET) {
    stoppedReason = `unconditional RET at ${addrHex(pc - 1)}`;
    break;
  }
}

if (!stoppedReason) stoppedReason = `MAX_BYTES (${MAX_BYTES}) reached without unconditional RET`;

// ---- raw hex dump -----------------------------------------------------------
console.log('Decode probe: 0x0A2013 Y advance / scroll trigger');
console.log(`ROM: ${ROM_PATH}`);
console.log(`Window: ${addrHex(START)}..${addrHex(pc - 1)} (${pc - START} bytes decoded)`);
console.log(`Stopped: ${stoppedReason}`);
console.log('');

console.log('Raw hex:');
const dumpLen = pc - START;
for (let i = 0; i < dumpLen; i += 0x10) {
  const chunk = Array.from(rom.slice(START + i, START + i + Math.min(0x10, dumpLen - i)),
    (b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
  console.log(`${addrHex(START + i)}: ${chunk}`);
}
console.log('');

// ---- disassembly listing ----------------------------------------------------
console.log('Disassembly:');
for (const row of listing) {
  const comment = row.comment ? ` ; ${row.comment}` : '';
  console.log(`${row.address}:  ${row.bytes.padEnd(15)} ${row.instruction}${comment}`);
}
console.log('');

// ---- structured summary -----------------------------------------------------
const summary = {
  start: addrHex(START),
  end: addrHex(pc - 1),
  bytesDecoded: pc - START,
  stoppedReason,
  calls: observations.calls,
  iyFlagReferences: observations.iyFlagRefs,
  ramReads: observations.ramReads,
  ramWrites: observations.ramWrites,
  yAdvanceCandidates: observations.yAdvance.length
    ? observations.yAdvance
    : 'None found — Y advance likely happens inside a helper CALL.',
  notes: [
    'IY = 0xD00080 (system flags base)',
    'IY+0x09 (D00089): bit 0 = guard flag; gates entire function body',
    'IY+0x15 (D00095): bit 6 = second gate; polled after D00824 busy-wait',
    'D00824: state byte polled in busy-wait loop after CALL 0x0A1F48',
    'CALL 0x0A1F48: unknown helper — may perform Y cursor advance or scroll',
    'CALL 0x0800B8: low-ROM syscall; unknown; executed after all guards pass',
    'This function is called from 0x0A2032 (line wrap) to advance Y cursor',
  ],
};

console.log('Structured summary:');
console.log(JSON.stringify(summary, null, 2));
