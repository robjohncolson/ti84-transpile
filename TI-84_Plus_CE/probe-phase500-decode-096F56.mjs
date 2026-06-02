import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const START = 0x096f56;
const GATE_START = 0x096f67;
const MIN_BYTES = 50;
const KNOWN_DRAW = 0x061061;
const KNOWN_ERASE = 0x061003;

const rom = fs.readFileSync(ROM_PATH);

function hex(value, width = 6) {
  return `0x${value.toString(16).toUpperCase().padStart(width, '0')}`;
}

function byte(addr) {
  return rom[addr] ?? 0;
}

function word24(addr) {
  return byte(addr) | (byte(addr + 1) << 8) | (byte(addr + 2) << 16);
}

function rel8(addr) {
  const v = byte(addr);
  return v < 0x80 ? v : v - 0x100;
}

function bytesAt(addr, len) {
  return Array.from(rom.subarray(addr, addr + len), (b) =>
    b.toString(16).toUpperCase().padStart(2, '0'),
  ).join(' ');
}

function decode(addr) {
  const op = byte(addr);
  const next = byte(addr + 1);

  if (op === 0xcd) {
    const target = word24(addr + 1);
    return { size: 4, mnemonic: `CALL ${hex(target)}`, kind: 'CALL', target };
  }

  if (op === 0xc3) {
    const target = word24(addr + 1);
    return { size: 4, mnemonic: `JP ${hex(target)}`, kind: 'JP', target };
  }

  if (op === 0xca || op === 0xc2) {
    const target = word24(addr + 1);
    return {
      size: 4,
      mnemonic: `${op === 0xca ? 'JP Z' : 'JP NZ'},${hex(target)}`,
      kind: 'JP',
      target,
    };
  }

  if (op === 0xda || op === 0xd2) {
    const target = word24(addr + 1);
    return {
      size: 4,
      mnemonic: `${op === 0xda ? 'JP C' : 'JP NC'},${hex(target)}`,
      kind: 'JP',
      target,
    };
  }

  if (op === 0x20 || op === 0x28 || op === 0x18 || op === 0x30 || op === 0x38) {
    const target = addr + 2 + rel8(addr + 1);
    const names = {
      0x20: 'JR NZ',
      0x28: 'JR Z',
      0x18: 'JR',
      0x30: 'JR NC',
      0x38: 'JR C',
    };
    return { size: 2, mnemonic: `${names[op]} ${hex(target)}`, kind: 'JR', target };
  }

  if (op === 0xfd && next === 0xcb) {
    const disp = byte(addr + 2);
    const bitop = byte(addr + 3);
    const signed = disp < 0x80 ? `+${hex(disp, 2)}` : `-${hex(0x100 - disp, 2)}`;
    const group = bitop & 0xc0;
    const bit = (bitop >> 3) & 7;
    const action = group === 0x40 ? 'BIT' : group === 0x80 ? 'RES' : group === 0xc0 ? 'SET' : 'ROT';
    return {
      size: 4,
      mnemonic:
        action === 'ROT'
          ? `FD CB ${hex(disp, 2)} ${hex(bitop, 2)}`
          : `${action} ${bit},(IY${signed})`,
    };
  }

  if (op === 0x3a) {
    const target = word24(addr + 1);
    return { size: 4, mnemonic: `LD A,(${hex(target)})`, target };
  }

  if (op === 0x32) {
    const target = word24(addr + 1);
    return { size: 4, mnemonic: `LD (${hex(target)}),A`, target };
  }

  if (op === 0xfe) return { size: 2, mnemonic: `CP A,${hex(byte(addr + 1), 2)}` };

  const oneByte = {
    0x00: 'NOP',
    0x04: 'INC B',
    0x05: 'DEC B',
    0x0c: 'INC C',
    0x0d: 'DEC C',
    0x14: 'INC D',
    0x15: 'DEC D',
    0x1c: 'INC E',
    0x1d: 'DEC E',
    0x24: 'INC H',
    0x25: 'DEC H',
    0x2c: 'INC L',
    0x2d: 'DEC L',
    0x37: 'SCF',
    0x3c: 'INC A',
    0x3d: 'DEC A',
    0x78: 'LD A,B',
    0x79: 'LD A,C',
    0x7a: 'LD A,D',
    0x7b: 'LD A,E',
    0x7c: 'LD A,H',
    0x7d: 'LD A,L',
    0x80: 'ADD A,B',
    0x81: 'ADD A,C',
    0x82: 'ADD A,D',
    0x83: 'ADD A,E',
    0x87: 'ADD A,A',
    0x90: 'SUB B',
    0x91: 'SUB C',
    0x92: 'SUB D',
    0x93: 'SUB E',
    0xa0: 'AND B',
    0xa1: 'AND C',
    0xa7: 'AND A',
    0xa8: 'XOR B',
    0xa9: 'XOR C',
    0xaf: 'XOR A',
    0xb0: 'OR B',
    0xb1: 'OR C',
    0xb7: 'OR A',
    0xc0: 'RET NZ',
    0xc1: 'POP BC',
    0xc5: 'PUSH BC',
    0xc8: 'RET Z',
    0xc9: 'RET',
    0xd0: 'RET NC',
    0xd8: 'RET C',
    0xf5: 'PUSH AF',
    0xf1: 'POP AF',
  };

  if (oneByte[op]) return { size: 1, mnemonic: oneByte[op] };

  const twoByteLoads = {
    0x06: 'LD B',
    0x0e: 'LD C',
    0x16: 'LD D',
    0x1e: 'LD E',
    0x26: 'LD H',
    0x2e: 'LD L',
    0x3e: 'LD A',
    0xd3: 'OUT',
    0xdb: 'IN A',
  };

  if (twoByteLoads[op]) return { size: 2, mnemonic: `${twoByteLoads[op]},${hex(next, 2)}` };

  return { size: 1, mnemonic: `DB ${hex(op, 2)}` };
}

