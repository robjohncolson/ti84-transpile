import { readFileSync } from 'fs';

const rom = readFileSync('TI-84_Plus_CE/ROM.rom');
const START = 0x05519f;
const MAX_BYTES = 200;

const flags = {
  lcdRegisters: new Set(),
  vramAddresses: new Set(),
  bppFlags: [],
  paletteSetup: [],
  copies: [],
  calls: [],
  jumps: [],
};

function hex(value, width = 2) {
  return `0x${value.toString(16).toUpperCase().padStart(width, '0')}`;
}

function u16(pc) {
  return rom[pc] | (rom[pc + 1] << 8);
}

function u24(pc) {
  return rom[pc] | (rom[pc + 1] << 8) | (rom[pc + 2] << 16);
}

function signed8(byte) {
  return byte & 0x80 ? byte - 0x100 : byte;
}

function classifyAddress(addr, action) {
  if (addr >= 0xe30000 && addr <= 0xe300ff) {
    flags.lcdRegisters.add(addr);
    return `${action} LCD register ${hex(addr, 6)}`;
  }
  if (addr >= 0xe30200 && addr <= 0xe303ff) {
    flags.lcdRegisters.add(addr);
    flags.paletteSetup.push(`${action} palette register ${hex(addr, 6)}`);
    return `${action} LCD palette register ${hex(addr, 6)}`;
  }
  if (addr === 0xd40000 || addr === 0xd52c00) {
    flags.vramAddresses.add(addr);
    return `${action} framebuffer/VRAM address ${hex(addr, 6)}`;
  }
  if (addr === 0xd000c6) {
    return `${action} BPP flags byte ${hex(addr, 6)}`;
  }
  if (addr >= 0xd00080 && addr <= 0xd0017f) {
    return `${action} OS/IY flag area ${hex(addr, 6)}`;
  }
  return `${action} absolute address ${hex(addr, 6)}`;
}

function recordBitOp(addrText, op, bit) {
  if (addrText.includes('(IY+46h)') || addrText.includes('(IY+0x46)')) {
    const msg = `${op} bit ${bit} of (IY+0x46) => D000C6 BPP flags`;
    flags.bppFlags.push(msg);
    return msg;
  }
  return `${op} bit ${bit} of ${addrText}`;
}

function decodeCb(pc, prefix = '') {
  const dispOffset = prefix ? 2 : 0;
  const disp = prefix ? signed8(rom[pc + 1]) : 0;
  const op = rom[pc + 1 + dispOffset];
  const bit = (op >> 3) & 7;
  const group = op & 0xc0;
  const regIndex = op & 7;
  const regs = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
  const target = prefix ? `(${prefix}+${hex(disp & 0xff)})` : regs[regIndex];
  const len = prefix ? 4 : 2;

  if (group === 0x40) return { len, text: `BIT ${bit},${target}`, comment: recordBitOp(target, 'test', bit) };
  if (group === 0x80) return { len, text: `RES ${bit},${target}`, comment: recordBitOp(target, 'clear', bit) };
  if (group === 0xc0) return { len, text: `SET ${bit},${target}`, comment: recordBitOp(target, 'set', bit) };
  return { len, text: `CB ${hex(op)}`, comment: `rotate/shift operation on ${target}` };
}

function decodeEd(pc) {
  const op = rom[pc + 1];
  if (op === 0xb0) {
    flags.copies.push('LDIR block copy using HL source, DE destination, BC length');
    return { len: 2, text: 'LDIR', comment: 'block copy; inspect preceding HL/DE/BC loads for palette/framebuffer initialization' };
  }
  if (op === 0x4b) return { len: 5, text: `LD BC,(${hex(u24(pc + 2), 6)})`, comment: classifyAddress(u24(pc + 2), 'read from') };
  if (op === 0x43) return { len: 5, text: `LD (${hex(u24(pc + 2), 6)}),BC`, comment: classifyAddress(u24(pc + 2), 'write to') };
  if (op === 0x53) return { len: 5, text: `LD (${hex(u24(pc + 2), 6)}),DE`, comment: classifyAddress(u24(pc + 2), 'write to') };
  if (op === 0x5b) return { len: 5, text: `LD DE,(${hex(u24(pc + 2), 6)})`, comment: classifyAddress(u24(pc + 2), 'read from') };
  if (op === 0x63) return { len: 5, text: `LD (${hex(u24(pc + 2), 6)}),HL`, comment: classifyAddress(u24(pc + 2), 'write to') };
  if (op === 0x6b) return { len: 5, text: `LD HL,(${hex(u24(pc + 2), 6)})`, comment: classifyAddress(u24(pc + 2), 'read from') };
  if (op === 0x73) return { len: 5, text: `LD (${hex(u24(pc + 2), 6)}),SP`, comment: classifyAddress(u24(pc + 2), 'write to') };
  if (op === 0x7b) return { len: 5, text: `LD SP,(${hex(u24(pc + 2), 6)})`, comment: classifyAddress(u24(pc + 2), 'read from') };
  return { len: 2, text: `ED ${hex(op)}`, comment: 'extended eZ80/Z80 instruction not expanded by this probe' };
}

