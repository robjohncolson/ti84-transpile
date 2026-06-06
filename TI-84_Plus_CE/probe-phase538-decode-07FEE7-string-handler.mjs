import { readFileSync } from 'fs';

const ROM_PATH = 'TI-84_Plus_CE/ROM.rom';
const START = 0x07fee1;
const END_EXCLUSIVE = 0x07fef6;
const STRING_ENTRY = 0x07fee7;

const rom = readFileSync(ROM_PATH);

function hex(value, width = 2) {
  return value.toString(16).toUpperCase().padStart(width, '0');
}

function addr(value) {
  return `0x${hex(value, 6)}`;
}

function byteAt(address) {
  return rom[address];
}

function read24(address) {
  return byteAt(address) | (byteAt(address + 1) << 8) | (byteAt(address + 2) << 16);
}

function signed8(value) {
  return value < 0x80 ? value : value - 0x100;
}

function bytesAt(address, length) {
  return Array.from(rom.subarray(address, address + length));
}

function formatBytes(address, length) {
  return bytesAt(address, length).map((value) => hex(value)).join(' ');
}

function decodeAt(pc) {
  const op = byteAt(pc);

  if (op === 0xcd) {
    const target = read24(pc + 1);
    return { pc, length: 4, text: `CALL ${addr(target)}` };
  }

  if (op === 0x38) {
    const offset = signed8(byteAt(pc + 1));
    const target = pc + 2 + offset;
    return { pc, length: 2, text: `JR C,${addr(target)}` };
  }

  if (op === 0xf5) return { pc, length: 1, text: 'PUSH AF' };
  if (op === 0xaf) return { pc, length: 1, text: 'XOR A' };
  if (op === 0xf1) return { pc, length: 1, text: 'POP AF' };

  if (op === 0x21) {
    const value = read24(pc + 1);
    return { pc, length: 4, text: `LD HL,${addr(value)}` };
  }

  if (op === 0xb6) return { pc, length: 1, text: 'OR (HL)' };
  if (op === 0x77) return { pc, length: 1, text: 'LD (HL),A' };
  if (op === 0xc9) return { pc, length: 1, text: 'RET' };

  return { pc, length: 1, text: `DB ${hex(op)}` };
}

function decodeRange(start, endExclusive) {
  const instructions = [];
  for (let pc = start; pc < endExclusive;) {
    const instruction = decodeAt(pc);
    instructions.push(instruction);
    pc += instruction.length;
  }
  return instructions;
}

function printTrace(title, instructions) {
  console.log(title);
  for (const instruction of instructions) {
    console.log(
      `  ${addr(instruction.pc)}  ${formatBytes(instruction.pc, instruction.length).padEnd(11)}  ${instruction.text}`,
    );
  }
}

const rawBytes = bytesAt(START, END_EXCLUSIVE - START);
const instructions = decodeRange(START, END_EXCLUSIVE);
const stringEntryInstruction = instructions.find((instruction) => instruction.pc === STRING_ENTRY);
const normalSkipped = instructions.filter((instruction) => instruction.pc < STRING_ENTRY);
const stringPath = instructions.filter((instruction) => instruction.pc >= STRING_ENTRY);

console.log('Probe phase 538: decode 0x07FEE7 string handler');
console.log('');
console.log(`ROM: ${ROM_PATH}`);
console.log(`Range: ${addr(START)}-${addr(END_EXCLUSIVE - 1)} (${rawBytes.length} bytes)`);
console.log('');

console.log('Raw hex bytes:');
for (let offset = 0; offset < rawBytes.length; offset += 8) {
  const chunkAddress = START + offset;
  const chunk = rawBytes.slice(offset, offset + 8).map((value) => hex(value)).join(' ');
  console.log(`  ${addr(chunkAddress)}: ${chunk}`);
}
console.log('');

printTrace('Full instruction decode:', instructions);
console.log('');

console.log(`0x07FEE7 lands on: ${stringEntryInstruction?.text ?? 'no decoded instruction boundary'}`);
console.log('');

printTrace('Normal path entering at 0x07FEE1:', instructions);
console.log('');

printTrace('String path entering at 0x07FEE7:', stringPath);
console.log('');

console.log(
  `Analysis: entering at 0x07FEE7 skips ${normalSkipped
    .map((instruction) => instruction.text)
    .join(' and ')} and executes ${stringPath.map((instruction) => instruction.text).join(', ')}.`,
);