const rows = [];
const targets = [];
let addr = START;
const end = Math.min(rom.length, START + MIN_BYTES);

while (addr < end) {
  const decoded = decode(addr);
  rows.push({ addr, ...decoded, raw: bytesAt(addr, decoded.size) });
  if (decoded.kind === 'CALL' || decoded.kind === 'JP' || decoded.kind === 'JR') {
    targets.push({ from: addr, kind: decoded.kind, target: decoded.target });
  }
  addr += decoded.size;
}

const directFunctionRows = rows.filter((row) => row.addr < GATE_START);
const directFunctionSize = GATE_START - START;
const calls = targets.filter((target) => target.kind === 'CALL');
const jumps = targets.filter((target) => target.kind !== 'CALL');
const callsDraw = calls.some((target) => target.target === KNOWN_DRAW);
const callsErase = calls.some((target) => target.target === KNOWN_ERASE);

console.log(`ROM: ${ROM_PATH}`);
console.log(`ROM size: ${rom.length.toLocaleString()} bytes`);
console.log('');
console.log(`Disassembly from ${hex(START)} for ${MIN_BYTES} bytes:`);
for (const row of rows) {
  const marker = row.addr >= START && row.addr < GATE_START ? '*' : ' ';
  console.log(`${marker} ${hex(row.addr)}  ${row.raw.padEnd(14)}  ${row.mnemonic}`);
}

console.log('');
console.log(`Actual dispatcher window: ${hex(START)}..${hex(GATE_START - 1)} (${directFunctionSize} bytes)`);
for (const row of directFunctionRows) {
  console.log(`  ${hex(row.addr)}  ${row.raw.padEnd(14)}  ${row.mnemonic}`);
}

console.log('');
console.log('CALL targets:');
if (calls.length === 0) {
  console.log('  none');
} else {
  for (const call of calls) console.log(`  ${hex(call.from)} -> ${hex(call.target)}`);
}

console.log('');
console.log('JP/JR targets:');
if (jumps.length === 0) {
  console.log('  none');
} else {
  for (const jump of jumps) console.log(`  ${hex(jump.from)} ${jump.kind} -> ${hex(jump.target)}`);
}

console.log('');
console.log(`Calls cursor draw ${hex(KNOWN_DRAW)}: ${callsDraw ? 'YES' : 'NO'}`);
console.log(`Calls cursor erase ${hex(KNOWN_ERASE)}: ${callsErase ? 'YES' : 'NO'}`);
console.log(`Function size before gate: ${directFunctionSize} bytes`);

// ---------------------------------------------------------------
// Extended analysis
// ---------------------------------------------------------------
console.log('');
console.log('=== Broader function context: 0x096F4F ===');
console.log('RET at 0x096F4E confirms 0x096F4F is the natural entry point.');
console.log(`  096F4E: ${hex(byte(0x096F4E), 2)} = RET`);
let pc2 = 0x096F4F;
while (pc2 < 0x096F67) {
  const d = decode(pc2);
  const marker = pc2 === START ? ' <<< gate calls here' : '';
  console.log(`  ${hex(pc2)}  ${bytesAt(pc2, d.size).padEnd(14)}  ${d.mnemonic}${marker}`);
  pc2 += d.size;
}

console.log('');
console.log('=== Subroutine 0x06C732 ===');
pc2 = 0x06C732;
while (pc2 <= 0x06C736) {
  const d = decode(pc2);
  console.log(`  ${hex(pc2)}  ${bytesAt(pc2, d.size).padEnd(14)}  ${d.mnemonic}`);
  pc2 += d.size;
}

console.log('');
console.log('=== Caller 0x096CCF ===');
pc2 = 0x096CCF;
for (let i = 0; i < 3; i++) {
  const d = decode(pc2);
  console.log(`  ${hex(pc2)}  ${bytesAt(pc2, d.size).padEnd(14)}  ${d.mnemonic}`);
  pc2 += d.size;
}

console.log('');
console.log('========================================');
console.log(' CORRECTED FINDINGS');
console.log('========================================');
console.log('');
console.log('0x096F56 is NOT a cursor draw/erase dispatcher.');
console.log('It is a CURSOR VISIBILITY CHECK (17 bytes, 096F56-096F66).');
console.log('');
console.log('Logic (when entered from gate 0x096F67):');
console.log('  Gate: BIT 7,(IY+0x11) sets Z flag from bit 7 of D00091');
console.log('  1. If bit 7 == 0 (Z): JR to XOR A; RET -> A=0, Z set ("not visible")');
console.log('  2. If bit 7 == 1 (NZ): load (D007E0), compare with 0x49');
console.log('     a. Not 0x49: XOR A; RET -> A=0, Z set ("not visible")');
console.log('     b. Is 0x49: CALL 0x06C732 = BIT 7,(IY+0x02); RET');
console.log('        NZ = bit set = cursor visible');
console.log('        Z  = bit clear = cursor not visible');
console.log('');
console.log('Gate preserves A in B across check, restores after.');
console.log('Caller 0x096CCF: JP NZ,0x097955 if visible -> 0x097955 is the actual draw path.');
console.log('');
console.log('Key RAM:');
console.log('  (IY+0x11) = D00091 bit 7: cursor-enabled master flag');
console.log('  D007E0: screen mode byte (0x49 = required for cursor visibility)');
console.log('  (IY+0x02) = D00082 bit 7: secondary cursor visibility flag');
console.log('');
console.log('Next target: 0x097955 (the actual cursor draw path, reached via JP NZ from 096CCF).');
