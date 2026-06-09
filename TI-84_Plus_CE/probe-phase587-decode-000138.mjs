import fs from 'fs';

const START = 0x000138;
const MAX_BYTES = 200;

const ramNames = new Map([
  [0xD00080, 'IY base (OS flags)'],
  [0xD005F8, 'descriptor buffer'],
  [0xD005F9, 'search key type byte'],
  [0xD008EE, 'dispatch selector for event helper'],
  [0xD01D0C, 'shared state variable'],
  [0xD008F0, 'pointer from 0x092F87'],
  [0xD02590, 'symbol table start'],
  [0xD0259D, 'symbol table pointer'],
  [0xD0243A, 'edit cursor'],
  [0xD007CA, 'mode-dependent function pointer'],
  [0xD007D0, 'context handler pointer'],
]);

const rom = fs.readFileSync('TI-84_Plus_CE/ROM.rom');
const end = Math.min(rom.length, START + MAX_BYTES);

const callTargets = new Set();
const jumpTargets = new Set();
const rstVectors = new Set();
const ramRefs = new Set();
const iyRefs = new Set();
const ports = new Set();

function b(addr) {
  return addr < rom.length ? rom[addr] : 0;
}

function u16(addr) {
  return b(addr) | (b(addr + 1) << 8);
}

function u24(addr) {
  return b(addr) | (b(addr + 1) << 8) | (b(addr + 2) << 16);
}

function s8(value) {
  return value & 0x80 ? value - 0x100 : value;
}

function hx(value, width = 2) {
  return value.toString(16).toUpperCase().padStart(width, '0');
}

function h24(value) {
  return `0x${hx(value & 0xFFFFFF, 6)}`;
}

function h16(value) {
  return `0x${hx(value & 0xFFFF, 4)}`;
}

function h8(value) {
  return `0x${hx(value & 0xFF, 2)}`;
}

function recordAbs(value) {
  if ((value & 0xFF0000) === 0xD00000) ramRefs.add(value & 0xFFFFFF);
}

function relTarget(pc, len, disp) {
  return (pc + len + s8(disp)) & 0xFFFFFF;
}

function bytesAt(pc, len) {
  const parts = [];
  for (let i = 0; i < len; i++) parts.push(hx(b(pc + i)));
  return parts.join(' ');
}

function ccName(op) {
  return ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'][(op >> 3) & 7];
}

function aluName(op) {
  return ['ADD A', 'ADC A', 'SUB', 'SBC A', 'AND', 'XOR', 'OR', 'CP'][(op >> 3) & 7];
}

const r8 = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
const rp = ['BC', 'DE', 'HL', 'SP'];
const rp2 = ['BC', 'DE', 'HL', 'AF'];

function decodeCB(pc, prefix = null, disp = null) {
  const op = b(pc);
  const reg = r8[op & 7];
  const target = prefix ? `(IY${disp < 0 ? '' : '+'}${disp})` : reg;
  const bit = (op >> 3) & 7;
  const group = op >> 6;
  const rot = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'][bit];
  if (group === 0) return `${rot} ${target}`;
  if (group === 1) return `BIT ${bit},${target}`;
  if (group === 2) return `RES ${bit},${target}`;
  return `SET ${bit},${target}`;
}

