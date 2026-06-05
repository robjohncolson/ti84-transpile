import { readFileSync } from 'fs';

const ROM_PATH = new URL('./ROM.rom', import.meta.url);
const START = 0x03e187;
const END = 0x03e230;

const rom = readFileSync(ROM_PATH);

const hex = (value, width = 2) => `0x${value.toString(16).toUpperCase().padStart(width, '0')}`;
const addrHex = (value) => hex(value, 6);

const read8 = (addr) => rom[addr] ?? 0;
const read16 = (addr) => read8(addr) | (read8(addr + 1) << 8);
const read24 = (addr) => read16(addr) | (read8(addr + 2) << 16);

const signed8 = (value) => (value & 0x80 ? value - 0x100 : value);
const bytesAt = (addr, len) =>
  Array.from({ length: len }, (_, i) => read8(addr + i))
    .map((b) => b.toString(16).toUpperCase().padStart(2, '0'))
    .join(' ');

const ioAccesses = [];
const calls = [];
const jumps = [];
const warnings = [];

const reg8 = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
const reg16 = ['BC', 'DE', 'HL', 'SP'];
const conditions = {
  0xc0: 'NZ',
  0xc8: 'Z',
  0xd0: 'NC',
  0xd8: 'C',
  0xe0: 'PO',
  0xe8: 'PE',
  0xf0: 'P',
  0xf8: 'M',
};

