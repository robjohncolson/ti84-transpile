import { readFileSync } from 'fs';

const ROM_PATH = 'TI-84_Plus_CE/ROM.rom';
const START = 0x098b80;
const WINDOW = 240;
const STOP_AT_FIRST_RET = true;

const rom = readFileSync(ROM_PATH);

const hex = (value, width = 2) => `0x${value.toString(16).toUpperCase().padStart(width, '0')}`;
const hexAddr = (value) => hex(value, 6);
const signed8 = (value) => (value & 0x80 ? value - 0x100 : value);
const u24 = (addr) => rom[addr] | (rom[addr + 1] << 8) | (rom[addr + 2] << 16);
const u16 = (addr) => rom[addr] | (rom[addr + 1] << 8);
const byte = (addr) => rom[addr] ?? 0;

const calls = [];
const jumps = [];
const memoryRefs = [];
const ramRefs = [];
const controlStops = new Set(['RET', 'RET Z', 'RET NZ', 'RET C', 'RET NC', 'JP']);

function classifyAddress(addr) {
  if (addr >= 0xd00000 && addr <= 0xd3ffff) return 'RAM';
  if (addr < rom.length) return 'ROM';
  return 'ADDR';
}

function recordMemory(addr, mode, width, via) {
  const item = { addr, mode, width, via };
  memoryRefs.push(item);
  if (classifyAddress(addr) === 'RAM') ramRefs.push(item);
}

function decodeCb(op) {
  const regs = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
  const group = op >> 6;
  const bit = (op >> 3) & 7;
  const reg = regs[op & 7];
  if (group === 1) return `BIT ${bit},${reg}`;
  if (group === 2) return `RES ${bit},${reg}`;
  if (group === 3) return `SET ${bit},${reg}`;
  const rotates = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'];
  return `${rotates[bit]} ${reg}`;
}

function decodeEd(op, pc) {
  switch (op) {
    case 0x4b: return { len: 5, text: `LD BC,(${hexAddr(u24(pc + 2))})`, mem: [{ addr: u24(pc + 2), mode: 'read', width: 3 }] };
    case 0x5b: return { len: 5, text: `LD DE,(${hexAddr(u24(pc + 2))})`, mem: [{ addr: u24(pc + 2), mode: 'read', width: 3 }] };
    case 0x6b: return { len: 5, text: `LD HL,(${hexAddr(u24(pc + 2))})`, mem: [{ addr: u24(pc + 2), mode: 'read', width: 3 }] };
    case 0x7b: return { len: 5, text: `LD SP,(${hexAddr(u24(pc + 2))})`, mem: [{ addr: u24(pc + 2), mode: 'read', width: 3 }] };
    case 0x43: return { len: 5, text: `LD (${hexAddr(u24(pc + 2))}),BC`, mem: [{ addr: u24(pc + 2), mode: 'write', width: 3 }] };
    case 0x53: return { len: 5, text: `LD (${hexAddr(u24(pc + 2))}),DE`, mem: [{ addr: u24(pc + 2), mode: 'write', width: 3 }] };
    case 0x63: return { len: 5, text: `LD (${hexAddr(u24(pc + 2))}),HL`, mem: [{ addr: u24(pc + 2), mode: 'write', width: 3 }] };
    case 0x73: return { len: 5, text: `LD (${hexAddr(u24(pc + 2))}),SP`, mem: [{ addr: u24(pc + 2), mode: 'write', width: 3 }] };
    case 0xa0: return { len: 2, text: 'LDI' };
    case 0xa8: return { len: 2, text: 'LDD' };
    case 0xb0: return { len: 2, text: 'LDIR' };
    case 0xb8: return { len: 2, text: 'LDDR' };
    default: return { len: 2, text: `ED ${hex(op)}` };
  }
}