function decodeED(pc) {
  const op = b(pc + 1);
  if (op === 0x44) return { len: 2, text: 'NEG' };
  if (op === 0x45) return { len: 2, text: 'RETN' };
  if (op === 0x47) return { len: 2, text: 'LD I,A' };
  if (op === 0x4D) return { len: 2, text: 'RETI' };
  if (op === 0x57) return { len: 2, text: 'LD A,I' };
  if (op === 0x5F) return { len: 2, text: 'LD A,R' };
  if (op === 0x67) return { len: 2, text: 'RRD' };
  if (op === 0x6F) return { len: 2, text: 'RLD' };
  if ((op & 0xC7) === 0x40) {
    const port = 'C';
    ports.add(port);
    return { len: 2, text: `IN ${r8[(op >> 3) & 7]},(C)` };
  }
  if ((op & 0xC7) === 0x41) {
    const port = 'C';
    ports.add(port);
    return { len: 2, text: `OUT (C),${r8[(op >> 3) & 7]}` };
  }
  if ((op & 0xCF) === 0x4B) {
    const addr = u24(pc + 2);
    recordAbs(addr);
    return { len: 5, text: `LD ${rp[(op >> 4) & 3]},(${h24(addr)})` };
  }
  if ((op & 0xCF) === 0x43) {
    const addr = u24(pc + 2);
    recordAbs(addr);
    return { len: 5, text: `LD (${h24(addr)}),${rp[(op >> 4) & 3]}` };
  }
  const block = new Map([
    [0xA0, 'LDI'], [0xA1, 'CPI'], [0xA2, 'INI'], [0xA3, 'OUTI'],
    [0xA8, 'LDD'], [0xA9, 'CPD'], [0xAA, 'IND'], [0xAB, 'OUTD'],
    [0xB0, 'LDIR'], [0xB1, 'CPIR'], [0xB2, 'INIR'], [0xB3, 'OTIR'],
    [0xB8, 'LDDR'], [0xB9, 'CPDR'], [0xBA, 'INDR'], [0xBB, 'OTDR'],
  ]);
  if (block.has(op)) return { len: 2, text: block.get(op) };
  return { len: 2, text: `ED ${hx(op)}` };
}

function decodeFD(pc) {
  const op = b(pc + 1);
  if (op === 0xCB) {
    const disp = s8(b(pc + 2));
    iyRefs.add(disp);
    return { len: 4, text: decodeCB(pc + 3, 'IY', disp) };
  }
  if (op === 0x21) return { len: 5, text: `LD IY,${h24(u24(pc + 2))}` };
  if (op === 0x22) {
    const addr = u24(pc + 2);
    recordAbs(addr);
    return { len: 5, text: `LD (${h24(addr)}),IY` };
  }
  if (op === 0x2A) {
    const addr = u24(pc + 2);
    recordAbs(addr);
    return { len: 5, text: `LD IY,(${h24(addr)})` };
  }
  if (op === 0x36) {
    const disp = s8(b(pc + 2));
    iyRefs.add(disp);
    return { len: 4, text: `LD (IY${disp < 0 ? '' : '+'}${disp}),${h8(b(pc + 3))}` };
  }
  if ((op & 0xC7) === 0x46) {
    const disp = s8(b(pc + 2));
    iyRefs.add(disp);
    return { len: 3, text: `LD ${r8[(op >> 3) & 7]},(IY${disp < 0 ? '' : '+'}${disp})` };
  }
  if ((op & 0xF8) === 0x70) {
    const disp = s8(b(pc + 2));
    iyRefs.add(disp);
    return { len: 3, text: `LD (IY${disp < 0 ? '' : '+'}${disp}),${r8[op & 7]}` };
  }
  const map = new Map([
    [0x09, 'ADD IY,BC'], [0x19, 'ADD IY,DE'], [0x23, 'INC IY'], [0x29, 'ADD IY,IY'],
    [0x2B, 'DEC IY'], [0x39, 'ADD IY,SP'], [0xE1, 'POP IY'], [0xE3, 'EX (SP),IY'],
    [0xE5, 'PUSH IY'], [0xE9, 'JP (IY)'], [0xF9, 'LD SP,IY'],
  ]);
  if (map.has(op)) return { len: 2, text: map.get(op) };
  return { len: 2, text: `FD ${hx(op)}` };
}