function decodeBase(addr, modePrefix = '') {
  const op = read8(addr);
  const prefix = modePrefix ? `${modePrefix} ` : '';

  if (op >= 0x40 && op <= 0x7f && op !== 0x76) {
    const dst = reg8[(op >> 3) & 7];
    const src = reg8[op & 7];
    return { len: 1, text: `${prefix}LD ${dst},${src}` };
  }

  if (op >= 0x80 && op <= 0xbf) {
    const group = ['ADD A', 'ADC A', 'SUB', 'SBC A', 'AND', 'XOR', 'OR', 'CP'][(op >> 3) & 7];
    return { len: 1, text: `${prefix}${group},${reg8[op & 7]}`.replace('SUB,', 'SUB ') };
  }

  if ((op & 0xc7) === 0x04) return { len: 1, text: `${prefix}INC ${reg8[(op >> 3) & 7]}` };
  if ((op & 0xc7) === 0x05) return { len: 1, text: `${prefix}DEC ${reg8[(op >> 3) & 7]}` };
  if ((op & 0xc7) === 0x06) return { len: 2, text: `${prefix}LD ${reg8[(op >> 3) & 7]},${hex(read8(addr + 1))}` };
  if ((op & 0xcf) === 0x01) return { len: 3, text: `${prefix}LD ${reg16[(op >> 4) & 3]},${hex(read16(addr + 1), 4)}` };
  if ((op & 0xcf) === 0x03) return { len: 1, text: `${prefix}INC ${reg16[(op >> 4) & 3]}` };
  if ((op & 0xcf) === 0x0b) return { len: 1, text: `${prefix}DEC ${reg16[(op >> 4) & 3]}` };

  switch (op) {
    case 0x00:
      return { len: 1, text: `${prefix}NOP` };
    case 0x02:
      return { len: 1, text: `${prefix}LD (BC),A` };
    case 0x07:
      return { len: 1, text: `${prefix}RLCA` };
    case 0x08:
      return { len: 1, text: `${prefix}EX AF,AF'` };
    case 0x0a:
      return { len: 1, text: `${prefix}LD A,(BC)` };
    case 0x0f:
      return { len: 1, text: `${prefix}RRCA` };
    case 0x12:
      return { len: 1, text: `${prefix}LD (DE),A` };
    case 0x17:
      return { len: 1, text: `${prefix}RLA` };
    case 0x18: {
      const target = addr + 2 + signed8(read8(addr + 1));
      jumps.push({ addr, type: 'JR', target });
      return { len: 2, text: `${prefix}JR ${addrHex(target)}`, flow: `relative jump to ${addrHex(target)}` };
    }
    case 0x1a:
      return { len: 1, text: `${prefix}LD A,(DE)` };
    case 0x1f:
      return { len: 1, text: `${prefix}RRA` };
    case 0x20:
    case 0x28:
    case 0x30:
    case 0x38: {
      const cond = conditions[op + 0xa0];
      const target = addr + 2 + signed8(read8(addr + 1));
      jumps.push({ addr, type: `JR ${cond}`, target });
      return { len: 2, text: `${prefix}JR ${cond},${addrHex(target)}`, flow: `relative conditional jump to ${addrHex(target)}` };
    }
    case 0x22:
      return { len: 4, text: `${prefix}LD (${addrHex(read24(addr + 1))}),HL` };
    case 0x27:
      return { len: 1, text: `${prefix}DAA` };
    case 0x2a:
      return { len: 4, text: `${prefix}LD HL,(${addrHex(read24(addr + 1))})` };
    case 0x2f:
      return { len: 1, text: `${prefix}CPL` };
    case 0x32:
      return { len: 4, text: `${prefix}LD (${addrHex(read24(addr + 1))}),A` };
    case 0x37:
      return { len: 1, text: `${prefix}SCF` };
    case 0x3a:
      return { len: 4, text: `${prefix}LD A,(${addrHex(read24(addr + 1))})` };
    case 0x3f:
      return { len: 1, text: `${prefix}CCF` };
    case 0x76:
      return { len: 1, text: `${prefix}HALT` };
    case 0xc1:
      return { len: 1, text: `${prefix}POP BC` };
    case 0xc2: {
      const target = read24(addr + 1);
      jumps.push({ addr, type: 'JP NZ', target });
      return { len: 4, text: `${prefix}JP NZ,${addrHex(target)}`, flow: `conditional absolute jump to ${addrHex(target)}` };
    }
    case 0xc3: {
      const target = read24(addr + 1);
      jumps.push({ addr, type: 'JP', target });
      return { len: 4, text: `${prefix}JP ${addrHex(target)}`, flow: `absolute jump to ${addrHex(target)}` };
    }
    case 0xc5:
      return { len: 1, text: `${prefix}PUSH BC` };
    case 0xc6:
      return { len: 2, text: `${prefix}ADD A,${hex(read8(addr + 1))}` };
    case 0xc9:
      return { len: 1, text: `${prefix}RET` };
    case 0xca: {
      const target = read24(addr + 1);
      jumps.push({ addr, type: 'JP Z', target });
      return { len: 4, text: `${prefix}JP Z,${addrHex(target)}`, flow: `conditional absolute jump to ${addrHex(target)}` };
    }
    case 0xcd: {
      const target = read24(addr + 1);
      calls.push({ addr, target });
      return { len: 4, text: `${prefix}CALL ${addrHex(target)}`, flow: `call ${addrHex(target)}` };
    }
    case 0xd1:
      return { len: 1, text: `${prefix}POP DE` };
    case 0xd2: {
      const target = read24(addr + 1);
      jumps.push({ addr, type: 'JP NC', target });
      return { len: 4, text: `${prefix}JP NC,${addrHex(target)}` };
    }
    case 0xd5:
      return { len: 1, text: `${prefix}PUSH DE` };
    case 0xd6:
      return { len: 2, text: `${prefix}SUB ${hex(read8(addr + 1))}` };
    case 0xda: {
      const target = read24(addr + 1);
      jumps.push({ addr, type: 'JP C', target });
      return { len: 4, text: `${prefix}JP C,${addrHex(target)}` };
    }
    case 0xe1:
      return { len: 1, text: `${prefix}POP HL` };
    case 0xe5:
      return { len: 1, text: `${prefix}PUSH HL` };
    case 0xe6:
      return { len: 2, text: `${prefix}AND ${hex(read8(addr + 1))}` };
    case 0xe9:
      return { len: 1, text: `${prefix}JP (HL)` };
    case 0xeb:
      return { len: 1, text: `${prefix}EX DE,HL` };
    case 0xf1:
      return { len: 1, text: `${prefix}POP AF` };
    case 0xf3:
      return { len: 1, text: `${prefix}DI`, flow: 'disable interrupts' };
    case 0xf5:
      return { len: 1, text: `${prefix}PUSH AF` };
    case 0xf6:
      return { len: 2, text: `${prefix}OR ${hex(read8(addr + 1))}` };
    case 0xf9:
      return { len: 1, text: `${prefix}LD SP,HL` };
    case 0xfb:
      return { len: 1, text: `${prefix}EI`, flow: 'enable interrupts' };
    case 0xfe:
      return { len: 2, text: `${prefix}CP ${hex(read8(addr + 1))}`, flow: read8(addr + 1) === 0x88 ? 'flash status validation compare against 0x88' : undefined };
    case 0x40:
    case 0x49:
    case 0x52:
    case 0x5b:
      return decodeBase(addr + 1, { 0x40: '.SIS', 0x49: '.LIS', 0x52: '.SIL', 0x5b: '.LIL' }[op]);
    case 0xed:
      return decodeEd(addr, prefix);
    default:
      warnings.push(`${addrHex(addr)}: undecoded opcode ${hex(op)}`);
      return { len: 1, text: `${prefix}DB ${hex(op)}`, unknown: true };
  }
}

