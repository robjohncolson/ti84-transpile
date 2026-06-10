import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { decodeInstruction } from './ez80-decoder.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const START = 0x0AF877;
const MIN_BYTES = 64;
const MAX_BYTES = 256;

const rom = fs.readFileSync(ROM_PATH);

const hex = (value, width = 6) => `0x${value.toString(16).toUpperCase().padStart(width, '0')}`;
const byteHex = (bytes) => bytes.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');

function formatOperand(operand) {
  if (operand == null) return '';
  if (typeof operand === 'string') return operand;
  if (typeof operand === 'number') return hex(operand);
  if (Array.isArray(operand)) return operand.map(formatOperand).join(', ');
  if (typeof operand === 'object') {
    if ('text' in operand) return operand.text;
    if ('value' in operand) return formatOperand(operand.value);
    return JSON.stringify(operand);
  }
  return String(operand);
}

function getMnemonic(decoded) {
  return decoded.mnemonic ?? decoded.opcode ?? decoded.instruction ?? decoded.name ?? 'DB';
}

function getOperands(decoded) {
  const operands = decoded.operands ?? decoded.args ?? decoded.operand;
  if (operands == null) return '';
  return Array.isArray(operands) ? operands.map(formatOperand).join(', ') : formatOperand(operands);
}

function getSize(decoded) {
  return decoded.size ?? decoded.length ?? decoded.bytes?.length ?? 1;
}

function decodeAt(address) {
  const offset = address;
  const slice = rom.subarray(offset, Math.min(rom.length, offset + 8));
  const decoded = decodeInstruction(slice, address);
  const size = Math.max(1, getSize(decoded));
  return {
    address,
    bytes: Array.from(rom.subarray(offset, offset + size)),
    decoded,
    mnemonic: getMnemonic(decoded),
    operands: getOperands(decoded),
    size,
  };
}

function scanRefs(text, refs) {
  for (const match of text.matchAll(/\b(?:CALL|JP|JR)\s+(?:[A-Z]{1,3},)?\s*(0x[0-9A-F]{4,6}|\$[0-9A-F]{4,6})/gi)) {
    refs.targets.add(match[1].replace('$', '0x').toUpperCase());
  }

  for (const match of text.matchAll(/\(?0x([CD][0-9A-F]{5}|[89A-F][0-9A-F]{5})\)?/gi)) {
    refs.ram.add(`0x${match[1].toUpperCase()}`);
  }

  for (const match of text.matchAll(/\(IY\s*([+-]\s*(?:0x[0-9A-F]+|\d+))\)/gi)) {
    refs.iy.add(match[1].replace(/\s+/g, ''));
  }

  for (const match of text.matchAll(/\((?:0x|#|\$)([0-9A-F]{2})\)/gi)) {
    refs.ports.add(`0x${match[1].toUpperCase()}`);
  }
}

function isTerminal(inst) {
  const line = `${inst.mnemonic} ${inst.operands}`.trim().toUpperCase();
  return line === 'RET' || line.startsWith('RET ') || /^JP\s+0X[0-9A-F]+$/.test(line) || /^JP\s+\$[0-9A-F]+$/.test(line);
}

const refs = {
  targets: new Set(),
  ram: new Set(),
  iy: new Set(),
  ports: new Set(),
};

let pc = START;
let decodedBytes = 0;
let terminals = 0;
const instructions = [];

while (pc < rom.length && decodedBytes < MAX_BYTES) {
  const inst = decodeAt(pc);
  instructions.push(inst);

  const text = `${inst.mnemonic}${inst.operands ? ` ${inst.operands}` : ''}`;
  scanRefs(text, refs);

  console.log(`${hex(inst.address)}  ${byteHex(inst.bytes).padEnd(23)}  ${inst.mnemonic}${inst.operands ? ` ${inst.operands}` : ''}`);

  pc += inst.size;
  decodedBytes += inst.size;

  if (isTerminal(inst)) terminals += 1;
  if (decodedBytes >= MIN_BYTES && terminals >= 2) break;
}

console.log('');
console.log('Summary');
console.log(`  Start: ${hex(START)}`);
console.log(`  Decoded bytes: ${decodedBytes}`);
console.log(`  Instructions: ${instructions.length}`);
console.log(`  Terminal instructions: ${terminals}`);
console.log(`  CALL/JP/JR targets: ${refs.targets.size ? Array.from(refs.targets).join(', ') : 'none'}`);
console.log(`  RAM refs: ${refs.ram.size ? Array.from(refs.ram).join(', ') : 'none'}`);
console.log(`  IY offsets: ${refs.iy.size ? Array.from(refs.iy).join(', ') : 'none'}`);
console.log(`  Ports: ${refs.ports.size ? Array.from(refs.ports).join(', ') : 'none'}`);
