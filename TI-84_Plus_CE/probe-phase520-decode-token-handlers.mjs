import fs from 'node:fs';

const ROM_PATH = 'TI-84_Plus_CE/ROM.rom';
const rom = fs.readFileSync(ROM_PATH);

const IY_BASE = 0xD00080;
const TOKEN_TABLE = 0x061D1A;
const TOKEN_PROCESSOR = 0x03E1B4;

const targets = [
  { name: 'token reader / get next key', start: 0x09BAB8, length: 200 },
  { name: 'intermediate handler', start: 0x09BAD1, length: 200 },
  { name: 'intermediate handler', start: 0x09BF58, length: 200 },
  { name: 'mode/state checker', start: 0x09C4E0, length: 50 },
];

function hex(value, width = 2) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function romByte(addr) {
  if (addr < 0 || addr >= rom.length) return 0;
  return rom[addr];
}

function u24(addr) {
  return romByte(addr) | (romByte(addr + 1) << 8) | (romByte(addr + 2) << 16);
}

function s8(value) {
  return value & 0x80 ? value - 0x100 : value;
}

function relTarget(pc, size, disp) {
  return (pc + size + s8(disp)) & 0xFFFFFF;
}

function inRam(addr) {
  return addr >= 0xD00000 && addr <= 0xD3FFFF;
}

function addUnique(set, value) {
  set.add(hex(value, 6));
}

const regs8 = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
const rp = ['BC', 'DE', 'HL', 'SP'];
const rp2 = ['BC', 'DE', 'HL', 'AF'];
const cc = ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'];
const alu = ['ADD A', 'ADC A', 'SUB', 'SBC A', 'AND', 'XOR', 'OR', 'CP'];
const rot = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'];

function decodeCb(pc, stats) {
  const op = romByte(pc + 1);
  const reg = regs8[op & 7];
  const bit = (op >> 3) & 7;
  const group = op >> 6;
  const mnemonic =
    group === 0 ? `${rot[bit]} ${reg}` :
    group === 1 ? `BIT ${bit},${reg}` :
    group === 2 ? `RES ${bit},${reg}` :
    `SET ${bit},${reg}`;
  return { size: 2, mnemonic };
}

function decodeFdCb(pc, stats) {
  const d = s8(romByte(pc + 2));
  const op = romByte(pc + 3);
  const reg = regs8[op & 7];
  const bit = (op >> 3) & 7;
  const group = op >> 6;
  const iyAddr = (IY_BASE + d) & 0xFFFFFF;
  const mem = `(IY${d < 0 ? '-' : '+'}${hex(Math.abs(d), 2)})`;
  const suffix = reg === '(HL)' ? mem : `${mem},${reg}`;
  const mnemonic =
    group === 0 ? `${rot[bit]} ${suffix}` :
    group === 1 ? `BIT ${bit},${mem}` :
    group === 2 ? `RES ${bit},${suffix}` :
    `SET ${bit},${suffix}`;
  stats.iyOps.push({ at: pc, mnemonic, offset: d, address: iyAddr });
  if (inRam(iyAddr)) addUnique(stats.ram, iyAddr);
  return { size: 4, mnemonic };
}