function decodeFd(pc) {
  const op = byte(pc + 1);
  if (op === 0xcb) {
    const disp = signed8(byte(pc + 2));
    const cb = byte(pc + 3);
    const decoded = decodeCb(cb).replace('(HL)', `(IY${disp < 0 ? '-' : '+'}${hex(Math.abs(disp), 2)})`);
    return { len: 4, text: decoded };
  }
  const iyLoads = {
    0x21: () => ({ len: 5, text: `LD IY,${hexAddr(u24(pc + 2))}` }),
    0x22: () => ({ len: 5, text: `LD (${hexAddr(u24(pc + 2))}),IY`, mem: [{ addr: u24(pc + 2), mode: 'write', width: 3 }] }),
    0x2a: () => ({ len: 5, text: `LD IY,(${hexAddr(u24(pc + 2))})`, mem: [{ addr: u24(pc + 2), mode: 'read', width: 3 }] }),
    0x36: () => ({ len: 4, text: `LD (IY${signed8(byte(pc + 2)) < 0 ? '-' : '+'}${hex(Math.abs(signed8(byte(pc + 2))), 2)}),${hex(byte(pc + 3))}` }),
    0x7e: () => ({ len: 3, text: `LD A,(IY${signed8(byte(pc + 2)) < 0 ? '-' : '+'}${hex(Math.abs(signed8(byte(pc + 2))), 2)})` }),
    0x77: () => ({ len: 3, text: `LD (IY${signed8(byte(pc + 2)) < 0 ? '-' : '+'}${hex(Math.abs(signed8(byte(pc + 2))), 2)}),A` }),
    0xe5: () => ({ len: 2, text: 'PUSH IY' }),
    0xe1: () => ({ len: 2, text: 'POP IY' }),
  };
  return iyLoads[op]?.() ?? { len: 2, text: `FD ${hex(op)}` };
}

