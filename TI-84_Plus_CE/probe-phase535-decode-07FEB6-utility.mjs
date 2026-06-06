import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const START = 0x07FEB6;
const READ_LEN = 0x80;

const rom = fs.readFileSync(ROM_PATH);
const bytes = rom.subarray(START, START + READ_LEN);

const hex = (n, width = 2) => `0x${n.toString(16).toUpperCase().padStart(width, '0')}`;
const sx = (n) => (n & 0x80 ? n - 0x100 : n);
const u16 = (off) => bytes[off] | (bytes[off + 1] << 8);
const u24 = (off) => bytes[off] | (bytes[off + 1] << 8) | (bytes[off + 2] << 16);

const r = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
const rp = ['BC', 'DE', 'HL', 'SP'];
const rp2 = ['BC', 'DE', 'HL', 'AF'];
const cc = ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'];
const alu = ['ADD A,', 'ADC A,', 'SUB', 'SBC A,', 'AND', 'XOR', 'OR', 'CP'];

const callTargets = [];
const ramRefs = [];

function decodeCB(op) {
  const x = op >> 6;
  const y = (op >> 3) & 7;
  const z = op & 7;
  if (x === 0) {
    const rot = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'];
    return `${rot[y]} ${r[z]}`;
  }
  if (x === 1) return `BIT ${y},${r[z]}`;
  if (x === 2) return `RES ${y},${r[z]}`;
  return `SET ${y},${r[z]}`;
}

function decodeED(op) {
  const table = {
    0x44: 'NEG',
    0x45: 'RETN',
    0x47: 'LD I,A',
    0x4D: 'RETI',
    0x4F: 'LD R,A',
    0x57: 'LD A,I',
    0x5F: 'LD A,R',
    0x67: 'RRD',
    0x6F: 'RLD',
    0xA0: 'LDI',
    0xA1: 'CPI',
    0xA8: 'LDD',
    0xB0: 'LDIR',
    0xB1: 'CPIR',
    0xB8: 'LDDR',
  };
  return table[op] ?? `ED ${hex(op)}`;
}