function decodeFd(pc, stats) {
  const op = romByte(pc + 1);
  if (op === 0xCB) return decodeFdCb(pc, stats);

  const d = s8(romByte(pc + 2));
  const iyMem = `(IY${d < 0 ? '-' : '+'}${hex(Math.abs(d), 2)})`;
  const iyAddr = (IY_BASE + d) & 0xFFFFFF;
  const noteIy = (mnemonic, size = 3, ram = true) => {
    stats.iyOps.push({ at: pc, mnemonic, offset: d, address: iyAddr });
    if (ram && inRam(iyAddr)) addUnique(stats.ram, iyAddr);
    return { size, mnemonic };
  };

  if (op === 0x21) return { size: 4, mnemonic: `LD IY,${hex(u24(pc + 2), 6)}` };
  if (op === 0x22) {
    const addr = u24(pc + 2);
    if (inRam(addr)) addUnique(stats.ram, addr);
    return { size: 4, mnemonic: `LD (${hex(addr, 6)}),IY` };
  }
  if (op === 0x2A) {
    const addr = u24(pc + 2);
    if (inRam(addr)) addUnique(stats.ram, addr);
    return { size: 4, mnemonic: `LD IY,(${hex(addr, 6)})` };
  }
  if (op === 0xE1) return { size: 2, mnemonic: 'POP IY' };
  if (op === 0xE5) return { size: 2, mnemonic: 'PUSH IY' };
  if (op === 0xE9) return { size: 2, mnemonic: 'JP (IY)' };
  if (op === 0xF9) return { size: 2, mnemonic: 'LD SP,IY' };
  if (op === 0x34) return noteIy(`INC ${iyMem}`);
  if (op === 0x35) return noteIy(`DEC ${iyMem}`);
  if (op === 0x36) return noteIy(`LD ${iyMem},${hex(romByte(pc + 3), 2)}`, 4);

  const loadFrom = [0x46, 0x4E, 0x56, 0x5E, 0x66, 0x6E, 0x7E];
  const loadTo = [0x70, 0x71, 0x72, 0x73, 0x74, 0x75, 0x77];
  const aluFrom = [0x86, 0x8E, 0x96, 0x9E, 0xA6, 0xAE, 0xB6, 0xBE];
  if (loadFrom.includes(op)) return noteIy(`LD ${regs8[op >> 3]},${iyMem}`);
  if (loadTo.includes(op)) return noteIy(`LD ${iyMem},${regs8[op & 7]}`);
  if (aluFrom.includes(op)) {
    const mnemonic = `${alu[(op >> 3) & 7]} ${iyMem}`;
    if (op === 0xBE) stats.cps.push({ at: pc, value: iyMem });
    return noteIy(mnemonic);
  }

  return { size: 2, mnemonic: `FD ${hex(op, 2)}` };
}

