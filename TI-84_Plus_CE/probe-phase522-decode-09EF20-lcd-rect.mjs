import fs from 'fs';
import path from 'path';

const ROM_PATH = path.join(import.meta.dirname, 'ROM.rom');
const START = 0x09ef20;
const MAX_FUNCTION_BYTES = 0x500;
const LCD_PORT_MIN = 0x0800;
const LCD_PORT_MAX = 0x0fff;

const rom = new Uint8Array(fs.readFileSync(ROM_PATH).buffer);

const hex = (value, width = 2) => `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
const sx8 = (value) => (value & 0x80 ? value - 0x100 : value);
const u16 = (addr) => rom[addr] | (rom[addr + 1] << 8);
const u24 = (addr) => rom[addr] | (rom[addr + 1] << 8) | (rom[addr + 2] << 16);
const inRom = (addr) => addr >= 0 && addr < rom.length;

const reg8 = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
const reg16 = ['BC', 'DE', 'HL', 'SP'];
const alu = ['ADD A', 'ADC A', 'SUB', 'SBC A', 'AND', 'XOR', 'OR', 'CP'];
const conditions = ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'];

function isLcdPort(port) {
  return port >= LCD_PORT_MIN && port <= LCD_PORT_MAX;
}

function relTarget(addr, size, disp) {
  return (addr + size + sx8(disp)) & 0xffffff;
}

function opRegPair(op) {
  return reg16[(op >> 4) & 3];
}

function decodeEd(addr) {
  const op = rom[addr + 1];
  const base = { addr, size: 2, bytes: [0xed, op], text: `ED ${hex(op)}` };
  const rr = reg16[(op >> 4) & 3];

  if ((op & 0xcf) === 0x42) return { ...base, text: `SBC HL,${rr}` };
  if ((op & 0xcf) === 0x4a) return { ...base, text: `ADC HL,${rr}` };
  if ((op & 0xcf) === 0x43) {
    const imm = u24(addr + 2);
    return { ...base, size: 5, bytes: [...base.bytes, rom[addr + 2], rom[addr + 3], rom[addr + 4]], text: `LD (${hex(imm, 6)}),${rr}` };
  }
  if ((op & 0xcf) === 0x4b) {
    const imm = u24(addr + 2);
    return { ...base, size: 5, bytes: [...base.bytes, rom[addr + 2], rom[addr + 3], rom[addr + 4]], text: `LD ${rr},(${hex(imm, 6)})` };
  }
  if ((op & 0xc7) === 0x40) return { ...base, text: `IN ${reg8[(op >> 3) & 7]},(C)`, portIO: { kind: 'IN', port: 'C', dynamic: true } };
  if ((op & 0xc7) === 0x41) return { ...base, text: `OUT (C),${reg8[(op >> 3) & 7]}`, portIO: { kind: 'OUT', port: 'C', dynamic: true } };
  if ((op & 0xcf) === 0x4c) return { ...base, text: `MLT ${rr}` };

  const block = {
    0xa0: 'LDI', 0xa1: 'CPI', 0xa2: 'INI', 0xa3: 'OUTI',
    0xa8: 'LDD', 0xa9: 'CPD', 0xaa: 'IND', 0xab: 'OUTD',
    0xb0: 'LDIR', 0xb1: 'CPIR', 0xb2: 'INIR', 0xb3: 'OTIR',
    0xb8: 'LDDR', 0xb9: 'CPDR', 0xba: 'INDR', 0xbb: 'OTDR',
  }[op];
  if (block) return { ...base, text: block };

  const single = {
    0x44: 'NEG', 0x45: 'RETN', 0x46: 'IM 0', 0x47: 'LD I,A', 0x4d: 'RETI',
    0x4f: 'LD R,A', 0x56: 'IM 1', 0x57: 'LD A,I', 0x5e: 'IM 2', 0x5f: 'LD A,R',
    0x67: 'RRD', 0x6f: 'RLD',
  }[op];
  if (single) return { ...base, text: single, ret: op === 0x45 || op === 0x4d };
  return base;
}

function decode(addr) {
  const op = rom[addr];
  const base = { addr, size: 1, bytes: [op], text: hex(op) };

  if (op === 0xed) return decodeEd(addr);
  if (op === 0x00) return { ...base, text: 'NOP' };
  if (op === 0x76) return { ...base, text: 'HALT' };
  if (op === 0xc9) return { ...base, text: 'RET', ret: true };
  if (op === 0xd9) return { ...base, text: 'EXX' };
  if (op === 0xeb) return { ...base, text: 'EX DE,HL' };
  if (op === 0xe3) return { ...base, text: 'EX (SP),HL' };
  if (op === 0xf9) return { ...base, text: 'LD SP,HL' };
  if (op === 0x08) return { ...base, text: "EX AF,AF'" };
  if (op === 0x2f) return { ...base, text: 'CPL' };
  if (op === 0x3f) return { ...base, text: 'CCF' };
  if (op === 0x37) return { ...base, text: 'SCF' };
  if (op === 0x27) return { ...base, text: 'DAA' };
  if (op === 0xf3) return { ...base, text: 'DI' };
  if (op === 0xfb) return { ...base, text: 'EI' };

  if ((op & 0xc7) === 0x04) return { ...base, text: `INC ${reg8[(op >> 3) & 7]}` };
  if ((op & 0xc7) === 0x05) return { ...base, text: `DEC ${reg8[(op >> 3) & 7]}` };
  if ((op & 0xc7) === 0x06) return { ...base, size: 2, bytes: [op, rom[addr + 1]], text: `LD ${reg8[(op >> 3) & 7]},${hex(rom[addr + 1])}` };
  if ((op & 0xcf) === 0x01) {
    const imm = u24(addr + 1);
    return { ...base, size: 4, bytes: [op, rom[addr + 1], rom[addr + 2], rom[addr + 3]], text: `LD ${opRegPair(op)},${hex(imm, 6)}` };
  }
  if ((op & 0xcf) === 0x03) return { ...base, text: `INC ${opRegPair(op)}` };
  if ((op & 0xcf) === 0x0b) return { ...base, text: `DEC ${opRegPair(op)}` };
  if ((op & 0xcf) === 0x09) return { ...base, text: `ADD HL,${opRegPair(op)}` };
  if ((op & 0xc0) === 0x40) return { ...base, text: `LD ${reg8[(op >> 3) & 7]},${reg8[op & 7]}` };
  if ((op & 0xc0) === 0x80) return { ...base, text: `${alu[(op >> 3) & 7]}${alu[(op >> 3) & 7].endsWith('A') ? ',' : ' '}${reg8[op & 7]}`.replace('A  ', 'A,') };

  const misc = {
    0x02: 'LD (BC),A', 0x0a: 'LD A,(BC)', 0x12: 'LD (DE),A', 0x1a: 'LD A,(DE)',
    0x22: null, 0x2a: null, 0x32: null, 0x3a: null,
    0x07: 'RLCA', 0x0f: 'RRCA', 0x17: 'RLA', 0x1f: 'RRA',
  }[op];
  if (misc) return { ...base, text: misc };
  if (op === 0x22 || op === 0x2a || op === 0x32 || op === 0x3a) {
    const imm = u24(addr + 1);
    const text = { 0x22: `LD (${hex(imm, 6)}),HL`, 0x2a: `LD HL,(${hex(imm, 6)})`, 0x32: `LD (${hex(imm, 6)}),A`, 0x3a: `LD A,(${hex(imm, 6)})` }[op];
    return { ...base, size: 4, bytes: [op, rom[addr + 1], rom[addr + 2], rom[addr + 3]], text };
  }
  if (op === 0x18 || op === 0x10 || op === 0x20 || op === 0x28 || op === 0x30 || op === 0x38) {
    const target = relTarget(addr, 2, rom[addr + 1]);
    const name = op === 0x18 ? 'JR' : op === 0x10 ? 'DJNZ' : `JR ${conditions[(op >> 3) & 3]}`;
    return { ...base, size: 2, bytes: [op, rom[addr + 1]], text: `${name},${hex(target, 6)}`, branch: target, conditional: op !== 0x18 };
  }
  if (op === 0xc3) {
    const target = u24(addr + 1);
    return { ...base, size: 4, bytes: [op, rom[addr + 1], rom[addr + 2], rom[addr + 3]], text: `JP ${hex(target, 6)}`, branch: target, terminal: true };
  }
  if ((op & 0xc7) === 0xc2) {
    const target = u24(addr + 1);
    return { ...base, size: 4, bytes: [op, rom[addr + 1], rom[addr + 2], rom[addr + 3]], text: `JP ${conditions[(op >> 3) & 7]},${hex(target, 6)}`, branch: target, conditional: true };
  }
  if (op === 0xcd) {
    const target = u24(addr + 1);
    return { ...base, size: 4, bytes: [op, rom[addr + 1], rom[addr + 2], rom[addr + 3]], text: `CALL ${hex(target, 6)}`, call: target };
  }
  if ((op & 0xc7) === 0xc4) {
    const target = u24(addr + 1);
    return { ...base, size: 4, bytes: [op, rom[addr + 1], rom[addr + 2], rom[addr + 3]], text: `CALL ${conditions[(op >> 3) & 7]},${hex(target, 6)}`, call: target, conditional: true };
  }
  if ((op & 0xc7) === 0xc0) return { ...base, text: `RET ${conditions[(op >> 3) & 7]}`, ret: true, conditional: true };
  if ((op & 0xc7) === 0xc6) return { ...base, size: 2, bytes: [op, rom[addr + 1]], text: `${alu[(op >> 3) & 7]} ${hex(rom[addr + 1])}` };
  if ((op & 0xcf) === 0xc5) return { ...base, text: `PUSH ${['BC', 'DE', 'HL', 'AF'][(op >> 4) & 3]}` };
  if ((op & 0xcf) === 0xc1) return { ...base, text: `POP ${['BC', 'DE', 'HL', 'AF'][(op >> 4) & 3]}` };
  if (op === 0xd3) {
    const port = rom[addr + 1];
    return { ...base, size: 2, bytes: [op, port], text: `OUT (${hex(port)}),A`, portIO: { kind: 'OUT', port } };
  }
  if (op === 0xdb) {
    const port = rom[addr + 1];
    return { ...base, size: 2, bytes: [op, port], text: `IN A,(${hex(port)})`, portIO: { kind: 'IN', port } };
  }
  return base;
}

function disassembleFunction(start, { followCalls = false } = {}) {
  const seen = new Set();
  const queue = [start];
  const instructions = new Map();
  const calls = new Set();
  const ports = [];

  while (queue.length) {
    let pc = queue.shift();
    const limit = pc + MAX_FUNCTION_BYTES;
    while (inRom(pc) && pc < limit && !seen.has(pc)) {
      seen.add(pc);
      const ins = decode(pc);
      instructions.set(pc, ins);
      if (ins.call) calls.add(ins.call);
      if (ins.portIO) ports.push({ addr: pc, ...ins.portIO, text: ins.text });
      if (ins.branch && inRom(ins.branch)) queue.push(ins.branch);
      pc += ins.size;
      if (ins.ret && !ins.conditional) break;
      if (ins.terminal && !ins.conditional) break;
      if (ins.branch && !ins.conditional) break;
    }
  }

  const subroutines = [];
  if (followCalls) {
    for (const call of calls) {
      if (inRom(call)) subroutines.push({ start: call, ...disassembleFunction(call, { followCalls: false }) });
    }
  }
  return { instructions: [...instructions.values()].sort((a, b) => a.addr - b.addr), calls: [...calls].sort((a, b) => a - b), ports, subroutines };
}

function bytesText(ins) {
  return ins.bytes.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ').padEnd(14);
}

function printListing(title, result) {
  console.log(`\n${title}`);
  for (const ins of result.instructions) {
    console.log(`${hex(ins.addr, 6)}  ${bytesText(ins)} ${ins.text}`);
  }
}

function infer(result) {
  const all = [
    ...result.instructions,
    ...result.subroutines.flatMap((sub) => sub.instructions),
  ];
  const texts = all.map((ins) => ins.text);
  const hasBlockCopy = texts.some((text) => text === 'LDIR' || text === 'LDDR');
  const hasBlockFillShape = texts.some((text) => text === 'LD (HL),A') && texts.some((text) => text === 'LDIR');
  const hasVramBase = texts.some((text) => /0xD40000|0xD4[0-9A-F]{4}/.test(text));
  const hasStrideConstant = texts.some((text) => /0x000280|0x0280/.test(text));
  const lcdPorts = result.ports.filter((io) => io.dynamic || (typeof io.port === 'number' && isLcdPort(io.port)));

  console.log('\nAnalysis notes');
  console.log('- Entry under investigation: 0x09EF20. Session 521 caller 0x0A321D passes HL=0 and DE=0x013F, which fits x0=0 and x1=319 for a full-width LCD rectangle span.');
  console.log('- Parameter hypothesis to verify against the listing: HL carries the left/top packed coordinate or start X value; DE carries the right/bottom packed coordinate or end X value; BC is expected to supply the remaining extent/count/color context through caller setup or callee normalization.');
  console.log('- LCD geometry expected by the CE framebuffer: VRAM base 0xD40000, 16-bit pixels, row stride 640 bytes (320 pixels * 2). Look for multiplication/addition by 0x0280 and additions into a 0xD40000-range pointer.');
  console.log(`- Block operation signature: ${hasBlockCopy ? 'LDIR/LDDR present, so the routine moves/copies pixel runs or rectangle rows.' : 'No LDIR/LDDR decoded in the followed body; rectangle work is likely delegated or done with loops.'}`);
  console.log(`- Fill signature: ${hasBlockFillShape ? 'The listing has an LDIR-style fill shape.' : 'No direct LDIR fill shape was detected by this probe.'}`);
  console.log(`- VRAM base constant: ${hasVramBase ? 'a D40000-range constant appears in decoded immediates.' : 'no D40000-range immediate was found in the followed static body.'}`);
  console.log(`- 640-byte stride constant: ${hasStrideConstant ? '0x0280 appears in decoded immediates.' : '0x0280 was not found as a direct decoded immediate.'}`);

  if (lcdPorts.length) {
    console.log('- LCD port I/O detected:');
    for (const io of lcdPorts) {
      const port = io.dynamic ? 'dynamic C register' : hex(io.port, 4);
      const lcd = io.dynamic ? 'check preceding LD C/BC for 0x0800-0x0FFF' : isLcdPort(io.port) ? 'LCD range' : 'non-LCD';
      console.log(`  ${hex(io.addr, 6)} ${io.text} (${port}, ${lcd})`);
    }
  } else {
    console.log('- LCD port I/O detected: none in the followed static body.');
  }

  const verdict = hasBlockCopy
    ? 'This most likely scrolls or copies a rectangle rather than only drawing an outline.'
    : hasBlockFillShape
      ? 'This most likely fills or clears a rectangle.'
      : 'The static signature is inconclusive; inspect the called subroutine listing below for delegated draw/fill/copy behavior.';
  console.log(`- Operation verdict: ${verdict}`);
}

const result = disassembleFunction(START, { followCalls: true });
printListing('Function 0x09EF20', result);

if (result.calls.length) {
  console.log(`\nCalls found from 0x09EF20: ${result.calls.map((addr) => hex(addr, 6)).join(', ')}`);
}
for (const sub of result.subroutines) {
  printListing(`1-level callee ${hex(sub.start, 6)}`, sub);
}

infer(result);
