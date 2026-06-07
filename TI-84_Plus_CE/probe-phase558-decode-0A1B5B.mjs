import { readFileSync } from 'fs';

const ROM_PATH = new URL('./ROM.rom', import.meta.url);
const rom = readFileSync(ROM_PATH);

const START = 0x0A1B5B;
const MAX_SCAN = 0x200;

function hex(value, width = 2) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function s8(value) {
  return value & 0x80 ? value - 0x100 : value;
}

function u16(off) {
  return rom[off] | (rom[off + 1] << 8);
}

function u24(off) {
  return rom[off] | (rom[off + 1] << 8) | (rom[off + 2] << 16);
}

function bytesAt(off, len) {
  return Array.from(rom.subarray(off, off + len), (b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

function relAddr(pc, len, disp) {
  return (pc + len + s8(disp)) & 0xFFFFFF;
}

function isRam(addr) {
  return addr >= 0xD00000;
}

const calls = new Set();
const ramRefs = new Set();
const iyRefs = [];
const branches = [];

const r8 = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
const rp = ['BC', 'DE', 'HL', 'SP'];
const rp2 = ['BC', 'DE', 'HL', 'AF'];
const alu = ['ADD A', 'ADC A', 'SUB', 'SBC A', 'AND', 'XOR', 'OR', 'CP'];
const cc = ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'];

function decodeBase(pc) {
  const op = rom[pc];
  const x = op >> 6;
  const y = (op >> 3) & 7;
  const z = op & 7;
  const p = y >> 1;
  const q = y & 1;

  if (op === 0x00) return { len: 1, text: 'NOP' };
  if (op === 0x10) return { len: 2, text: `DJNZ ${hex(relAddr(pc, 2, rom[pc + 1]), 6)}`, branch: relAddr(pc, 2, rom[pc + 1]) };
  if (op === 0x18) return { len: 2, text: `JR ${hex(relAddr(pc, 2, rom[pc + 1]), 6)}`, branch: relAddr(pc, 2, rom[pc + 1]) };
  if ([0x20, 0x28, 0x30, 0x38].includes(op)) {
    const target = relAddr(pc, 2, rom[pc + 1]);
    return { len: 2, text: `JR ${cc[y - 4]},${hex(target, 6)}`, branch: target };
  }
  if (op === 0x22) {
    const addr = u24(pc + 1);
    return { len: 4, text: `LD (${hex(addr, 6)}),HL`, ram: addr };
  }
  if (op === 0x2A) {
    const addr = u24(pc + 1);
    return { len: 4, text: `LD HL,(${hex(addr, 6)})`, ram: addr };
  }
  if (op === 0x32) {
    const addr = u24(pc + 1);
    return { len: 4, text: `LD (${hex(addr, 6)}),A`, ram: addr };
  }
  if (op === 0x3A) {
    const addr = u24(pc + 1);
    return { len: 4, text: `LD A,(${hex(addr, 6)})`, ram: addr };
  }
  if (op === 0xC3) {
    const target = u24(pc + 1);
    return { len: 4, text: `JP ${hex(target, 6)}`, branch: target };
  }
  if (op === 0xC9) return { len: 1, text: 'RET', ret: true };
  if (op === 0xCD) {
    const target = u24(pc + 1);
    return { len: 4, text: `CALL ${hex(target, 6)}`, call: target };
  }
  if (op === 0xCB) return decodeCB(pc);
  if (op === 0xDD) return decodeIndex(pc, 'IX');
  if (op === 0xED) return decodeED(pc);
  if (op === 0xFD) return decodeIndex(pc, 'IY');

  if (x === 0) {
    if (z === 1) {
      if (q === 0) return { len: 4, text: `LD ${rp[p]},${hex(u24(pc + 1), 6)}` };
      return { len: 1, text: `ADD HL,${rp[p]}` };
    }
    if (z === 2) {
      const table = q === 0 ? [`LD (BC),A`, `LD (DE),A`, `LD (${hex(u24(pc + 1), 6)}),HL`, `LD (${hex(u24(pc + 1), 6)}),A`] : [`LD A,(BC)`, `LD A,(DE)`, `LD HL,(${hex(u24(pc + 1), 6)})`, `LD A,(${hex(u24(pc + 1), 6)})`];
      const len = p >= 2 ? 4 : 1;
      const addr = p >= 2 ? u24(pc + 1) : null;
      return { len, text: table[p], ram: addr };
    }
    if (z === 3) return { len: 1, text: `${q === 0 ? 'INC' : 'DEC'} ${rp[p]}` };
    if (z === 4) return { len: 1, text: `INC ${r8[y]}` };
    if (z === 5) return { len: 1, text: `DEC ${r8[y]}` };
    if (z === 6) return { len: 2, text: `LD ${r8[y]},${hex(rom[pc + 1])}` };
    return { len: 1, text: ['RLCA', 'RRCA', 'RLA', 'RRA', 'DAA', 'CPL', 'SCF', 'CCF'][y] };
  }

  if (x === 1) {
    if (op === 0x76) return { len: 1, text: 'HALT' };
    return { len: 1, text: `LD ${r8[y]},${r8[z]}` };
  }

  if (x === 2) return { len: 1, text: `${alu[y]} ${r8[z]}` };

  if (z === 0) return { len: 1, text: `RET ${cc[y]}` };
  if (z === 1) return { len: 1, text: q === 0 ? `POP ${rp2[p]}` : ['RET', 'EXX', 'JP (HL)', 'LD SP,HL'][p] };
  if (z === 2) {
    const target = u24(pc + 1);
    return { len: 4, text: `JP ${cc[y]},${hex(target, 6)}`, branch: target };
  }
  if (z === 3) {
    if (y === 0) {
      const target = u24(pc + 1);
      return { len: 4, text: `JP ${hex(target, 6)}`, branch: target };
    }
    return { len: 1, text: ['?', '?', 'OUT (n),A', 'IN A,(n)', 'EX (SP),HL', 'EX DE,HL', 'DI', 'EI'][y] };
  }
  if (z === 4) {
    const target = u24(pc + 1);
    return { len: 4, text: `CALL ${cc[y]},${hex(target, 6)}`, call: target };
  }
  if (z === 5) {
    if (q === 0) return { len: 1, text: `PUSH ${rp2[p]}` };
    if (p === 0) {
      const target = u24(pc + 1);
      return { len: 4, text: `CALL ${hex(target, 6)}`, call: target };
    }
    return { len: 1, text: ['?', '?', '?', '?'][p] };
  }
  if (z === 6) return { len: 2, text: `${alu[y]} ${hex(rom[pc + 1])}` };
  return { len: 1, text: `RST ${hex(y * 8)}` };
}

function decodeCB(pc) {
  const op = rom[pc + 1];
  const group = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'][op >> 3 & 7];
  const x = op >> 6;
  const y = op >> 3 & 7;
  const z = op & 7;
  if (x === 0) return { len: 2, text: `${group} ${r8[z]}` };
  if (x === 1) return { len: 2, text: `BIT ${y},${r8[z]}` };
  return { len: 2, text: `${x === 2 ? 'RES' : 'SET'} ${y},${r8[z]}` };
}

function decodeED(pc) {
  const op = rom[pc + 1];
  if (op === 0x4B || op === 0x5B || op === 0x6B || op === 0x7B) {
    const addr = u24(pc + 2);
    return { len: 5, text: `LD ${rp[(op >> 4) & 3]},(${hex(addr, 6)})`, ram: addr };
  }
  if (op === 0x43 || op === 0x53 || op === 0x63 || op === 0x73) {
    const addr = u24(pc + 2);
    return { len: 5, text: `LD (${hex(addr, 6)}),${rp[(op >> 4) & 3]}`, ram: addr };
  }
  const block = {
    0x44: 'NEG', 0x45: 'RETN', 0x46: 'IM 0', 0x47: 'LD I,A', 0x4D: 'RETI',
    0x56: 'IM 1', 0x57: 'LD A,I', 0x5E: 'IM 2', 0x5F: 'LD A,R',
    0xA0: 'LDI', 0xA1: 'CPI', 0xA2: 'INI', 0xA3: 'OUTI',
    0xA8: 'LDD', 0xA9: 'CPD', 0xAA: 'IND', 0xAB: 'OUTD',
    0xB0: 'LDIR', 0xB1: 'CPIR', 0xB2: 'INIR', 0xB3: 'OTIR',
    0xB8: 'LDDR', 0xB9: 'CPDR', 0xBA: 'INDR', 0xBB: 'OTDR',
  };
  return { len: 2, text: block[op] ?? `ED ${hex(op)}` };
}

function decodeIndex(pc, reg) {
  const op = rom[pc + 1];
  const mem = (disp) => `(${reg}${s8(disp) < 0 ? '' : '+'}${s8(disp)})`;
  const noteIy = (len, text) => ({ len, text, iy: reg === 'IY' ? text : null });

  if (op === 0x21) return noteIy(5, `LD ${reg},${hex(u24(pc + 2), 6)}`);
  if (op === 0x22) {
    const addr = u24(pc + 2);
    return { ...noteIy(5, `LD (${hex(addr, 6)}),${reg}`), ram: addr };
  }
  if (op === 0x2A) {
    const addr = u24(pc + 2);
    return { ...noteIy(5, `LD ${reg},(${hex(addr, 6)})`), ram: addr };
  }
  if (op === 0x23) return noteIy(2, `INC ${reg}`);
  if (op === 0x2B) return noteIy(2, `DEC ${reg}`);
  if (op === 0x34) return noteIy(3, `INC ${mem(rom[pc + 2])}`);
  if (op === 0x35) return noteIy(3, `DEC ${mem(rom[pc + 2])}`);
  if (op === 0x36) return noteIy(4, `LD ${mem(rom[pc + 2])},${hex(rom[pc + 3])}`);
  if (op === 0x77) return noteIy(3, `LD ${mem(rom[pc + 2])},A`);
  if (op === 0x7E) return noteIy(3, `LD A,${mem(rom[pc + 2])}`);
  if (op === 0x70 || op === 0x71 || op === 0x72 || op === 0x73 || op === 0x74 || op === 0x75) return noteIy(3, `LD ${mem(rom[pc + 2])},${r8[op & 7]}`);
  if (op === 0x46 || op === 0x4E || op === 0x56 || op === 0x5E || op === 0x66 || op === 0x6E) return noteIy(3, `LD ${r8[(op >> 3) & 7]},${mem(rom[pc + 2])}`);
  if (op >= 0x86 && (op & 7) === 6) return noteIy(3, `${alu[(op >> 3) & 7]} ${mem(rom[pc + 2])}`);
  if (op === 0xE1) return noteIy(2, `POP ${reg}`);
  if (op === 0xE3) return noteIy(2, `EX (SP),${reg}`);
  if (op === 0xE5) return noteIy(2, `PUSH ${reg}`);
  if (op === 0xE9) return noteIy(2, `JP (${reg})`);
  if (op === 0xF9) return noteIy(2, `LD SP,${reg}`);
  if (op === 0xCB) {
    const disp = rom[pc + 2];
    const cb = rom[pc + 3];
    const x = cb >> 6;
    const y = (cb >> 3) & 7;
    const z = cb & 7;
    const target = mem(disp);
    let text;
    if (x === 0) text = `${['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'][y]} ${target}`;
    else if (x === 1) text = `BIT ${y},${target}`;
    else text = `${x === 2 ? 'RES' : 'SET'} ${y},${target}`;
    if (z !== 6) text += ` -> ${r8[z]}`;
    return noteIy(4, text);
  }
  return noteIy(2, `${reg} prefix ${hex(op)}`);
}

let pc = START;
const end = Math.min(rom.length, START + MAX_SCAN);

console.log(`Phase 558 decode: per-character renderer dispatch at ${hex(START, 6)}`);
console.log(`ROM size: ${hex(rom.length, 6)} bytes`);
console.log('');

while (pc < end) {
  const decoded = decodeBase(pc);
  const bytes = bytesAt(pc, decoded.len).padEnd(15, ' ');
  console.log(`${hex(pc, 6)}  ${bytes}  ${decoded.text}`);

  if (decoded.call !== undefined) calls.add(decoded.call);
  if (decoded.ram !== null && decoded.ram !== undefined && isRam(decoded.ram)) ramRefs.add(decoded.ram);
  if (decoded.iy) iyRefs.push({ pc, text: decoded.iy });
  if (decoded.branch !== undefined) branches.push({ pc, target: decoded.branch, text: decoded.text });

  pc += decoded.len;
  if (decoded.ret) break;
}

console.log('');
console.log('Summary');
console.log(`  Size scanned: ${hex(pc - START, 4)} bytes (${pc - START})`);
console.log(`  End address: ${hex(pc, 6)}`);
console.log(`  CALL targets: ${calls.size ? Array.from(calls).map((addr) => hex(addr, 6)).join(', ') : '(none)'}`);
console.log(`  RAM refs >= 0xD00000: ${ramRefs.size ? Array.from(ramRefs).map((addr) => hex(addr, 6)).join(', ') : '(none)'}`);
console.log(`  IY-relative ops: ${iyRefs.length ? '' : '(none)'}`);
for (const ref of iyRefs) console.log(`    ${hex(ref.pc, 6)}  ${ref.text}`);
console.log(`  JP/JR branches: ${branches.length ? '' : '(none)'}`);
for (const branch of branches) console.log(`    ${hex(branch.pc, 6)} -> ${hex(branch.target, 6)}  ${branch.text}`);
