import { readFileSync } from 'fs';
import { decodeInstruction } from './ez80-decoder.js';

const ROM_PATH = 'TI-84_Plus_CE/ROM.rom';
const START = 0x090850;
const END = 0x090950;
const IY_BASE = 0xD00080;

const rom = readFileSync(ROM_PATH);
const view = new DataView(rom.buffer, rom.byteOffset, rom.byteLength);

const hexByte = (value) => value.toString(16).padStart(2, '0');
const hexAddr = (value, width = 6) => `0x${(value >>> 0).toString(16).padStart(width, '0')}`;
const signed8 = (value) => (value & 0x80 ? value - 0x100 : value);
const read24 = (addr) => rom[addr] | (rom[addr + 1] << 8) | (rom[addr + 2] << 16);
const inRange = (addr, start, end) => addr >= start && addr <= end;

const lines = [];
const calls = [];
const jumps = [];
const memoryRefs = [];
const warnings = [];

function byteString(pc, length) {
  const bytes = [];
  for (let i = 0; i < length && pc + i < rom.length; i++) {
    bytes.push(hexByte(rom[pc + i]));
  }
  return bytes;
}

function addMemoryRef(pc, addr, source) {
  const interesting =
    inRange(addr, 0xD02300, 0xD024FF) ||
    inRange(addr, 0xD11100, 0xD111FF) ||
    inRange(addr, 0xD00080, 0xD000FF);

  memoryRefs.push({ pc, addr, source, interesting });
}

function inspectInstruction(pc, instr, bytes) {
  const op = bytes[0];
  const op1 = bytes[1];

  if (op === 0x18 || op === 0x20 || op === 0x28 || op === 0x30 || op === 0x38) {
    const target = pc + 2 + signed8(op1);
    const kind = op === 0x18 ? 'JR' : `JR cc(${hexByte(op)})`;
    jumps.push({ pc, target, kind, direction: target < pc ? 'backward' : 'forward' });
  }

  if (op === 0xC3 && bytes.length >= 4) {
    const target = read24(pc + 1);
    jumps.push({ pc, target, kind: 'JP', direction: target < pc ? 'backward' : 'forward' });
  }

  if (op === 0xCD && bytes.length >= 4) {
    calls.push({ pc, target: read24(pc + 1), kind: 'CALL' });
  }

  if ((op === 0x2A || op === 0x22 || op === 0x3A || op === 0x32) && bytes.length >= 4) {
    addMemoryRef(pc, read24(pc + 1), hexByte(op));
  }

  if (op === 0xED && bytes.length >= 5) {
    const edOp = op1;
    if (
      edOp === 0x43 ||
      edOp === 0x4B ||
      edOp === 0x53 ||
      edOp === 0x5B ||
      edOp === 0x63 ||
      edOp === 0x6B ||
      edOp === 0x73 ||
      edOp === 0x7B
    ) {
      addMemoryRef(pc, read24(pc + 2), `ed ${hexByte(edOp)}`);
    }
  }

  if (op === 0xFD && op1 === 0xCB && bytes.length >= 4) {
    const displacement = signed8(bytes[2]);
    const iyAddr = IY_BASE + displacement;
    addMemoryRef(pc, iyAddr, `fd cb ${hexByte(bytes[3])}`);
  }

  if (!instr || !Number.isFinite(instr.length) || instr.length <= 0) {
    warnings.push(`${hexAddr(pc)} decoder returned invalid length; forced one-byte advance`);
  }
}

let pc = START;

while (pc < END) {
  let instr;
  try {
    instr = decodeInstruction(view, pc, true);
  } catch (error) {
    instr = { length: 1, mnemonic: `??? ; decode error: ${error.message}` };
  }

  if (!instr || !Number.isFinite(instr.length) || instr.length <= 0) {
    instr = { length: 1, mnemonic: '??? ; invalid decoder result' };
  }

  const length = Math.min(instr.length, END - pc);
  const bytes = byteString(pc, length);
  inspectInstruction(pc, instr, bytes.map((byte) => Number.parseInt(byte, 16)));
  lines.push(`${hexAddr(pc)}: ${bytes.join(' ').padEnd(20)} ${instr.mnemonic || '???'}`);
  pc += length;
}

console.log('=== STATIC DISASSEMBLY 0x090850-0x090950 ===');
for (const line of lines) console.log(line);

console.log('\n=== LOOP / JUMP CANDIDATES ===');
for (const jump of jumps) {
  const marker = jump.direction === 'backward' ? 'LOOP CANDIDATE' : 'exit/branch candidate';
  console.log(`${hexAddr(jump.pc)} -> ${hexAddr(jump.target)} ${jump.kind} ${jump.direction} ; ${marker}`);
}

console.log('\n=== CALL TARGETS ===');
for (const call of calls) {
  console.log(`${hexAddr(call.pc)} -> ${hexAddr(call.target)} ${call.kind}`);
}

console.log('\n=== MEMORY REFERENCES ===');
for (const ref of memoryRefs) {
  const marker = ref.interesting ? 'EDIT/IY WATCH' : 'absolute';
  console.log(`${hexAddr(ref.pc)} -> ${hexAddr(ref.addr)} ${ref.source} ; ${marker}`);
}

console.log('\n=== RAW HEX DUMP ===');
for (let addr = START; addr < END; addr += 16) {
  const hex = [];
  for (let i = 0; i < 16 && addr + i < END; i++) hex.push(hexByte(rom[addr + i]));
  console.log(`${hexAddr(addr)}: ${hex.join(' ')}`);
}

if (warnings.length) {
  console.log('\n=== DECODER WARNINGS ===');
  for (const warning of warnings) console.log(warning);
}