function decodeEd(addr, prefix = '') {
  const op = read8(addr + 1);

  if (op === 0x38) {
    const port = read8(addr + 2);
    ioAccesses.push({ addr, kind: 'IN0', port, reg: 'A' });
    return { len: 3, text: `${prefix}IN0 A,(${hex(port)})`, flow: `read I/O port ${hex(port)} into A` };
  }

  if (op === 0x39) {
    const port = read8(addr + 2);
    ioAccesses.push({ addr, kind: 'OUT0', port, reg: 'A' });
    return { len: 3, text: `${prefix}OUT0 (${hex(port)}),A`, flow: `write A to I/O port ${hex(port)}` };
  }

  if (op === 0x7e) {
    return { len: 2, text: `${prefix}LD A,I`, flow: 'read interrupt state register I into A' };
  }

  const edMap = {
    0x42: 'SBC HL,BC',
    0x43: `LD (${addrHex(read24(addr + 2))}),BC`,
    0x44: 'NEG',
    0x45: 'RETN',
    0x47: 'LD I,A',
    0x4a: 'ADC HL,BC',
    0x4b: `LD BC,(${addrHex(read24(addr + 2))})`,
    0x4d: 'RETI',
    0x52: 'SBC HL,DE',
    0x53: `LD (${addrHex(read24(addr + 2))}),DE`,
    0x56: 'IM 1',
    0x57: 'LD A,I',
    0x5a: 'ADC HL,DE',
    0x5b: `LD DE,(${addrHex(read24(addr + 2))})`,
    0x5e: 'IM 2',
    0x62: 'SBC HL,HL',
    0x67: 'RRD',
    0x6a: 'ADC HL,HL',
    0x6f: 'RLD',
    0x72: 'SBC HL,SP',
    0x73: `LD (${addrHex(read24(addr + 2))}),SP`,
    0x7a: 'ADC HL,SP',
    0x7b: `LD SP,(${addrHex(read24(addr + 2))})`,
    0xa0: 'LDI',
    0xa1: 'CPI',
    0xa8: 'LDD',
    0xa9: 'CPD',
    0xb0: 'LDIR',
    0xb1: 'CPIR',
    0xb8: 'LDDR',
    0xb9: 'CPDR',
  };

  if (edMap[op]) {
    const len = [0x43, 0x4b, 0x53, 0x5b, 0x73, 0x7b].includes(op) ? 5 : 2;
    return { len, text: `${prefix}${edMap[op]}` };
  }

  warnings.push(`${addrHex(addr)}: undecoded ED opcode ED ${hex(op).slice(2)}`);
  return { len: 2, text: `${prefix}DB 0xED,${hex(op)}`, unknown: true };
}

function decode(addr) {
  const op = read8(addr);
  if ([0x40, 0x49, 0x52, 0x5b].includes(op)) {
    const inner = decodeBase(addr + 1, { 0x40: '.SIS', 0x49: '.LIS', 0x52: '.SIL', 0x5b: '.LIL' }[op]);
    return { ...inner, len: inner.len + 1 };
  }
  return decodeBase(addr);
}

function inferImmediateA(disassembly) {
  let a = null;
  for (const line of disassembly) {
    const ld = line.text.match(/^LD A,(0x[0-9A-F]{2})$/);
    if (ld) {
      a = ld[1];
    }
    const out = line.text.match(/^OUT0 \((0x[0-9A-F]{2})\),A$/);
    if (out) {
      line.annotation = `${line.annotation ? `${line.annotation}; ` : ''}A is ${a ?? 'not statically known'}`;
    }
    if (/^(IN0 A|LD A,I|POP AF|ADD A|ADC A|SUB|SBC A|AND|XOR|OR|CPIR|CPI|CPD|CPDR)/.test(line.text)) {
      if (!line.text.startsWith('CP ')) a = null;
    }
  }
}

