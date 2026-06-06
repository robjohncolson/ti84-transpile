import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/*
 * Phase 534 probe: decode shared copy/conversion routine at 0x07CF96.
 *
 * Entry context from known setup stub at 0x07CF9D:
 *   HL = 0xD00603 (OP2)
 *   DE = 0xD02B39 (RAM save buffer)
 *
 * This probe disassembles raw ROM bytes in eZ80 ADL mode. It intentionally
 * does not emulate the CPU; it reads the instruction stream and prints the
 * routine from 0x07CF96 through the first RET.
 *
 * Findings are printed at the end after decoding. The key instruction shapes
 * this routine is expected to reveal are:
 *   - Whether BC is loaded with a fixed copy length.
 *   - Whether the transfer uses LDIR (ED B0) or single-step LDI (ED A0).
 *   - Any CALL targets reached before RET.
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const START = 0x07cf96;
const READ_LEN = 0x40;

const rom = fs.readFileSync(ROM_PATH);
const bytes = rom.subarray(START, START + READ_LEN);

function hex(value, width) {
  return value.toString(16).toUpperCase().padStart(width, '0');
}

function s8(value) {
  return value & 0x80 ? value - 0x100 : value;
}

function u24(pos) {
  return bytes[pos] | (bytes[pos + 1] << 8) | (bytes[pos + 2] << 16);
}

function u16(pos) {
  return bytes[pos] | (bytes[pos + 1] << 8);
}

function raw(pos, len) {
  return Array.from(bytes.subarray(pos, pos + len), b => hex(b, 2)).join(' ');
}

function decodeAt(pos) {
  const op = bytes[pos];

  if (op === 0x52) {
    const next = decodeAt(pos + 1);
    return {
      len: next.len + 1,
      mnemonic: '.SIL',
      operands: next.operands ? `${next.mnemonic} ${next.operands}` : next.mnemonic,
      meta: { ...next.meta, sil: true },
    };
  }

  if (op === 0x01) return { len: 4, mnemonic: 'LD', operands: `BC,$${hex(u24(pos + 1), 6)}`, meta: { load: 'BC', value: u24(pos + 1) } };
  if (op === 0x11) return { len: 4, mnemonic: 'LD', operands: `DE,$${hex(u24(pos + 1), 6)}`, meta: { load: 'DE', value: u24(pos + 1) } };
  if (op === 0x21) return { len: 4, mnemonic: 'LD', operands: `HL,$${hex(u24(pos + 1), 6)}`, meta: { load: 'HL', value: u24(pos + 1) } };
  if (op === 0x31) return { len: 4, mnemonic: 'LD', operands: `SP,$${hex(u24(pos + 1), 6)}`, meta: { load: 'SP', value: u24(pos + 1) } };
  if (op === 0x06) return { len: 2, mnemonic: 'LD', operands: `B,$${hex(bytes[pos + 1], 2)}`, meta: { load: 'B', value: bytes[pos + 1] } };
  if (op === 0x0e) return { len: 2, mnemonic: 'LD', operands: `C,$${hex(bytes[pos + 1], 2)}`, meta: { load: 'C', value: bytes[pos + 1] } };
  if (op === 0x16) return { len: 2, mnemonic: 'LD', operands: `D,$${hex(bytes[pos + 1], 2)}`, meta: { load: 'D', value: bytes[pos + 1] } };
  if (op === 0x1e) return { len: 2, mnemonic: 'LD', operands: `E,$${hex(bytes[pos + 1], 2)}`, meta: { load: 'E', value: bytes[pos + 1] } };
  if (op === 0x26) return { len: 2, mnemonic: 'LD', operands: `H,$${hex(bytes[pos + 1], 2)}`, meta: { load: 'H', value: bytes[pos + 1] } };
  if (op === 0x2e) return { len: 2, mnemonic: 'LD', operands: `L,$${hex(bytes[pos + 1], 2)}`, meta: { load: 'L', value: bytes[pos + 1] } };
  if (op === 0x36) return { len: 2, mnemonic: 'LD', operands: `(HL),$${hex(bytes[pos + 1], 2)}`, meta: {} };
  if (op === 0x3e) return { len: 2, mnemonic: 'LD', operands: `A,$${hex(bytes[pos + 1], 2)}`, meta: { load: 'A', value: bytes[pos + 1] } };

  if (op === 0x18) {
    const target = START + pos + 2 + s8(bytes[pos + 1]);
    return { len: 2, mnemonic: 'JR', operands: `$${hex(target, 6)}`, meta: { jump: target } };
  }

  if (op === 0x10) {
    const target = START + pos + 2 + s8(bytes[pos + 1]);
    return { len: 2, mnemonic: 'DJNZ', operands: `$${hex(target, 6)}`, meta: { jump: target } };
  }

  if (op === 0xcd) return { len: 4, mnemonic: 'CALL', operands: `$${hex(u24(pos + 1), 6)}`, meta: { call: u24(pos + 1) } };
  if (op === 0xc9) return { len: 1, mnemonic: 'RET', operands: '', meta: { ret: true } };

  if (op === 0xed) {
    const op2 = bytes[pos + 1];
    if (op2 === 0xa0) return { len: 2, mnemonic: 'LDI', operands: '', meta: { transfer: 'LDI' } };
    if (op2 === 0xb0) return { len: 2, mnemonic: 'LDIR', operands: '', meta: { transfer: 'LDIR' } };
    if (op2 === 0x4b) return { len: 5, mnemonic: 'LD', operands: `BC,($${hex(u24(pos + 2), 6)})`, meta: { load: 'BC', fromAddress: u24(pos + 2) } };
    if (op2 === 0x5b) return { len: 5, mnemonic: 'LD', operands: `DE,($${hex(u24(pos + 2), 6)})`, meta: { load: 'DE', fromAddress: u24(pos + 2) } };
    if (op2 === 0x6b) return { len: 5, mnemonic: 'LD', operands: `HL,($${hex(u24(pos + 2), 6)})`, meta: { load: 'HL', fromAddress: u24(pos + 2) } };
  }

  if (op === 0xdd || op === 0xfd) {
    const reg = op === 0xdd ? 'IX' : 'IY';
    const op2 = bytes[pos + 1];
    if (op2 === 0x21) return { len: 5, mnemonic: 'LD', operands: `${reg},$${hex(u24(pos + 2), 6)}`, meta: { load: reg, value: u24(pos + 2) } };
  }

  if (op === 0xc3) return { len: 4, mnemonic: 'JP', operands: `$${hex(u24(pos + 1), 6)}`, meta: { jump: u24(pos + 1) } };
  if (op === 0xc6) return { len: 2, mnemonic: 'ADD', operands: `A,$${hex(bytes[pos + 1], 2)}`, meta: {} };
  if (op === 0xd6) return { len: 2, mnemonic: 'SUB', operands: `$${hex(bytes[pos + 1], 2)}`, meta: {} };
  if (op === 0xe6) return { len: 2, mnemonic: 'AND', operands: `$${hex(bytes[pos + 1], 2)}`, meta: {} };
  if (op === 0xf6) return { len: 2, mnemonic: 'OR', operands: `$${hex(bytes[pos + 1], 2)}`, meta: {} };
  if (op === 0xfe) return { len: 2, mnemonic: 'CP', operands: `$${hex(bytes[pos + 1], 2)}`, meta: {} };

  return { len: 1, mnemonic: 'DB', operands: `$${hex(op, 2)}`, meta: { unknown: true } };
}

const listing = [];
const calls = [];
let copyOp = null;
let lastBC = null;

for (let pos = 0; pos < bytes.length;) {
  const addr = START + pos;
  const ins = decodeAt(pos);
  listing.push({ addr, pos, ...ins });

  if (ins.meta.load === 'BC') lastBC = ins.meta.value ?? lastBC;
  if (ins.meta.transfer) copyOp = { op: ins.meta.transfer, addr, count: lastBC };
  if (ins.meta.call !== undefined) calls.push(ins.meta.call);

  pos += ins.len;
  if (ins.meta.ret) break;
}

console.log('Decode probe: 0x07CF96 shared copy/conversion routine');
console.log(`ROM: ${ROM_PATH}`);
console.log(`Read: ${READ_LEN} bytes at $${hex(START, 6)}`);
console.log('');
console.log('Address  Raw bytes        Instruction');
console.log('-------  ---------------  -----------');

for (const ins of listing) {
  const operands = ins.operands ? ` ${ins.operands}` : '';
  console.log(`${hex(ins.addr, 6)}   ${raw(ins.pos, ins.len).padEnd(15)}  ${ins.mnemonic}${operands}`);
}

console.log('');
console.log('Findings:');
if (copyOp) {
  const count = copyOp.count === null ? 'unknown BC count' : `${copyOp.count} byte(s) ($${hex(copyOp.count, 6)})`;
  console.log(`- Transfer uses ${copyOp.op} at $${hex(copyOp.addr, 6)} with ${count}.`);
  if (copyOp.count === 11) {
    console.log('- This matches one TI OS OP register span: OP2 at $D00603 through the 11-byte object slot.');
  }
} else {
  console.log('- No LDI/LDIR transfer opcode was decoded before RET.');
}

if (calls.length) {
  console.log(`- CALL target(s): ${calls.map(addr => `$${hex(addr, 6)}`).join(', ')}.`);
} else {
  console.log('- CALL target(s): none before RET.');
}

console.log('- Known caller 0x07CF9D enters with HL=$D00603 (OP2) and DE=$D02B39 (RAM save buffer).');