function decodeInstruction(pc) {
  const op = byte(pc);
  const regs = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
  const rp = ['BC', 'DE', 'HL', 'SP'];
  const rpa = ['BC', 'DE', 'HL', 'AF'];

  if (op >= 0x40 && op <= 0x7f && op !== 0x76) {
    return { len: 1, text: `LD ${regs[(op >> 3) & 7]},${regs[op & 7]}` };
  }
  if (op >= 0x80 && op <= 0xbf) {
    const alu = ['ADD A,', 'ADC A,', 'SUB ', 'SBC A,', 'AND ', 'XOR ', 'OR ', 'CP '][(op >> 3) & 7];
    return { len: 1, text: `${alu}${regs[op & 7]}` };
  }

  switch (op) {
    case 0x00: return { len: 1, text: 'NOP' };
    case 0x01: return { len: 4, text: `LD BC,${hexAddr(u24(pc + 1))}` };
    case 0x02: return { len: 1, text: 'LD (BC),A' };
    case 0x03: return { len: 1, text: 'INC BC' };
    case 0x04: return { len: 1, text: 'INC B' };
    case 0x05: return { len: 1, text: 'DEC B' };
    case 0x06: return { len: 2, text: `LD B,${hex(byte(pc + 1))}` };
    case 0x08: return { len: 1, text: "EX AF,AF'" };
    case 0x09: return { len: 1, text: 'ADD HL,BC' };
    case 0x0a: return { len: 1, text: 'LD A,(BC)' };
    case 0x0b: return { len: 1, text: 'DEC BC' };
    case 0x0c: return { len: 1, text: 'INC C' };
    case 0x0d: return { len: 1, text: 'DEC C' };
    case 0x0e: return { len: 2, text: `LD C,${hex(byte(pc + 1))}` };
    case 0x11: return { len: 4, text: `LD DE,${hexAddr(u24(pc + 1))}` };
    case 0x12: return { len: 1, text: 'LD (DE),A' };
    case 0x13: return { len: 1, text: 'INC DE' };
    case 0x14: return { len: 1, text: 'INC D' };
    case 0x15: return { len: 1, text: 'DEC D' };
    case 0x16: return { len: 2, text: `LD D,${hex(byte(pc + 1))}` };
    case 0x18: return { len: 2, text: `JR ${hexAddr(pc + 2 + signed8(byte(pc + 1)))}`, jump: pc + 2 + signed8(byte(pc + 1)) };
    case 0x19: return { len: 1, text: 'ADD HL,DE' };
    case 0x1a: return { len: 1, text: 'LD A,(DE)' };
    case 0x1b: return { len: 1, text: 'DEC DE' };
    case 0x1c: return { len: 1, text: 'INC E' };
    case 0x1d: return { len: 1, text: 'DEC E' };
    case 0x1e: return { len: 2, text: `LD E,${hex(byte(pc + 1))}` };
    case 0x20: return { len: 2, text: `JR NZ,${hexAddr(pc + 2 + signed8(byte(pc + 1)))}`, jump: pc + 2 + signed8(byte(pc + 1)) };
    case 0x21: return { len: 4, text: `LD HL,${hexAddr(u24(pc + 1))}` };
    case 0x22: return { len: 4, text: `LD (${hexAddr(u24(pc + 1))}),HL`, mem: [{ addr: u24(pc + 1), mode: 'write', width: 3 }] };
    case 0x23: return { len: 1, text: 'INC HL' };
    case 0x24: return { len: 1, text: 'INC H' };
    case 0x25: return { len: 1, text: 'DEC H' };
    case 0x26: return { len: 2, text: `LD H,${hex(byte(pc + 1))}` };
    case 0x28: return { len: 2, text: `JR Z,${hexAddr(pc + 2 + signed8(byte(pc + 1)))}`, jump: pc + 2 + signed8(byte(pc + 1)) };
    case 0x29: return { len: 1, text: 'ADD HL,HL' };
    case 0x2a: return { len: 4, text: `LD HL,(${hexAddr(u24(pc + 1))})`, mem: [{ addr: u24(pc + 1), mode: 'read', width: 3 }] };
    case 0x2b: return { len: 1, text: 'DEC HL' };
    case 0x2c: return { len: 1, text: 'INC L' };
    case 0x2d: return { len: 1, text: 'DEC L' };
    case 0x2e: return { len: 2, text: `LD L,${hex(byte(pc + 1))}` };
    case 0x30: return { len: 2, text: `JR NC,${hexAddr(pc + 2 + signed8(byte(pc + 1)))}`, jump: pc + 2 + signed8(byte(pc + 1)) };
    case 0x31: return { len: 4, text: `LD SP,${hexAddr(u24(pc + 1))}` };
    case 0x32: return { len: 4, text: `LD (${hexAddr(u24(pc + 1))}),A`, mem: [{ addr: u24(pc + 1), mode: 'write', width: 1 }] };
    case 0x33: return { len: 1, text: 'INC SP' };
    case 0x34: return { len: 1, text: 'INC (HL)' };
    case 0x35: return { len: 1, text: 'DEC (HL)' };
    case 0x36: return { len: 2, text: `LD (HL),${hex(byte(pc + 1))}` };
    case 0x38: return { len: 2, text: `JR C,${hexAddr(pc + 2 + signed8(byte(pc + 1)))}`, jump: pc + 2 + signed8(byte(pc + 1)) };
    case 0x39: return { len: 1, text: 'ADD HL,SP' };
    case 0x3a: return { len: 4, text: `LD A,(${hexAddr(u24(pc + 1))})`, mem: [{ addr: u24(pc + 1), mode: 'read', width: 1 }] };
    case 0x3b: return { len: 1, text: 'DEC SP' };
    case 0x3c: return { len: 1, text: 'INC A' };
    case 0x3d: return { len: 1, text: 'DEC A' };
    case 0x3e: return { len: 2, text: `LD A,${hex(byte(pc + 1))}` };
    case 0x76: return { len: 1, text: 'HALT' };
    case 0xc0: return { len: 1, text: 'RET NZ', stop: true };
    case 0xc1: return { len: 1, text: 'POP BC' };
    case 0xc2: return { len: 4, text: `JP NZ,${hexAddr(u24(pc + 1))}`, jump: u24(pc + 1) };
    case 0xc3: return { len: 4, text: `JP ${hexAddr(u24(pc + 1))}`, jump: u24(pc + 1), stop: true };
    case 0xc5: return { len: 1, text: 'PUSH BC' };
    case 0xc6: return { len: 2, text: `ADD A,${hex(byte(pc + 1))}` };
    case 0xc8: return { len: 1, text: 'RET Z', stop: true };
    case 0xc9: return { len: 1, text: 'RET', stop: true };
    case 0xca: return { len: 4, text: `JP Z,${hexAddr(u24(pc + 1))}`, jump: u24(pc + 1) };
    case 0xcd: return { len: 4, text: `CALL ${hexAddr(u24(pc + 1))}`, call: u24(pc + 1) };
    case 0xd0: return { len: 1, text: 'RET NC', stop: true };
    case 0xd1: return { len: 1, text: 'POP DE' };
    case 0xd2: return { len: 4, text: `JP NC,${hexAddr(u24(pc + 1))}`, jump: u24(pc + 1) };
    case 0xd5: return { len: 1, text: 'PUSH DE' };
    case 0xd6: return { len: 2, text: `SUB ${hex(byte(pc + 1))}` };
    case 0xd8: return { len: 1, text: 'RET C', stop: true };
    case 0xda: return { len: 4, text: `JP C,${hexAddr(u24(pc + 1))}`, jump: u24(pc + 1) };
    case 0xe1: return { len: 1, text: 'POP HL' };
    case 0xe5: return { len: 1, text: 'PUSH HL' };
    case 0xe6: return { len: 2, text: `AND ${hex(byte(pc + 1))}` };
    case 0xe9: return { len: 1, text: 'JP (HL)', stop: true };
    case 0xeb: return { len: 1, text: 'EX DE,HL' };
    case 0xed: return decodeEd(byte(pc + 1), pc);
    case 0xef: return { len: 1, text: 'RST 0x28 / bcall' };
    case 0xf1: return { len: 1, text: 'POP AF' };
    case 0xf3: return { len: 1, text: 'DI' };
    case 0xf5: return { len: 1, text: 'PUSH AF' };
    case 0xf6: return { len: 2, text: `OR ${hex(byte(pc + 1))}` };
    case 0xfb: return { len: 1, text: 'EI' };
    case 0xfd: return decodeFd(pc);
    case 0xfe: return { len: 2, text: `CP ${hex(byte(pc + 1))}` };
    default:
      if ((op & 0xcf) === 0xc7) return { len: 1, text: `RST ${hex(op & 0x38)}` };
      if ((op & 0xcf) === 0x01) return { len: 4, text: `LD ${rp[(op >> 4) & 3]},${hexAddr(u24(pc + 1))}` };
      if ((op & 0xcf) === 0x03) return { len: 1, text: `INC ${rp[(op >> 4) & 3]}` };
      if ((op & 0xcf) === 0x0b) return { len: 1, text: `DEC ${rp[(op >> 4) & 3]}` };
      if ((op & 0xcf) === 0x05) return { len: 1, text: `PUSH ${rpa[(op >> 4) & 3]}` };
      if ((op & 0xcf) === 0x01) return { len: 1, text: `POP ${rpa[(op >> 4) & 3]}` };
      return { len: 1, text: `DB ${hex(op)}` };
  }
}