function decodeIndexed(pc, prefix) {
  const op = rom[pc + 1];
  const rr = prefix === 'IX' ? 'IX' : 'IY';
  if (op === 0xcb) return decodeCb(pc, rr);
  if (op === 0x21) return { len: 5, text: `LD ${rr},${hex(u24(pc + 2), 6)}`, comment: `load ${rr} with 24-bit immediate` };
  if (op === 0x22) return { len: 5, text: `LD (${hex(u24(pc + 2), 6)}),${rr}`, comment: classifyAddress(u24(pc + 2), 'write to') };
  if (op === 0x2a) return { len: 5, text: `LD ${rr},(${hex(u24(pc + 2), 6)})`, comment: classifyAddress(u24(pc + 2), 'read from') };
  if (op === 0x36) return { len: 4, text: `LD (${rr}+${hex(rom[pc + 2])}),${hex(rom[pc + 3])}`, comment: `write immediate ${hex(rom[pc + 3])} through indexed OS state pointer` };
  if (op === 0x7e) return { len: 3, text: `LD A,(${rr}+${hex(rom[pc + 2])})`, comment: `read indexed OS state byte` };
  if (op === 0x77) return { len: 3, text: `LD (${rr}+${hex(rom[pc + 2])}),A`, comment: `write A through indexed OS state pointer` };
  return { len: 2, text: `${rr} prefix ${hex(op)}`, comment: 'indexed instruction not expanded by this probe' };
}

