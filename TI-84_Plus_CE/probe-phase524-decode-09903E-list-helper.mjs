import fs from 'node:fs';
import path from 'node:path';

const ROM_PATH = path.join('TI-84_Plus_CE', 'ROM.rom');
const TARGET = 0x09903e;
const MAX_MAIN_BYTES = 0x200;
const CALL_PREVIEW_BYTES = 0x40;

const rom = fs.readFileSync(ROM_PATH);

function hex(value, width = 6) {
  return `0x${value.toString(16).toUpperCase().padStart(width, '0')}`;
}

function byteHex(value) {
  return value.toString(16).toUpperCase().padStart(2, '0');
}

function bytesAt(addr, len) {
  return Array.from(rom.slice(addr, addr + len));
}

function readU16(addr) {
  return rom[addr] | (rom[addr + 1] << 8);
}

function readU24(addr) {
  return rom[addr] | (rom[addr + 1] << 8) | (rom[addr + 2] << 16);
}

function rel8(value) {
  return value < 0x80 ? value : value - 0x100;
}

function fmtBytes(bytes) {
  return bytes.map(byteHex).join(' ');
}

function operandAddr(addr, sis) {
  return sis ? readU16(addr) : readU24(addr);
}

function operandLen(sis) {
  return sis ? 2 : 3;
}

function indexedName(prefix) {
  if (prefix === 0xdd) return 'IX';
  if (prefix === 0xfd) return 'IY';
  return 'HL';
}

function decodeInstruction(addr) {
  const start = addr;
  let sis = false;
  let indexPrefix = null;
  const prefixes = [];

  for (;;) {
    const b = rom[addr];
    if (b === 0x40 && !sis) {
      sis = true;
      prefixes.push(b);
      addr += 1;
      continue;
    }
    if ((b === 0xdd || b === 0xfd) && indexPrefix === null) {
      indexPrefix = b;
      prefixes.push(b);
      addr += 1;
      continue;
    }
    break;
  }

  const opAddr = addr;
  const op = rom[addr++];
  const mode = sis ? '.SIS ' : '';
  const rr = indexedName(indexPrefix);
  const immBytes = operandLen(sis);
  let text = `${mode}DB ${hex(op, 2)}`;
  let kind = 'normal';
  let target = null;
  let ram = null;

  function finish(mnemonic, extra = {}) {
    const len = addr - start;
    return {
      addr: start,
      len,
      bytes: bytesAt(start, len),
      text: mnemonic,
      kind: extra.kind ?? kind,
      target: extra.target ?? target,
      ram: extra.ram ?? ram,
    };
  }

  if (indexPrefix !== null && op === 0xcb) {
    const disp = rom[addr++];
    const cb = rom[addr++];
    const bit = (cb >> 3) & 7;
    const low = cb & 7;
    const dispText = rel8(disp);
    if ((cb & 0xc7) === 0x46) {
      return finish(`${mode}BIT ${bit},(${rr}${dispText < 0 ? '' : '+'}${dispText})`);
    }
    return finish(`${mode}DB ${hex(indexPrefix, 2)}, CB, ${hex(disp, 2)}, ${hex(cb, 2)}`);
  }

  switch (op) {
    case 0x00: text = 'NOP'; break;
    case 0x01: {
      const value = sis ? readU16(addr) : readU24(addr);
      addr += immBytes;
      text = `${mode}LD BC,${hex(value, sis ? 4 : 6)}`;
      break;
    }
    case 0x06: text = `LD B,${hex(rom[addr++], 2)}`; break;
    case 0x0e: text = `LD C,${hex(rom[addr++], 2)}`; break;
    case 0x11: {
      const value = sis ? readU16(addr) : readU24(addr);
      addr += immBytes;
      text = `${mode}LD DE,${hex(value, sis ? 4 : 6)}`;
      break;
    }
    case 0x16: text = `LD D,${hex(rom[addr++], 2)}`; break;
    case 0x1e: text = `LD E,${hex(rom[addr++], 2)}`; break;
    case 0x21: {
      const value = sis ? readU16(addr) : readU24(addr);
      addr += immBytes;
      text = `${mode}LD ${rr},${hex(value, sis ? 4 : 6)}`;
      break;
    }
    case 0x22: {
      const value = operandAddr(addr, sis);
      addr += immBytes;
      ram = value;
      text = `${mode}LD (${hex(value, sis ? 4 : 6)}),${rr}`;
      break;
    }
    case 0x23: text = `INC ${rr}`; break;
    case 0x2a: {
      const value = operandAddr(addr, sis);
      addr += immBytes;
      ram = value;
      text = `${mode}LD ${rr},(${hex(value, sis ? 4 : 6)})`;
      break;
    }
    case 0x32: {
      const value = operandAddr(addr, sis);
      addr += immBytes;
      ram = value;
      text = `${mode}LD (${hex(value, sis ? 4 : 6)}),A`;
      break;
    }
    case 0x36: text = `LD (${rr}),${hex(rom[addr++], 2)}`; break;
    case 0x3a: {
      const value = operandAddr(addr, sis);
      addr += immBytes;
      ram = value;
      text = `${mode}LD A,(${hex(value, sis ? 4 : 6)})`;
      break;
    }
    case 0x3e: text = `LD A,${hex(rom[addr++], 2)}`; break;
    case 0x77: text = `LD (${rr}),A`; break;
    case 0x7e: text = `LD A,(${rr})`; break;
    case 0xaf: text = 'XOR A'; break;
    case 0xb7: text = 'OR A'; break;
    case 0xc0: text = 'RET NZ'; kind = 'ret'; break;
    case 0xc1: text = 'POP BC'; break;
    case 0xc3: {
      target = readU24(addr);
      addr += 3;
      text = `JP ${hex(target)}`;
      kind = 'jp';
      break;
    }
    case 0xc5: text = 'PUSH BC'; break;
    case 0xc8: text = 'RET Z'; kind = 'ret'; break;
    case 0xc9: text = 'RET'; kind = 'ret'; break;
    case 0xcd: {
      target = readU24(addr);
      addr += 3;
      text = `CALL ${hex(target)}`;
      kind = 'call';
      break;
    }
    case 0xd0: text = 'RET NC'; kind = 'ret'; break;
    case 0xd1: text = 'POP DE'; break;
    case 0xd5: text = 'PUSH DE'; break;
    case 0xd8: text = 'RET C'; kind = 'ret'; break;
    case 0xe0: text = 'RET PO'; kind = 'ret'; break;
    case 0xe1: text = `POP ${rr}`; break;
    case 0xe5: text = `PUSH ${rr}`; break;
    case 0xe8: text = 'RET PE'; kind = 'ret'; break;
    case 0xf0: text = 'RET P'; kind = 'ret'; break;
    case 0xf1: text = 'POP AF'; break;
    case 0xf5: text = 'PUSH AF'; break;
    case 0xf8: text = 'RET M'; kind = 'ret'; break;
    case 0xfe: text = `CP ${hex(rom[addr++], 2)}`; break;
    case 0x18: {
      const off = rel8(rom[addr++]);
      target = addr + off;
      text = `JR ${hex(target)} ; ${off >= 0 ? '+' : ''}${off}`;
      kind = 'jr';
      break;
    }
    case 0x20: {
      const off = rel8(rom[addr++]);
      target = addr + off;
      text = `JR NZ,${hex(target)} ; ${off >= 0 ? '+' : ''}${off}`;
      kind = 'jr';
      break;
    }
    case 0x28: {
      const off = rel8(rom[addr++]);
      target = addr + off;
      text = `JR Z,${hex(target)} ; ${off >= 0 ? '+' : ''}${off}`;
      kind = 'jr';
      break;
    }
    case 0x30: {
      const off = rel8(rom[addr++]);
      target = addr + off;
      text = `JR NC,${hex(target)} ; ${off >= 0 ? '+' : ''}${off}`;
      kind = 'jr';
      break;
    }
    case 0x38: {
      const off = rel8(rom[addr++]);
      target = addr + off;
      text = `JR C,${hex(target)} ; ${off >= 0 ? '+' : ''}${off}`;
      kind = 'jr';
      break;
    }
    case 0xed: {
      const ed = rom[addr++];
      if (ed === 0xb0) text = 'LDIR';
      else if (ed === 0xb8) text = 'LDDR';
      else text = `DB ED, ${hex(ed, 2)}`;
      break;
    }
    default:
      text = `${prefixes.map(byteHex).join(' ')}${prefixes.length ? ' ' : ''}DB ${hex(op, 2)}`;
      break;
  }

  if (opAddr !== start && !text.startsWith('.SIS') && sis) {
    text = `.SIS ${text}`;
  }
  return finish(text);
}