const rows = [];
for (let pc = START; pc < START + WINDOW && pc < rom.length;) {
  const decoded = decodeInstruction(pc);
  const bytes = Array.from({ length: decoded.len }, (_, i) => hex(byte(pc + i))).join(' ');
  rows.push({ pc, bytes, text: decoded.text });

  if (decoded.call !== undefined) calls.push({ at: pc, target: decoded.call });
  if (decoded.jump !== undefined) jumps.push({ at: pc, target: decoded.jump, text: decoded.text });
  for (const ref of decoded.mem ?? []) recordMemory(ref.addr, ref.mode, ref.width, decoded.text);

  pc += decoded.len;
  if (STOP_AT_FIRST_RET && decoded.stop && controlStops.has(decoded.text.split(',')[0])) break;
}

console.log('Phase 523: decode 0x098B80 program-specific editor setup');
console.log(`ROM: ${ROM_PATH}`);
console.log(`Window: ${hexAddr(START)}..${hexAddr(Math.min(START + WINDOW - 1, rom.length - 1))}`);
console.log('');
console.log('Disassembly');
for (const row of rows) {
  console.log(`${hexAddr(row.pc)}  ${row.bytes.padEnd(17)} ${row.text}`);
}

console.log('');
console.log('Control-flow references');
if (calls.length === 0 && jumps.length === 0) {
  console.log('- No CALL or JP/JR targets decoded in this window.');
} else {
  for (const call of calls) console.log(`- CALL at ${hexAddr(call.at)} -> ${hexAddr(call.target)} (${classifyAddress(call.target)})`);
  for (const jump of jumps) console.log(`- ${jump.text} at ${hexAddr(jump.at)} -> ${hexAddr(jump.target)} (${classifyAddress(jump.target)})`);
}

console.log('');
console.log('Absolute memory references');
if (memoryRefs.length === 0) {
  console.log('- No absolute memory reads/writes decoded in this window.');
} else {
  for (const ref of memoryRefs) {
    console.log(`- ${ref.mode.toUpperCase()} ${hexAddr(ref.addr)} (${classifyAddress(ref.addr)}, width=${ref.width}) via ${ref.via}`);
  }
}

console.log('');
console.log('RAM D0xxxx references');
if (ramRefs.length === 0) {
  console.log('- No direct D0xxxx/D1xxxx/D2xxxx/D3xxxx absolute references decoded. Any RAM changes may be indirect through HL/DE/IY or inside sub-calls.');
} else {
  for (const ref of ramRefs) console.log(`- ${ref.mode.toUpperCase()} ${hexAddr(ref.addr)} via ${ref.via}`);
}

console.log('');
console.log('Structured interpretation');
console.log('- Entry point 0x098B80 is reached only by the program type (0x1B) dispatch path after 0x07F7A8 returns Z/success.');
console.log('- The disassembly above identifies the local setup sequence through the first return/control transfer, including immediate constants, direct RAM/ROM references, and helper sub-calls.');
console.log('- Direct writes in this function are the local editor-state initialization surface. CALL targets are setup helpers that may perform additional buffer/window/editor initialization.');
console.log('- D02712 is the generic edit-mode type byte written after dispatch by the caller; this probe highlights whether 0x098B80 itself also touches D0xxxx RAM.');
