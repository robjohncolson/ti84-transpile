import { readFileSync } from 'fs';
import { decodeInstruction } from './ez80-decoder.js';

const rom = readFileSync('TI-84_Plus_CE/ROM.rom');

function hexAddr(addr) {
  return `0x${addr.toString(16).padStart(6, '0')}`;
}

function hexByte(byte) {
  return byte.toString(16).padStart(2, '0');
}

function formatBytes(start, length) {
  return Array.from(rom.slice(start, start + length)).map(hexByte).join(' ');
}

function hexDumpRange(start, end, width = 16) {
  for (let addr = start; addr < end; addr += width) {
    const lineEnd = Math.min(addr + width, end);
    const bytes = formatBytes(addr, lineEnd - addr);
    console.log(`  ${hexAddr(addr)}: ${bytes}`);
  }
}

function disasmRange(start, end) {
  let pc = start;
  while (pc < end) {
    const instr = decodeInstruction(rom, pc);
    const length = Math.max(1, instr.length || 1);
    const bytes = formatBytes(pc, length);
    const operands = instr.operands ? ` ${instr.operands}` : '';
    console.log(`  ${hexAddr(pc)}: ${bytes.padEnd(20)} ${instr.mnemonic}${operands}`);
    pc += length;
  }
}

function decodeSection(title, start, end) {
  console.log(`=== ${title} ===`);
  console.log('Hex dump:');
  hexDumpRange(start, end);
  console.log('Disassembly:');
  disasmRange(start, end);
}

decodeSection('0x048B00-0x048C80 (0x048BFB context; includes 0x048BF0 lead-in)', 0x048B00, 0x048C80);

console.log('');
decodeSection('0x04E000-0x04E080 (memory mgmt cluster)', 0x04E000, 0x04E080);

const target = [0xFB, 0x8B, 0x04];
const callers = [];

for (let i = 0; i < rom.length - 3; i++) {
  if (rom[i + 1] !== target[0] || rom[i + 2] !== target[1] || rom[i + 3] !== target[2]) {
    continue;
  }

  const opcode = rom[i];
  const isCall = opcode === 0xCD;
  const isJp = opcode === 0xC3;
  const isConditionalJpOrCall = opcode >= 0xC2
    && opcode <= 0xFA
    && ((opcode & 0x07) === 0x02 || (opcode & 0x07) === 0x04);

  if (isCall || isJp || isConditionalJpOrCall) {
    callers.push({ addr: i, opcode });
  }
}

console.log(`\n=== Callers of 0x048BFB: ${callers.length} ===`);
for (const caller of callers) {
  const instr = decodeInstruction(rom, caller.addr);
  const bytes = formatBytes(caller.addr, Math.max(1, instr.length || 1));
  const operands = instr.operands ? ` ${instr.operands}` : '';
  console.log(`  ${hexAddr(caller.addr)}: ${bytes.padEnd(20)} opcode 0x${hexByte(caller.opcode)} ${instr.mnemonic}${operands}`);
}