function disassembleLinear(start, maxBytes) {
  const out = [];
  let pc = start;
  const end = Math.min(start + maxBytes, rom.length);
  while (pc < end) {
    const inst = decodeInstruction(pc);
    out.push(inst);
    pc += inst.len;
    if (inst.kind === 'ret' || inst.kind === 'jp') break;
  }
  return out;
}

function unique(values) {
  return [...new Set(values.filter((value) => value !== null && value !== undefined))];
}

function printListing(title, listing) {
  console.log(title);
  for (const inst of listing) {
    console.log(`${hex(inst.addr)}  ${fmtBytes(inst.bytes).padEnd(18)}  ${inst.text}`);
  }
}

const main = disassembleLinear(TARGET, MAX_MAIN_BYTES);
const calls = unique(main.filter((inst) => inst.kind === 'call').map((inst) => inst.target));
const jumps = unique(main.filter((inst) => inst.kind === 'jp' || inst.kind === 'jr').map((inst) => inst.target));
const ramRefs = unique(main.map((inst) => inst.ram));

console.log('=== Decode 0x09903E: list setup helper ===');
console.log(`ROM: ${ROM_PATH}`);
console.log(`Target: ${hex(TARGET)}`);
console.log(`Decoded bytes: ${main.reduce((sum, inst) => sum + inst.len, 0)}`);
console.log(`Instruction count: ${main.length}`);
console.log('');

printListing('--- Main function ---', main);
console.log('');

console.log('--- References ---');
console.log(`CALL targets: ${calls.length ? calls.map((addr) => hex(addr)).join(', ') : '(none)'}`);
console.log(`JP/JR targets: ${jumps.length ? jumps.map((addr) => hex(addr)).join(', ') : '(none)'}`);
console.log(`Immediate RAM/address refs: ${ramRefs.length ? ramRefs.map((addr) => hex(addr)).join(', ') : '(none)'}`);
console.log('');

for (const call of calls) {
  const preview = disassembleLinear(call, CALL_PREVIEW_BYTES);
  printListing(`--- CALL preview ${hex(call)} first ~${CALL_PREVIEW_BYTES} bytes ---`, preview);
  console.log('');
}

console.log('--- Purpose summary ---');
console.log([
  '0x09903E is the helper invoked by the list/complex setup path immediately before',
  'the caller stores BC into D00338 and appends the closing list terminator bytes',
  "0x7D ('}') and 0x00 at the edit-buffer end pointer. The listing above identifies",
  'the helper-local RAM references, any subroutine calls, and terminal control flow',
  'so the exact setup side effects can be correlated with the surrounding 0x097C8A',
  'metadata write.',
].join(' '));