const disassembly = [];
let pc = START;
while (pc < END) {
  const decoded = decode(pc);
  disassembly.push({
    addr: pc,
    len: decoded.len,
    bytes: bytesAt(pc, decoded.len),
    text: decoded.text,
    annotation: decoded.flow,
  });
  pc += Math.max(decoded.len, 1);
}

inferImmediateA(disassembly);

const out0Writes = [];
let lastKnownA = null;
for (const line of disassembly) {
  const ld = line.text.match(/^LD A,(0x[0-9A-F]{2})$/);
  if (ld) lastKnownA = ld[1];
  const out = line.text.match(/^OUT0 \((0x[0-9A-F]{2})\),A$/);
  if (out) out0Writes.push({ addr: line.addr, port: out[1], value: lastKnownA });
  if (/^(IN0 A|LD A,I|POP AF|ADD A|ADC A|SUB|SBC A|AND|XOR|OR)/.test(line.text)) lastKnownA = null;
}

console.log('Phase 518 static decode: 0x03E187 flash unlock + token processor entry');
console.log(`ROM: ${ROM_PATH.pathname}`);
console.log(`Range: ${addrHex(START)}..${addrHex(END)} (${END - START} bytes)`);
console.log('');

console.log('Disassembly');
console.log('-----------');
for (const line of disassembly) {
  const paddedBytes = line.bytes.padEnd(15, ' ');
  const suffix = line.annotation ? ` ; ${line.annotation}` : '';
  console.log(`${addrHex(line.addr)}  ${paddedBytes}  ${line.text}${suffix}`);
}
console.log('');

console.log('I/O port accesses');
console.log('-----------------');
if (ioAccesses.length === 0) {
  console.log('none found');
} else {
  for (const access of ioAccesses) {
    const write = out0Writes.find((w) => w.addr === access.addr);
    const valueText = write ? `, value=${write.value ?? 'unknown'}` : '';
    console.log(`${addrHex(access.addr)}  ${access.kind.padEnd(4)} port=${hex(access.port)} reg=${access.reg}${valueText}`);
  }
}
console.log('');

console.log('Flash unlock writes inferred from immediate LD A,n before OUT0');
console.log('--------------------------------------------------------------');
if (out0Writes.length === 0) {
  console.log('none found');
} else {
  for (let i = 0; i < out0Writes.length; i += 1) {
    const write = out0Writes[i];
    console.log(`${String(i + 1).padStart(2, ' ')}. ${addrHex(write.addr)}  OUT0 (${write.port}),A  A=${write.value ?? 'unknown'}`);
  }
}
console.log('');

console.log('CALL targets');
console.log('------------');
if (calls.length === 0) {
  console.log('none found');
} else {
  for (const call of calls) {
    console.log(`${addrHex(call.addr)} -> ${addrHex(call.target)}`);
  }
}
console.log('');

console.log('Control flow');
console.log('------------');
for (const jump of jumps) {
  const reset = jump.target === 0x000066 ? ' (reset/error vector)' : '';
  const token = jump.target === END ? ' (token body start)' : '';
  console.log(`${addrHex(jump.addr)}  ${jump.type} -> ${addrHex(jump.target)}${reset}${token}`);
}

const reachesTokenByFallthrough = pc === END && !jumps.some((j) => j.addr < END && j.target === END);
console.log(
  reachesTokenByFallthrough
    ? `${addrHex(START)} reaches ${addrHex(END)} by sequential fall-through after the decoded unlock/validation block, unless an earlier conditional branch diverts control.`
    : `${addrHex(START)} has an explicit branch or undecoded path related to ${addrHex(END)}; inspect jumps above.`,
);

const resetChecks = disassembly.filter((line, index) => {
  const next = disassembly[index + 1];
  return line.text === 'CP 0x88' && next?.text === 'JP NZ,0x000066';
});
if (resetChecks.length > 0) {
  console.log('');
  console.log('Flash validation checks');
  console.log('-----------------------');
  for (const check of resetChecks) {
    console.log(`${addrHex(check.addr)} CP 0x88 followed by JP NZ,0x000066: validation failure branches to reset/error vector.`);
  }
}

if (warnings.length > 0) {
  console.log('');
  console.log('Decoder warnings');
  console.log('----------------');
  for (const warning of warnings) console.log(warning);
}