function decode(pc, stats) {
  const op = romByte(pc);

  if (op === 0xFD) return decodeFd(pc, stats);
  if (op === 0xCB) return decodeCb(pc, stats);
  if (op === 0x00) return { size: 1, mnemonic: 'NOP' };
  if (op === 0x76) return { size: 1, mnemonic: 'HALT' };
  if (op === 0xF3) return { size: 1, mnemonic: 'DI' };
  if (op === 0xFB) return { size: 1, mnemonic: 'EI' };
  if (op === 0xC9) return { size: 1, mnemonic: 'RET' };
  if (op === 0xD9) return { size: 1, mnemonic: 'EXX' };
  if (op === 0xE3) return { size: 1, mnemonic: 'EX (SP),HL' };
  if (op === 0xEB) return { size: 1, mnemonic: 'EX DE,HL' };
  if (op === 0xF9) return { size: 1, mnemonic: 'LD SP,HL' };

  if ((op & 0xC7) === 0xC0) return { size: 1, mnemonic: `RET ${cc[(op >> 3) & 7]}` };
  if ((op & 0xC7) === 0xC7) return { size: 1, mnemonic: `RST ${hex(op & 0x38, 2)}` };
  if ((op & 0xCF) === 0xC5) return { size: 1, mnemonic: `PUSH ${rp2[(op >> 4) & 3]}` };
  if ((op & 0xCF) === 0xC1) return { size: 1, mnemonic: `POP ${rp2[(op >> 4) & 3]}` };

  if (op === 0xC3) {
    const target = u24(pc + 1);
    addUnique(stats.jps, target);
    return { size: 4, mnemonic: `JP ${hex(target, 6)}` };
  }
  if ((op & 0xC7) === 0xC2) {
    const target = u24(pc + 1);
    addUnique(stats.jps, target);
    return { size: 4, mnemonic: `JP ${cc[(op >> 3) & 7]},${hex(target, 6)}` };
  }
  if (op === 0xCD) {
    const target = u24(pc + 1);
    addUnique(stats.calls, target);
    return { size: 4, mnemonic: `CALL ${hex(target, 6)}` };
  }
  if ((op & 0xC7) === 0xC4) {
    const target = u24(pc + 1);
    addUnique(stats.calls, target);
    return { size: 4, mnemonic: `CALL ${cc[(op >> 3) & 7]},${hex(target, 6)}` };
  }
  if (op === 0x18) {
    const target = relTarget(pc, 2, romByte(pc + 1));
    addUnique(stats.jps, target);
    return { size: 2, mnemonic: `JR ${hex(target, 6)}` };
  }
  if ([0x20, 0x28, 0x30, 0x38].includes(op)) {
    const target = relTarget(pc, 2, romByte(pc + 1));
    addUnique(stats.jps, target);
    return { size: 2, mnemonic: `JR ${cc[(op >> 3) & 3]},${hex(target, 6)}` };
  }
  if (op === 0x10) {
    const target = relTarget(pc, 2, romByte(pc + 1));
    addUnique(stats.jps, target);
    return { size: 2, mnemonic: `DJNZ ${hex(target, 6)}` };
  }

  if (op === 0x3A) {
    const addr = u24(pc + 1);
    if (inRam(addr)) addUnique(stats.ram, addr);
    return { size: 4, mnemonic: `LD A,(${hex(addr, 6)})` };
  }
  if (op === 0x32) {
    const addr = u24(pc + 1);
    if (inRam(addr)) addUnique(stats.ram, addr);
    return { size: 4, mnemonic: `LD (${hex(addr, 6)}),A` };
  }
  if (op === 0x2A) {
    const addr = u24(pc + 1);
    if (inRam(addr)) addUnique(stats.ram, addr);
    return { size: 4, mnemonic: `LD HL,(${hex(addr, 6)})` };
  }
  if (op === 0x22) {
    const addr = u24(pc + 1);
    if (inRam(addr)) addUnique(stats.ram, addr);
    return { size: 4, mnemonic: `LD (${hex(addr, 6)}),HL` };
  }
  if (op === 0xED) {
    const op2 = romByte(pc + 1);
    if (op2 === 0x4B || op2 === 0x5B || op2 === 0x6B || op2 === 0x7B) {
      const addr = u24(pc + 2);
      if (inRam(addr)) addUnique(stats.ram, addr);
      return { size: 5, mnemonic: `LD ${rp[(op2 >> 4) & 3]},(${hex(addr, 6)})` };
    }
    if (op2 === 0x43 || op2 === 0x53 || op2 === 0x63 || op2 === 0x73) {
      const addr = u24(pc + 2);
      if (inRam(addr)) addUnique(stats.ram, addr);
      return { size: 5, mnemonic: `LD (${hex(addr, 6)}),${rp[(op2 >> 4) & 3]}` };
    }
    return { size: 2, mnemonic: `ED ${hex(op2, 2)}` };
  }

  if (op === 0xFE) {
    const value = romByte(pc + 1);
    stats.cps.push({ at: pc, value: hex(value, 2) });
    return { size: 2, mnemonic: `CP ${hex(value, 2)}` };
  }
  if ((op & 0xF8) === 0xB8) {
    stats.cps.push({ at: pc, value: regs8[op & 7] });
    return { size: 1, mnemonic: `CP ${regs8[op & 7]}` };
  }

  if ((op & 0xC0) === 0x40) return { size: 1, mnemonic: `LD ${regs8[(op >> 3) & 7]},${regs8[op & 7]}` };
  if ((op & 0xC0) === 0x80) return { size: 1, mnemonic: `${alu[(op >> 3) & 7]} ${regs8[op & 7]}` };
  if ((op & 0xC7) === 0x04) return { size: 1, mnemonic: `INC ${regs8[(op >> 3) & 7]}` };
  if ((op & 0xC7) === 0x05) return { size: 1, mnemonic: `DEC ${regs8[(op >> 3) & 7]}` };
  if ((op & 0xC7) === 0x06) return { size: 2, mnemonic: `LD ${regs8[(op >> 3) & 7]},${hex(romByte(pc + 1), 2)}` };
  if ((op & 0xCF) === 0x01) return { size: 4, mnemonic: `LD ${rp[(op >> 4) & 3]},${hex(u24(pc + 1), 6)}` };
  if ((op & 0xCF) === 0x03) return { size: 1, mnemonic: `INC ${rp[(op >> 4) & 3]}` };
  if ((op & 0xCF) === 0x0B) return { size: 1, mnemonic: `DEC ${rp[(op >> 4) & 3]}` };
  if ((op & 0xCF) === 0x09) return { size: 1, mnemonic: `ADD HL,${rp[(op >> 4) & 3]}` };

  const immAlu = {
    0xC6: 'ADD A', 0xCE: 'ADC A', 0xD6: 'SUB', 0xDE: 'SBC A',
    0xE6: 'AND', 0xEE: 'XOR', 0xF6: 'OR',
  };
  if (op in immAlu) return { size: 2, mnemonic: `${immAlu[op]} ${hex(romByte(pc + 1), 2)}` };

  return { size: 1, mnemonic: `DB ${hex(op, 2)}` };
}

