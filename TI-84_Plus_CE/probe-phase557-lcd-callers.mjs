#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romPath = path.join(__dirname, 'ROM.rom');
const rom = fs.readFileSync(romPath);

const CALL_TARGET = 0x055280;
const CALLERS = [0x055228, 0x055261];
const WINDOW_BACK = 0x80;
const WINDOW_FORWARD = 0x80;

function hex(value, width = 6) {
  return `0x${value.toString(16).toUpperCase().padStart(width, '0')}`;
}

function byteHex(value) {
  return value.toString(16).toUpperCase().padStart(2, '0');
}

function read24(pos) {
  return rom[pos] | (rom[pos + 1] << 8) | (rom[pos + 2] << 16);
}

function bytesAt(addr, len) {
  return [...rom.subarray(addr, addr + len)].map(byteHex).join(' ');
}

function decodeAt(addr) {
  const b0 = rom[addr];
  const b1 = rom[addr + 1];
  const b2 = rom[addr + 2];
  const b3 = rom[addr + 3];

  if (b0 === 0x00) return { len: 1, text: 'NOP' };
  if (b0 === 0x3E) return { len: 2, text: `LD A,${hex(b1, 2)}`, effect: { a: b1 } };
  if (b0 === 0xAF) return { len: 1, text: 'XOR A', effect: { a: 0 } };
  if (b0 === 0xB7) return { len: 1, text: 'OR A' };
  if (b0 === 0xC9) return { len: 1, text: 'RET', terminal: true };
  if (b0 === 0xC0) return { len: 1, text: 'RET NZ', terminal: true };
  if (b0 === 0xC8) return { len: 1, text: 'RET Z', terminal: true };
  if (b0 === 0xD0) return { len: 1, text: 'RET NC', terminal: true };
  if (b0 === 0xD8) return { len: 1, text: 'RET C', terminal: true };
  if (b0 === 0xCD) return { len: 4, text: `CALL ${hex(read24(addr + 1))}`, call: read24(addr + 1) };
  if (b0 === 0xC3) return { len: 4, text: `JP ${hex(read24(addr + 1))}` };
  if (b0 === 0xCA) return { len: 4, text: `JP Z,${hex(read24(addr + 1))}` };
  if (b0 === 0xC2) return { len: 4, text: `JP NZ,${hex(read24(addr + 1))}` };
  if (b0 === 0xDA) return { len: 4, text: `JP C,${hex(read24(addr + 1))}` };
  if (b0 === 0xD2) return { len: 4, text: `JP NC,${hex(read24(addr + 1))}` };
  if (b0 === 0x18) return { len: 2, text: `JR ${signed8(b1)}` };
  if (b0 === 0x20) return { len: 2, text: `JR NZ,${signed8(b1)}` };
  if (b0 === 0x28) return { len: 2, text: `JR Z,${signed8(b1)}` };
  if (b0 === 0x30) return { len: 2, text: `JR NC,${signed8(b1)}` };
  if (b0 === 0x38) return { len: 2, text: `JR C,${signed8(b1)}` };
  if (b0 === 0x32) return { len: 4, text: `LD (${hex(read24(addr + 1))}),A` };
  if (b0 === 0x3A) return { len: 4, text: `LD A,(${hex(read24(addr + 1))})` };
  if (b0 === 0x21) return { len: 4, text: `LD HL,${hex(read24(addr + 1))}` };
  if (b0 === 0x11) return { len: 4, text: `LD DE,${hex(read24(addr + 1))}` };
  if (b0 === 0x01) return { len: 4, text: `LD BC,${hex(read24(addr + 1))}` };
  if (b0 === 0x2A) return { len: 4, text: `LD HL,(${hex(read24(addr + 1))})` };
  if (b0 === 0x22) return { len: 4, text: `LD (${hex(read24(addr + 1))}),HL` };
  if (b0 === 0xDB) return { len: 2, text: `IN A,(${hex(b1, 2)})` };
  if (b0 === 0xD3) return { len: 2, text: `OUT (${hex(b1, 2)}),A` };
  if (b0 === 0xF3) return { len: 1, text: 'DI' };
  if (b0 === 0xFB) return { len: 1, text: 'EI' };
  if (b0 === 0xF5) return { len: 1, text: 'PUSH AF' };
  if (b0 === 0xC5) return { len: 1, text: 'PUSH BC' };
  if (b0 === 0xD5) return { len: 1, text: 'PUSH DE' };
  if (b0 === 0xE5) return { len: 1, text: 'PUSH HL' };
  if (b0 === 0xF1) return { len: 1, text: 'POP AF' };
  if (b0 === 0xC1) return { len: 1, text: 'POP BC' };
  if (b0 === 0xD1) return { len: 1, text: 'POP DE' };
  if (b0 === 0xE1) return { len: 1, text: 'POP HL' };
  if (b0 === 0xCB) return decodeCb(addr, b1);

  if (b0 === 0xED) {
    if (b1 === 0x4B) return { len: 5, text: `LD BC,(${hex(read24(addr + 2))})` };
    if (b1 === 0x5B) return { len: 5, text: `LD DE,(${hex(read24(addr + 2))})` };
    if (b1 === 0x6B) return { len: 5, text: `LD HL,(${hex(read24(addr + 2))})` };
    if (b1 === 0x43) return { len: 5, text: `LD (${hex(read24(addr + 2))}),BC` };
    if (b1 === 0x53) return { len: 5, text: `LD (${hex(read24(addr + 2))}),DE` };
    if (b1 === 0x63) return { len: 5, text: `LD (${hex(read24(addr + 2))}),HL` };
    return { len: 2, text: `ED ${byteHex(b1)}` };
  }

  if (b0 === 0xDD || b0 === 0xFD) {
    return decodeIndexed(addr, b0, b1, b2, b3);
  }

  return { len: 1, text: `DB ${byteHex(b0)}` };
}

