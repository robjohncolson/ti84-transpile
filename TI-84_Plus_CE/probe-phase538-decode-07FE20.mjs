import { readFileSync } from 'fs';

const ROM_PATH = 'TI-84_Plus_CE/ROM.rom';
const START = 0x07fe20;
const END = 0x07fe2e;
const KNOWN_WRAPPER_START = 0x07fe24;

const rom = readFileSync(ROM_PATH);
const bytes = rom.subarray(START, END + 1);

const hex2 = (n) => n.toString(16).toUpperCase().padStart(2, '0');
const hex6 = (n) => n.toString(16).toUpperCase().padStart(6, '0');
const signed8 = (n) => (n & 0x80 ? n - 0x100 : n);
const u24 = (offset) => rom[offset] | (rom[offset + 1] << 8) | (rom[offset + 2] << 16);

function decodeOne(pc) {
  const op = rom[pc];

  switch (op) {
    case 0x00:
      return { size: 1, text: 'NOP' };
    case 0x18: {
      const target = pc + 2 + signed8(rom[pc + 1]);
      return { size: 2, text: `JR $${hex6(target)}` };
    }
    case 0x21:
      return { size: 4, text: `LD HL,$${hex6(u24(pc + 1))}` };
    case 0x3e:
      return { size: 2, text: `LD A,$${hex2(rom[pc + 1])}` };
    case 0x7e:
      return { size: 1, text: 'LD A,(HL)' };
    case 0xaf:
      return { size: 1, text: 'XOR A' };
    case 0xc9:
      return { size: 1, text: 'RET' };
    case 0xcd:
      return { size: 4, text: `CALL $${hex6(u24(pc + 1))}` };
    case 0xc3:
      return { size: 4, text: `JP $${hex6(u24(pc + 1))}` };
    case 0xe6:
      return { size: 2, text: `AND $${hex2(rom[pc + 1])}` };
    case 0xf6:
      return { size: 2, text: `OR $${hex2(rom[pc + 1])}` };
    case 0x77:
      return { size: 1, text: 'LD (HL),A' };
    default:
      return { size: 1, text: `DB $${hex2(op)}` };
  }
}

function decodeRange(start, end) {
  const instructions = [];
  let pc = start;

  while (pc <= end) {
    const decoded = decodeOne(pc);
    const raw = Array.from(rom.subarray(pc, pc + decoded.size), hex2).join(' ');
    instructions.push({ pc, raw, ...decoded });
    pc += decoded.size;
  }

  return instructions;
}

const instructions = decodeRange(START, END);
const preamble = instructions.filter((ins) => ins.pc < KNOWN_WRAPPER_START);
const first = preamble[0];

console.log(`Probe: decode 0x${hex6(START)} through 0x${hex6(END)}`);
console.log(`Raw bytes: ${Array.from(bytes, hex2).join(' ')}`);
console.log('');
console.log('Decoded instructions:');
for (const ins of instructions) {
  const marker = ins.pc === KNOWN_WRAPPER_START ? '  ; known 0x07FE24 wrapper starts here' : '';
  console.log(`  $${hex6(ins.pc)}: ${ins.raw.padEnd(11)} ${ins.text}${marker}`);
}

console.log('');
console.log('Analysis:');
if (first?.pc === START && first.text === `LD HL,$${hex6(0xd005f8)}`) {
  console.log('  0x07FE20 is not separate code; it is the first instruction of the wrapper.');
  console.log('  Entering at 0x07FE20 initializes HL to $D005F8, reads (HL), transforms A via 0x07FE2F, stores it back, then returns.');
  console.log('  Entering at 0x07FE24 skips the HL setup and starts at LD A,(HL), so it transforms the byte addressed by the caller-provided HL.');
  console.log('  Therefore the 0x07FE20 entry ends only when the shared wrapper body returns at 0x07FE2D.');
} else {
  console.log(`  Bytes 0x${hex6(START)}-0x${hex6(KNOWN_WRAPPER_START - 1)} form the alternate-entry preamble before the known wrapper body.`);
  for (const ins of preamble) {
    console.log(`  Preamble: $${hex6(ins.pc)} ${ins.text}`);
  }
  console.log('  Control reaches 0x07FE24 afterward, where the known wrapper begins.');
}