function decode(pc) {
  const op = rom[pc];
  switch (op) {
    case 0x00: return { len: 1, text: 'NOP', comment: 'no operation' };
    case 0x01: return { len: 4, text: `LD BC,${hex(u24(pc + 1), 6)}`, comment: 'load BC with 24-bit immediate' };
    case 0x06: return { len: 2, text: `LD B,${hex(rom[pc + 1])}`, comment: 'load B immediate' };
    case 0x0e: return { len: 2, text: `LD C,${hex(rom[pc + 1])}`, comment: 'load C immediate' };
    case 0x11: return { len: 4, text: `LD DE,${hex(u24(pc + 1), 6)}`, comment: classifyAddress(u24(pc + 1), 'prepare') };
    case 0x16: return { len: 2, text: `LD D,${hex(rom[pc + 1])}`, comment: 'load D immediate' };
    case 0x1e: return { len: 2, text: `LD E,${hex(rom[pc + 1])}`, comment: 'load E immediate' };
    case 0x21: return { len: 4, text: `LD HL,${hex(u24(pc + 1), 6)}`, comment: classifyAddress(u24(pc + 1), 'prepare') };
    case 0x26: return { len: 2, text: `LD H,${hex(rom[pc + 1])}`, comment: 'load H immediate' };
    case 0x2e: return { len: 2, text: `LD L,${hex(rom[pc + 1])}`, comment: 'load L immediate' };
    case 0x31: return { len: 4, text: `LD SP,${hex(u24(pc + 1), 6)}`, comment: 'load stack pointer immediate' };
    case 0x32: return { len: 4, text: `LD (${hex(u24(pc + 1), 6)}),A`, comment: classifyAddress(u24(pc + 1), 'write A to') };
    case 0x3a: return { len: 4, text: `LD A,(${hex(u24(pc + 1), 6)})`, comment: classifyAddress(u24(pc + 1), 'read A from') };
    case 0x3e: return { len: 2, text: `LD A,${hex(rom[pc + 1])}`, comment: 'load A immediate' };
    case 0x77: return { len: 1, text: 'LD (HL),A', comment: 'write A through HL; check prior HL for LCD/VRAM target' };
    case 0xaf: return { len: 1, text: 'XOR A', comment: 'clear A' };
    case 0xc0: return { len: 1, text: 'RET NZ', comment: 'return if zero flag is clear' };
    case 0xc2: flags.jumps.push(hex(u24(pc + 1), 6)); return { len: 4, text: `JP NZ,${hex(u24(pc + 1), 6)}`, comment: 'conditional absolute jump' };
    case 0xc3: flags.jumps.push(hex(u24(pc + 1), 6)); return { len: 4, text: `JP ${hex(u24(pc + 1), 6)}`, comment: 'absolute jump' };
    case 0xc8: return { len: 1, text: 'RET Z', comment: 'return if zero flag is set' };
    case 0xc9: return { len: 1, text: 'RET', comment: 'end of init body' };
    case 0xca: flags.jumps.push(hex(u24(pc + 1), 6)); return { len: 4, text: `JP Z,${hex(u24(pc + 1), 6)}`, comment: 'conditional absolute jump' };
    case 0xcd: flags.calls.push(hex(u24(pc + 1), 6)); return { len: 4, text: `CALL ${hex(u24(pc + 1), 6)}`, comment: 'call helper; known BPP helpers include 055228/055261/055280' };
    case 0xd0: return { len: 1, text: 'RET NC', comment: 'return if carry flag is clear' };
    case 0xd8: return { len: 1, text: 'RET C', comment: 'return if carry flag is set' };
    case 0xdd: return decodeIndexed(pc, 'IX');
    case 0xed: return decodeEd(pc);
    case 0xf5: return { len: 1, text: 'PUSH AF', comment: 'save AF' };
    case 0xf1: return { len: 1, text: 'POP AF', comment: 'restore AF' };
    case 0xfd: return decodeIndexed(pc, 'IY');
    case 0xfe: return { len: 2, text: `CP ${hex(rom[pc + 1])}`, comment: 'compare A with immediate' };
    default:
      return { len: 1, text: `DB ${hex(op)}`, comment: 'unrecognized opcode byte; extend probe decoder if this is executable' };
  }
}

const rows = [];
let pc = START;
const end = Math.min(rom.length, START + MAX_BYTES);
while (pc < end) {
  const ins = decode(pc);
  const bytes = Array.from(rom.subarray(pc, pc + ins.len), b => hex(b)).join(' ');
  rows.push({ pc, bytes, ...ins });
  pc += ins.len;
  if (ins.text === 'RET') break;
}

console.log('Decode 0x05519F: BPP init body');
console.log(`ROM bytes decoded: ${hex(START, 6)}..${hex(pc - 1, 6)} (${pc - START} bytes)`);
console.log('');
for (const row of rows) {
  console.log(`${hex(row.pc, 6)}  ${row.bytes.padEnd(17)} ${row.text.padEnd(24)} ; ${row.comment}`);
}

console.log('');
console.log('Structured summary');
console.log(JSON.stringify({
  target: hex(START, 6),
  decodedBytes: pc - START,
  stoppedAtRet: rows.at(-1)?.text === 'RET',
  lcdRegistersConfigured: Array.from(flags.lcdRegisters).map(addr => hex(addr, 6)),
  vramAddressesInitialized: Array.from(flags.vramAddresses).map(addr => hex(addr, 6)),
  bppModeFlagEvidence: flags.bppFlags,
  paletteSetupEvidence: flags.paletteSetup,
  blockCopies: flags.copies,
  calls: flags.calls,
  jumps: flags.jumps,
  notes: [
    'D000C6 is (IY+0x46) when IY base is D00080; SET/RES/BIT entries against that indexed byte are BPP flag writes/tests.',
    'LCD register writes are identified by absolute E300xx/E302xx operands; indirect writes through HL/DE are annotated from preceding immediate loads.',
    'Known helper calls should be cross-referenced with 0x055228 (8bpp), 0x055261 (16bpp/palette), and 0x055280 (LCD register setup).',
  ],
}, null, 2));