function decode(pc) {
  const op = b(pc);

  if (op === 0x00) return { len: 1, text: 'NOP' };
  if (op === 0x08) return { len: 1, text: "EX AF,AF'" };
  if (op === 0x10) {
    const target = relTarget(pc, 2, b(pc + 1));
    jumpTargets.add(target);
    return { len: 2, text: `DJNZ ${h24(target)}` };
  }
  if ([0x18, 0x20, 0x28, 0x30, 0x38].includes(op)) {
    const target = relTarget(pc, 2, b(pc + 1));
    jumpTargets.add(target);
    const cond = op === 0x18 ? '' : `${ccName(op)},`;
    return { len: 2, text: `JR ${cond}${h24(target)}` };
  }
  if ((op & 0xCF) === 0x01) return { len: 4, text: `LD ${rp[(op >> 4) & 3]},${h24(u24(pc + 1))}` };
  if ((op & 0xCF) === 0x03) return { len: 1, text: `INC ${rp[(op >> 4) & 3]}` };
  if ((op & 0xCF) === 0x0B) return { len: 1, text: `DEC ${rp[(op >> 4) & 3]}` };
  if ((op & 0xCF) === 0x09) return { len: 1, text: `ADD HL,${rp[(op >> 4) & 3]}` };
  if ((op & 0xC7) === 0x04) return { len: 1, text: `INC ${r8[(op >> 3) & 7]}` };
  if ((op & 0xC7) === 0x05) return { len: 1, text: `DEC ${r8[(op >> 3) & 7]}` };
  if ((op & 0xC7) === 0x06) return { len: 2, text: `LD ${r8[(op >> 3) & 7]},${h8(b(pc + 1))}` };

  const single = new Map([
    [0x02, 'LD (BC),A'], [0x07, 'RLCA'], [0x0A, 'LD A,(BC)'], [0x0F, 'RRCA'],
    [0x12, 'LD (DE),A'], [0x17, 'RLA'], [0x1A, 'LD A,(DE)'], [0x1F, 'RRA'],
    [0x22, null], [0x27, 'DAA'], [0x2A, null], [0x2F, 'CPL'],
    [0x32, null], [0x37, 'SCF'], [0x3A, null], [0x3F, 'CCF'],
    [0x76, 'HALT'], [0xD9, 'EXX'], [0xE3, 'EX (SP),HL'], [0xE9, 'JP (HL)'],
    [0xEB, 'EX DE,HL'], [0xF3, 'DI'], [0xF9, 'LD SP,HL'], [0xFB, 'EI'],
  ]);

  if (op === 0x22 || op === 0x2A || op === 0x32 || op === 0x3A) {
    const addr = u24(pc + 1);
    recordAbs(addr);
    const text = {
      0x22: `LD (${h24(addr)}),HL`,
      0x2A: `LD HL,(${h24(addr)})`,
      0x32: `LD (${h24(addr)}),A`,
      0x3A: `LD A,(${h24(addr)})`,
    }[op];
    return { len: 4, text };
  }
  if (single.has(op)) return { len: 1, text: single.get(op) };

  if ((op & 0xC0) === 0x40) return { len: 1, text: `LD ${r8[(op >> 3) & 7]},${r8[op & 7]}` };
  if ((op & 0xC0) === 0x80) return { len: 1, text: `${aluName(op)} ${r8[op & 7]}` };
  if ((op & 0xC7) === 0xC0) return { len: 1, text: `RET ${ccName(op)}` };
  if ((op & 0xC7) === 0xC2) {
    const target = u24(pc + 1);
    jumpTargets.add(target);
    return { len: 4, text: `JP ${ccName(op)},${h24(target)}` };
  }
  if ((op & 0xC7) === 0xC4) {
    const target = u24(pc + 1);
    callTargets.add(target);
    return { len: 4, text: `CALL ${ccName(op)},${h24(target)}` };
  }
  if ((op & 0xC7) === 0xC7) {
    const vector = op & 0x38;
    rstVectors.add(vector);
    return { len: 1, text: `RST ${h8(vector)}` };
  }
  if ((op & 0xCF) === 0xC1) return { len: 1, text: `POP ${rp2[(op >> 4) & 3]}` };
  if ((op & 0xCF) === 0xC5) return { len: 1, text: `PUSH ${rp2[(op >> 4) & 3]}` };

  if (op === 0xC3) {
    const target = u24(pc + 1);
    jumpTargets.add(target);
    return { len: 4, text: `JP ${h24(target)}` };
  }
  if (op === 0xC6 || op === 0xCE || op === 0xD6 || op === 0xDE || op === 0xE6 || op === 0xEE || op === 0xF6 || op === 0xFE) {
    return { len: 2, text: `${aluName(op)} ${h8(b(pc + 1))}` };
  }
  if (op === 0xC9) return { len: 1, text: 'RET' };
  if (op === 0xCD) {
    const target = u24(pc + 1);
    callTargets.add(target);
    return { len: 4, text: `CALL ${h24(target)}` };
  }
  if (op === 0xD3) {
    const port = b(pc + 1);
    ports.add(port);
    return { len: 2, text: `OUT (${h8(port)}),A` };
  }
  if (op === 0xDB) {
    const port = b(pc + 1);
    ports.add(port);
    return { len: 2, text: `IN A,(${h8(port)})` };
  }
  if (op === 0xED) return decodeED(pc);
  if (op === 0xCB) return { len: 2, text: decodeCB(pc + 1) };
  if (op === 0xFD) return decodeFD(pc);

  return { len: 1, text: `DB ${h8(op)}` };
}