function decodeAt(pcOff) {
  const addr = START + pcOff;
  let off = pcOff;
  let mode = 'ADL';
  let prefix = '';

  if ([0x40, 0x49, 0x52].includes(bytes[off])) {
    prefix = bytes[off] === 0x40 ? '.SIS ' : bytes[off] === 0x49 ? '.LIL ' : '.SIL ';
    mode = bytes[off] === 0x49 ? 'ADL' : 'SIL';
    off += 1;
  }

  const op = bytes[off++];
  const immWidth = mode === 'ADL' ? 3 : 2;
  const imm = () => (immWidth === 3 ? u24(off) : u16(off));
  const targetWidth = immWidth === 3 ? 6 : 4;
  let text = `DB ${hex(op)}`;
  let terminal = false;

  if (op === 0xCB) {
    text = decodeCB(bytes[off++]);
  } else if (op === 0xED) {
    text = decodeED(bytes[off++]);
  } else if (op === 0xDD || op === 0xFD) {
    const ix = op === 0xDD ? 'IX' : 'IY';
    const op2 = bytes[off++];
    if (op2 === 0x21) {
      const value = imm();
      off += immWidth;
      text = `LD ${ix},${hex(value, targetWidth)}`;
    } else if (op2 === 0x22) {
      const value = imm();
      off += immWidth;
      text = `LD (${hex(value, targetWidth)}),${ix}`;
      ramRefs.push(value);
    } else if (op2 === 0x2A) {
      const value = imm();
      off += immWidth;
      text = `LD ${ix},(${hex(value, targetWidth)})`;
      ramRefs.push(value);
    } else if (op2 === 0xCB) {
      const disp = bytes[off++];
      const cb = bytes[off++];
      text = decodeCB(cb).replace('(HL)', `(${ix}+${sx(disp)})`);
    } else {
      text = `${ix} ${hex(op2)}`;
    }
  } else if ((op & 0xC7) === 0x06) {
    text = `LD ${r[(op >> 3) & 7]},${hex(bytes[off++])}`;
  } else if ((op & 0xCF) === 0x01) {
    const value = imm();
    off += immWidth;
    text = `LD ${rp[(op >> 4) & 3]},${hex(value, targetWidth)}`;
  } else if ((op & 0xC0) === 0x40) {
    text = op === 0x76 ? 'HALT' : `LD ${r[(op >> 3) & 7]},${r[op & 7]}`;
  } else if ((op & 0xC0) === 0x80) {
    text = `${alu[(op >> 3) & 7]} ${r[op & 7]}`;
  } else if ((op & 0xC7) === 0x04) {
    text = `INC ${r[(op >> 3) & 7]}`;
  } else if ((op & 0xC7) === 0x05) {
    text = `DEC ${r[(op >> 3) & 7]}`;
  } else if ((op & 0xCF) === 0x03) {
    text = `INC ${rp[(op >> 4) & 3]}`;
  } else if ((op & 0xCF) === 0x0B) {
    text = `DEC ${rp[(op >> 4) & 3]}`;
  } else if ((op & 0xCF) === 0x09) {
    text = `ADD HL,${rp[(op >> 4) & 3]}`;
  } else if ((op & 0xC7) === 0xC0) {
    text = `RET ${cc[(op >> 3) & 7]}`;
  } else if ((op & 0xC7) === 0xC2) {
    const value = imm();
    off += immWidth;
    text = `JP ${cc[(op >> 3) & 7]},${hex(value, targetWidth)}`;
  } else if ((op & 0xC7) === 0xC4) {
    const value = imm();
    off += immWidth;
    text = `CALL ${cc[(op >> 3) & 7]},${hex(value, targetWidth)}`;
    callTargets.push(value);
  } else if ((op & 0xC7) === 0xC6) {
    text = `${alu[(op >> 3) & 7]} ${hex(bytes[off++])}`;
  } else if ((op & 0xCF) === 0xC5) {
    text = `PUSH ${rp2[(op >> 4) & 3]}`;
  } else if ((op & 0xCF) === 0xC1) {
    text = `POP ${rp2[(op >> 4) & 3]}`;
  } else {
    switch (op) {
      case 0x00: text = 'NOP'; break;
      case 0x02: text = 'LD (BC),A'; break;
      case 0x07: text = 'RLCA'; break;
      case 0x08: text = 'EX AF,AF\''; break;
      case 0x0A: text = 'LD A,(BC)'; break;
      case 0x0F: text = 'RRCA'; break;
      case 0x10: text = `DJNZ ${hex(addr + 2 + sx(bytes[off]), 6)}`; off += 1; break;
      case 0x12: text = 'LD (DE),A'; break;
      case 0x17: text = 'RLA'; break;
      case 0x18: text = `JR ${hex(addr + 2 + sx(bytes[off]), 6)}`; off += 1; break;
      case 0x1A: text = 'LD A,(DE)'; break;
      case 0x1F: text = 'RRA'; break;
      case 0x20: text = `JR NZ,${hex(addr + 2 + sx(bytes[off]), 6)}`; off += 1; break;
      case 0x22: {
        const value = imm();
        off += immWidth;
        text = `LD (${hex(value, targetWidth)}),HL`;
        ramRefs.push(value);
        break;
      }
      case 0x27: text = 'DAA'; break;
      case 0x28: text = `JR Z,${hex(addr + 2 + sx(bytes[off]), 6)}`; off += 1; break;
      case 0x2A: {
        const value = imm();
        off += immWidth;
        text = `LD HL,(${hex(value, targetWidth)})`;
        ramRefs.push(value);
        break;
      }
      case 0x2F: text = 'CPL'; break;
      case 0x30: text = `JR NC,${hex(addr + 2 + sx(bytes[off]), 6)}`; off += 1; break;
      case 0x32: {
        const value = imm();
        off += immWidth;
        text = `LD (${hex(value, targetWidth)}),A`;
        ramRefs.push(value);
        break;
      }
      case 0x37: text = 'SCF'; break;
      case 0x38: text = `JR C,${hex(addr + 2 + sx(bytes[off]), 6)}`; off += 1; break;
      case 0x3A: {
        const value = imm();
        off += immWidth;
        text = `LD A,(${hex(value, targetWidth)})`;
        ramRefs.push(value);
        break;
      }
      case 0x3F: text = 'CCF'; break;
      case 0xC3: {
        const value = imm();
        off += immWidth;
        text = `JP ${hex(value, targetWidth)}`;
        terminal = true;
        break;
      }
      case 0xC9: text = 'RET'; terminal = true; break;
      case 0xCD: {
        const value = imm();
        off += immWidth;
        text = `CALL ${hex(value, targetWidth)}`;
        callTargets.push(value);
        break;
      }
      case 0xD3: text = `OUT (${hex(bytes[off++])}),A`; break;
      case 0xD9: text = 'EXX'; break;
      case 0xDB: text = `IN A,(${hex(bytes[off++])})`; break;
      case 0xE3: text = 'EX (SP),HL'; break;
      case 0xE6: text = `AND ${hex(bytes[off++])}`; break;
      case 0xE9: text = 'JP (HL)'; terminal = true; break;
      case 0xEB: text = 'EX DE,HL'; break;
      case 0xF3: text = 'DI'; break;
      case 0xF6: text = `OR ${hex(bytes[off++])}`; break;
      case 0xF9: text = 'LD SP,HL'; break;
      case 0xFB: text = 'EI'; break;
      case 0xFE: text = `CP ${hex(bytes[off++])}`; break;
      default: break;
    }
  }

  const raw = Array.from(bytes.subarray(pcOff, off)).map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
  return { addr, size: off - pcOff, raw, text: prefix + text, terminal };
}

const insns = [];
let off = 0;
while (off < bytes.length) {
  const insn = decodeAt(off);
  insns.push(insn);
  off += Math.max(insn.size, 1);
  if (insn.terminal) break;
}

const uniqueCalls = [...new Set(callTargets)].sort((a, b) => a - b);
const uniqueRefs = [...new Set(ramRefs)].sort((a, b) => a - b);
const functionSize = insns.reduce((sum, insn) => sum + insn.size, 0);

console.log('Probe phase 535: decode 0x07FEB6 utility');
console.log(`ROM: ${ROM_PATH}`);
console.log(`Range: ${hex(START, 6)}..${hex(START + READ_LEN - 1, 6)} (${hex(READ_LEN)} bytes read)`);
console.log(`Decoded function size: ${functionSize} bytes (${hex(functionSize)})`);
console.log('');
console.log('Disassembly:');
for (const insn of insns) {
  console.log(`${hex(insn.addr, 6)}  ${insn.raw.padEnd(14)}  ${insn.text}`);
}
console.log('');
console.log(`CALL targets: ${uniqueCalls.length ? uniqueCalls.map((v) => hex(v, 6)).join(', ') : '(none)'}`);
console.log(`RAM/direct address refs: ${uniqueRefs.length ? uniqueRefs.map((v) => hex(v, 6)).join(', ') : '(none)'}`);
console.log('');
console.log('Purpose hypothesis:');
console.log('- Utility in the 0x07FExx descriptor/type/BCD helper region.');
console.log('- Calls, direct RAM references, and local control flow above should be compared with the 0x056B0F descriptor rendering caller and neighboring 0x07FE9C transform.');
console.log('- Expected known call target to check in output: 0x07F7A8.');
