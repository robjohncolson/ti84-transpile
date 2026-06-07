import fs from 'fs';
import { decodeInstruction } from './ez80-decoder.js';

const ROM_PATH = 'TI-84_Plus_CE/ROM.rom';
const START = 0x03ec5a;
const MAX_INSTRUCTIONS = 50;
const MAX_BYTES = 0x90;

const rom = fs.readFileSync(ROM_PATH);

const known = new Map([
  [0x03ec5a, 'jump table dispatcher'],
  [0x03ec8f, 'phase 544 error context formatter'],
  [0x03ecad, '27-entry error formatter jump table base'],
  [0x03ecfd, 'end of 27-entry error formatter jump table'],
]);

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function byteHex(value) {
  return value.toString(16).toUpperCase().padStart(2, '0');
}

function rawBytes(offset, size) {
  return Array.from(rom.subarray(offset, offset + size), byteHex).join(' ');
}

function signed8(value) {
  return value & 0x80 ? value - 0x100 : value;
}

function annotateAddress(value) {
  const label = known.get(value);
  return label ? `${hex(value)} (${label})` : hex(value);
}

function instructionTarget(insn) {
  for (const key of ['target', 'addr', 'value']) {
    if (Number.isInteger(insn[key])) return insn[key];
  }
  return null;
}

function formatInstruction(insn, pc) {
  const target = instructionTarget(insn);

  switch (insn.tag) {
    case 'ld':
      return `LD ${formatOperand(insn.dest)}, ${formatOperand(insn.src)}`;
    case 'ld_imm':
      return `LD ${formatOperand(insn.dest ?? insn.reg ?? insn.pair)}, ${hex(insn.value, immediateWidth(insn.value))}`;
    case 'ld_mem':
      return `LD ${formatOperand(insn.dest)}, (${annotateAddress(insn.addr)})`;
    case 'ld_to_mem':
      return `LD (${annotateAddress(insn.addr)}), ${formatOperand(insn.src)}`;
    case 'add':
      return `ADD ${formatOperand(insn.dest ?? insn.pair)}, ${formatOperand(insn.src ?? insn.reg)}`;
    case 'adc':
      return `ADC ${formatOperand(insn.dest ?? insn.reg)}, ${formatOperand(insn.src)}`;
    case 'sub':
      return `SUB ${formatOperand(insn.src ?? insn.reg)}`;
    case 'sbc':
      return `SBC ${formatOperand(insn.dest ?? insn.reg)}, ${formatOperand(insn.src)}`;
    case 'inc':
      return `INC ${formatOperand(insn.reg ?? insn.pair ?? insn.dest)}`;
    case 'dec':
      return `DEC ${formatOperand(insn.reg ?? insn.pair ?? insn.dest)}`;
    case 'push':
      return `PUSH ${formatOperand(insn.pair ?? insn.reg)}`;
    case 'pop':
      return `POP ${formatOperand(insn.pair ?? insn.reg)}`;
    case 'call':
      return `CALL ${conditionPrefix(insn)}${annotateAddress(target)}`;
    case 'jp':
      return `JP ${conditionPrefix(insn)}${target === null ? formatOperand(insn.dest ?? insn.src ?? insn.reg) : annotateAddress(target)}`;
    case 'jr': {
      const rel = Number.isInteger(insn.target)
        ? insn.target
        : pc + insn.size + signed8(insn.offset ?? 0);
      return `JR ${conditionPrefix(insn)}${annotateAddress(rel)}`;
    }
    case 'ret':
      return `RET${insn.condition ? ` ${insn.condition}` : ''}`;
    case 'rst':
      return `RST ${hex(insn.value, 2)}`;
    case 'or':
    case 'xor':
    case 'and':
    case 'cp':
      return `${insn.tag.toUpperCase()} ${formatOperand(insn.src ?? insn.reg ?? insn.value)}`;
    case 'rlca':
    case 'rrca':
    case 'rla':
    case 'rra':
    case 'ex':
    case 'exx':
    case 'di':
    case 'ei':
    case 'nop':
    case 'ccf':
    case 'scf':
    case 'cpl':
    case 'daa':
    case 'halt':
      return insn.tag.toUpperCase();
    default:
      return formatFallback(insn);
  }
}

function formatOperand(value) {
  if (value === undefined || value === null) return '?';
  if (typeof value === 'number') return hex(value, immediateWidth(value));
  if (typeof value === 'string') return value.toUpperCase();
  return JSON.stringify(value);
}

function immediateWidth(value) {
  if (value <= 0xff) return 2;
  if (value <= 0xffff) return 4;
  return 6;
}

function conditionPrefix(insn) {
  return insn.condition ? `${insn.condition.toUpperCase()}, ` : '';
}

function formatFallback(insn) {
  const parts = Object.entries(insn)
    .filter(([key]) => key !== 'tag' && key !== 'size')
    .map(([key, value]) => `${key}=${formatOperand(value)}`);
  return parts.length ? `${insn.tag.toUpperCase()} ${parts.join(', ')}` : insn.tag.toUpperCase();
}

function annotationFor(insn, pc) {
  const notes = [];
  const target = instructionTarget(insn);

  if (known.has(pc)) notes.push(known.get(pc));
  if (target !== null && known.has(target)) notes.push(`target: ${known.get(target)}`);

  const bytes = rom.subarray(pc, pc + insn.size);
  if (bytes.includes(0x03)) notes.push('constant 3 appears here; likely entry width or high byte');

  if (insn.tag === 'jp' && target === null) {
    notes.push('indirect jump; final dispatch likely happens here');
  }
  if (insn.tag === 'ret') {
    notes.push('return terminator');
  }

  return notes.length ? ` ; ${notes.join('; ')}` : '';
}

const decoded = [];
let pc = START;

for (let i = 0; i < MAX_INSTRUCTIONS && pc < rom.length && pc < START + MAX_BYTES; i++) {
  const insn = decodeInstruction(rom, pc);
  decoded.push({ pc, insn });
  pc += insn.size || 1;

  if (insn.tag === 'ret' || (insn.tag === 'jp' && instructionTarget(insn) === null)) break;
}

console.log(`Decode probe: ${hex(START)} jump table dispatcher`);
console.log(`ROM: ${ROM_PATH} (${rom.length} bytes)`);
console.log('');

for (const { pc: addr, insn } of decoded) {
  const bytes = rawBytes(addr, insn.size || 1).padEnd(16, ' ');
  const text = formatInstruction(insn, addr).padEnd(38, ' ');
  console.log(`${hex(addr)}  ${bytes}  ${text}${annotationFor(insn, addr)}`);
}

console.log('');
console.log('Nearby jump table context:');
for (let entry = 0; entry < 27; entry++) {
  const addr = 0x03ecad + entry * 3;
  const target = rom[addr] | (rom[addr + 1] << 8) | (rom[addr + 2] << 16);
  console.log(`  [${entry.toString().padStart(2, '0')}] ${hex(addr)}  ${rawBytes(addr, 3)}  -> ${annotateAddress(target)}`);
}

console.log('');
console.log('Summary:');
console.log('- Inputs expected by caller: HL points at the 3-byte jump-table base and A contains the selected entry index.');
console.log('- The dispatcher should scale A by 3, add that byte offset to HL, load the 24-bit pointer stored at HL/HL+1/HL+2, then transfer control through the loaded address.');
console.log('- Confirm the exact register choreography from the decoded instructions above; the table dump shows the 27 packed 24-bit targets at 0x03ECAD.');