const rows = [];
let pc = START;
let terminalAt = null;

while (pc < end) {
  const ins = decode(pc);
  const len = Math.max(1, Math.min(ins.len, end - pc));
  rows.push({ pc, len, text: ins.text });
  if (terminalAt === null && /^(RET|RETN|RETI|JP |RST |HALT)/.test(ins.text)) {
    terminalAt = pc + len;
  }
  pc += len;
}

function fmtSet(set, formatter = h24) {
  const values = [...set].sort((a, b) => {
    if (typeof a === 'string' || typeof b === 'string') return String(a).localeCompare(String(b));
    return a - b;
  });
  return values.length ? values.map(formatter).join(', ') : '(none)';
}

function fmtRam(value) {
  const name = ramNames.get(value);
  return name ? `${h24(value)} (${name})` : h24(value);
}

function purposeHypothesis() {
  const texts = rows.map(r => r.text);
  if (texts.some(t => t.startsWith('CP ')) && texts.some(t => t.includes('(HL)'))) {
    return 'comparison/search helper; uses HL-referenced data and condition flags for the caller';
  }
  if (texts.some(t => /^LDI|LDIR|LDD|LDDR/.test(t))) {
    return 'memory copy/move helper';
  }
  if (texts.some(t => /^CPI|CPIR|CPD|CPDR/.test(t))) {
    return 'memory scan/string compare helper';
  }
  if (callTargets.size || jumpTargets.size) {
    return 'low-ROM dispatcher/helper that delegates to fixed ROM targets';
  }
  return 'low-ROM utility routine; inspect flags/register effects in the listing';
}

console.log('=== Phase 587: Decode ROM function at 0x000138 ===');
console.log(`ROM: TI-84_Plus_CE/ROM.rom`);
console.log(`Range: ${h24(START)}..${h24(end - 1)} (${end - START} bytes decoded)`);
console.log('');
console.log('Address   Bytes             Instruction');
console.log('--------  ----------------  ------------------------------');
for (const row of rows) {
  console.log(`${h24(row.pc).slice(2)}  ${bytesAt(row.pc, row.len).padEnd(16)}  ${row.text}`);
}
console.log('');
console.log('=== Summary ===');
console.log(`Function start: ${h24(START)}`);
console.log(`Likely function size: ${terminalAt === null ? `>= ${end - START} bytes (no terminal instruction in window)` : `${terminalAt - START} bytes (first terminal at ${h24(terminalAt)})`}`);
console.log(`Purpose hypothesis: ${purposeHypothesis()}`);
console.log(`CALL targets: ${fmtSet(callTargets)}`);
console.log(`JP/JR targets: ${fmtSet(jumpTargets)}`);
console.log(`RST vectors: ${fmtSet(rstVectors, h8)}`);
console.log(`RAM references: ${fmtSet(ramRefs, fmtRam)}`);
console.log(`IY offsets: ${fmtSet(iyRefs, v => `${v >= 0 ? '+' : ''}${v}`)}`);
console.log(`Port I/O: ${fmtSet(ports, v => typeof v === 'string' ? `(C)` : h8(v))}`);

process.exit(0);