function decodeCb(addr, op) {
  const regs = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
  const bit = (op >> 3) & 7;
  const reg = regs[op & 7];
  if ((op & 0xC0) === 0x40) return { len: 2, text: `BIT ${bit},${reg}`, bitTest: { bit, reg } };
  if ((op & 0xC0) === 0x80) return { len: 2, text: `RES ${bit},${reg}` };
  if ((op & 0xC0) === 0xC0) return { len: 2, text: `SET ${bit},${reg}` };
  return { len: 2, text: `CB ${byteHex(op)}` };
}

function decodeIndexed(addr, prefix, b1, b2, b3) {
  const ix = prefix === 0xDD ? 'IX' : 'IY';
  if (b1 === 0x21) return { len: 5, text: `LD ${ix},${hex(read24(addr + 2))}` };
  if (b1 === 0x2A) return { len: 5, text: `LD ${ix},(${hex(read24(addr + 2))})` };
  if (b1 === 0x22) return { len: 5, text: `LD (${hex(read24(addr + 2))}),${ix}` };
  if (b1 === 0xCB) {
    const bit = (b3 >> 3) & 7;
    const disp = signed8(b2);
    if ((b3 & 0xC0) === 0x40) return { len: 4, text: `BIT ${bit},(${ix}${disp})`, bitTest: { bit, reg: `(${ix}${disp})` } };
    if ((b3 & 0xC0) === 0x80) return { len: 4, text: `RES ${bit},(${ix}${disp})` };
    if ((b3 & 0xC0) === 0xC0) return { len: 4, text: `SET ${bit},(${ix}${disp})` };
  }
  return { len: 2, text: `${byteHex(prefix)} ${byteHex(b1)}` };
}

function signed8(value) {
  const n = value > 0x7F ? value - 0x100 : value;
  return n >= 0 ? `+${n}` : `${n}`;
}

function findBoundary(callAddr) {
  const min = Math.max(0, callAddr - WINDOW_BACK);
  let start = min;
  for (let pos = callAddr - 1; pos >= min; pos--) {
    if (rom[pos] === 0xC9) {
      start = pos + 1;
      break;
    }
  }
  return start;
}

function disassembleFunction(start, callAddr) {
  const lines = [];
  const decoded = [];
  let addr = start;
  let afterCall = false;
  const max = Math.min(rom.length, callAddr + WINDOW_FORWARD);

  while (addr < max) {
    const ins = decodeAt(addr);
    decoded.push({ addr, ...ins });
    const marker = addr === callAddr ? '  <-- CALLER' : afterCall ? '  ; after call' : '';
    lines.push(`${hex(addr)}  ${bytesAt(addr, ins.len).padEnd(14)}  ${ins.text}${marker}`);
    addr += ins.len;
    if (ins.call === CALL_TARGET) afterCall = true;
    if (afterCall && ins.terminal) break;
  }

  return { end: addr, lines, decoded };
}

function lastAValueBeforeCall(decoded, callAddr) {
  let last = null;
  for (const ins of decoded) {
    if (ins.addr >= callAddr) break;
    if (ins.effect && Object.hasOwn(ins.effect, 'a')) {
      last = { addr: ins.addr, value: ins.effect.a, text: ins.text };
    }
  }
  return last;
}

function findNeedles(start, end) {
  const needles = [
    { name: 'BPP flag D000C6', bytes: [0xC6, 0x00, 0xD0] },
    { name: '8bpp back buffer D52C00', bytes: [0x00, 0x2C, 0xD5] },
    { name: 'VRAM D40000', bytes: [0x00, 0x00, 0xD4] },
    { name: 'LCD mode setup call 055280', bytes: [0xCD, 0x80, 0x52, 0x05] },
  ];
  const hits = [];
  for (const needle of needles) {
    for (let pos = start; pos <= end - needle.bytes.length; pos++) {
      if (needle.bytes.every((b, i) => rom[pos + i] === b)) {
        hits.push(`${hex(pos)}: ${needle.name}`);
      }
    }
  }
  return hits;
}

console.log('Phase 557: LCD register setup callers');
console.log(`ROM: ${romPath} (${rom.length} bytes)`);
console.log(`Target: CALL ${hex(CALL_TARGET)}`);
console.log('');

for (const callAddr of CALLERS) {
  const start = findBoundary(callAddr);
  const { end, lines, decoded } = disassembleFunction(start, callAddr);
  const a = lastAValueBeforeCall(decoded, callAddr);
  const hits = findNeedles(start, end);
  const call = decoded.find((ins) => ins.addr === callAddr);

  console.log(`Caller at ${hex(callAddr)}`);
  console.log(`  Boundary guess: ${hex(start)}..${hex(end - 1)}`);
  console.log(`  CALL decode: ${call ? call.text : 'not aligned by local decoder'}`);
  if (a) {
    console.log(`  A before CALL: ${hex(a.value, 2)} from ${hex(a.addr)} (${a.text})`);
  } else {
    console.log('  A before CALL: not found by local immediate-A tracking');
  }
  console.log(`  Address/mode clues: ${hits.length ? hits.join('; ') : 'none in decoded window'}`);
  console.log('  Disassembly:');
  for (const line of lines) console.log(`    ${line}`);
  console.log('');
}

console.log('Interpretation notes:');
console.log('- Confirm LCD mode values from the "A before CALL" lines.');
console.log('- D000C6 hits identify BPP flag references; inspect nearby BIT instructions for 8bpp/16bpp branching.');
console.log('- Lines after the CALL show whether each caller returns immediately or performs additional mode-switch cleanup.');