function disassemble({ name, start, length }) {
  const stats = {
    calls: new Set(),
    jps: new Set(),
    ram: new Set(),
    cps: [],
    iyOps: [],
    reachesTokenTable: false,
    reachesTokenProcessor: false,
  };

  const lines = [];
  let pc = start;
  const end = start + length;
  while (pc < end) {
    const ins = decode(pc, stats);
    const bytes = Array.from({ length: ins.size }, (_, i) => hex(romByte(pc + i), 2).slice(2)).join(' ');
    if (ins.mnemonic.includes(hex(TOKEN_TABLE, 6))) stats.reachesTokenTable = true;
    if (ins.mnemonic.includes(hex(TOKEN_PROCESSOR, 6))) stats.reachesTokenProcessor = true;
    lines.push(`${hex(pc, 6)}  ${bytes.padEnd(14)} ${ins.mnemonic}`);
    pc += Math.max(ins.size, 1);
  }

  console.log(`\n=== ${hex(start, 6)} ${name} (${length} bytes) ===`);
  for (const line of lines) console.log(line);
  console.log('\nCALL targets:', [...stats.calls].sort().join(', ') || '(none)');
  console.log('JP targets:', [...stats.jps].sort().join(', ') || '(none)');
  console.log('RAM reads/writes:', [...stats.ram].sort().join(', ') || '(none)');
  console.log('IY-relative operations:');
  if (stats.iyOps.length === 0) {
    console.log('  (none)');
  } else {
    for (const op of stats.iyOps) {
      console.log(`  ${hex(op.at, 6)} ${op.mnemonic} ; IY base ${hex(IY_BASE, 6)} => ${hex(op.address, 6)}`);
    }
  }
  console.log('CP comparisons:', stats.cps.map((cp) => `${hex(cp.at, 6)}:${cp.value}`).join(', ') || '(none)');
  console.log(`Reaches ${hex(TOKEN_TABLE, 6)}: ${stats.reachesTokenTable ? 'yes' : 'no'}`);
  console.log(`Reaches ${hex(TOKEN_PROCESSOR, 6)}: ${stats.reachesTokenProcessor ? 'yes' : 'no'}`);

  return { start, name, stats };
}

console.log('Phase 520: Decode intermediate token handlers');
console.log(`ROM: ${ROM_PATH} (${rom.length} bytes)`);
console.log('Decoder: eZ80 ADL mode, 24-bit CALL/JP/LD absolute operands');

const results = targets.map(disassemble);

console.log('\n=== SUMMARY ===');
for (const result of results) {
  const { start, name, stats } = result;
  console.log(`\n${hex(start, 6)} ${name}`);
  console.log(`  CALL targets: ${[...stats.calls].sort().join(', ') || '(none)'}`);
  console.log(`  JP targets: ${[...stats.jps].sort().join(', ') || '(none)'}`);
  console.log(`  CP comparisons: ${stats.cps.map((cp) => `${hex(cp.at, 6)}:${cp.value}`).join(', ') || '(none)'}`);
  console.log(`  RAM addresses: ${[...stats.ram].sort().join(', ') || '(none)'}`);
  console.log(`  IY-relative ops: ${stats.iyOps.length}`);
  console.log(`  Reaches token table ${hex(TOKEN_TABLE, 6)}: ${stats.reachesTokenTable ? 'yes' : 'no'}`);
  console.log(`  Reaches token processor ${hex(TOKEN_PROCESSOR, 6)}: ${stats.reachesTokenProcessor ? 'yes' : 'no'}`);
}
