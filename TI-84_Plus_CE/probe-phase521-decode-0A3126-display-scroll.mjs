import fs from 'node:fs';

const ROM_PATH = 'TI-84_Plus_CE/ROM.rom';
const rom = fs.readFileSync(ROM_PATH);

const IY_BASE = 0xD00080;

// Known VRAM/display constants
const VRAM_TEXT_BASE = 0xD3FD80;
const VRAM_ROW_STRIDE = 0x0280; // 640 bytes = 320 pixels * 16bpp
const COL_COUNT = 0x1A; // 26

// Known subroutines from session 520
const KNOWN_SUBS = {
  0x0A212C: 'row shift helper (LDIR, adds 0x06C0, BC=0x001A, fills 0x20)',
  0x0A2D30: 'position calculator',
  0x0A2A37: 'VRAM row operation helper',
  0x0A1A34: 'common exit/cleanup',
  0x0A2032: 'line wrap/scroll (session 520)',
  0x0A20F5: 'simple row increment overflow',
  0x0A1799: 'font lookup / glyph render',
  0x0A1B5B: 'char render wrapper',
};

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
  return addr >= 0xD00000 && addr <= 0xD65800;
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

function decodeDdCb(pc, stats) {
  const d = s8(romByte(pc + 2));
  const op = romByte(pc + 3);
  const bit = (op >> 3) & 7;
  const group = op >> 6;
  const mem = `(IX${d < 0 ? '-' : '+'}${hex(Math.abs(d), 2)})`;
  const mnemonic =
    group === 0 ? `${rot[bit]} ${mem}` :
    group === 1 ? `BIT ${bit},${mem}` :
    group === 2 ? `RES ${bit},${mem}` :
    `SET ${bit},${mem}`;
  return { size: 4, mnemonic };
}

function decodeIxIy(pc, stats, prefix) {
  const op = romByte(pc + 1);
  const regName = prefix === 0xDD ? 'IX' : 'IY';
  const isIY = prefix === 0xFD;

  if (op === 0xCB) {
    return isIY ? decodeFdCb(pc, stats) : decodeDdCb(pc, stats);
  }

  const d = s8(romByte(pc + 2));
  const idxMem = `(${regName}${d < 0 ? '-' : '+'}${hex(Math.abs(d), 2)})`;

  const noteIdx = (mnemonic, size = 3) => {
    if (isIY) {
      const iyAddr = (IY_BASE + d) & 0xFFFFFF;
      stats.iyOps.push({ at: pc, mnemonic, offset: d, address: iyAddr });
      if (inRam(iyAddr)) addUnique(stats.ram, iyAddr);
    }
    return { size, mnemonic };
  };

  if (op === 0x21) return { size: 4, mnemonic: `LD ${regName},${hex(u24(pc + 2), 6)}` };
  if (op === 0x22) {
    const addr = u24(pc + 2);
    if (inRam(addr)) addUnique(stats.ram, addr);
    return { size: 4, mnemonic: `LD (${hex(addr, 6)}),${regName}` };
  }
  if (op === 0x2A) {
    const addr = u24(pc + 2);
    if (inRam(addr)) addUnique(stats.ram, addr);
    return { size: 4, mnemonic: `LD ${regName},(${hex(addr, 6)})` };
  }
  if (op === 0xE1) return { size: 2, mnemonic: `POP ${regName}` };
  if (op === 0xE5) return { size: 2, mnemonic: `PUSH ${regName}` };
  if (op === 0xE9) return { size: 2, mnemonic: `JP (${regName})` };
  if (op === 0xF9) return { size: 2, mnemonic: `LD SP,${regName}` };
  if (op === 0x23) return { size: 2, mnemonic: `INC ${regName}` };
  if (op === 0x2B) return { size: 2, mnemonic: `DEC ${regName}` };
  if (op === 0x09) return { size: 2, mnemonic: `ADD ${regName},BC` };
  if (op === 0x19) return { size: 2, mnemonic: `ADD ${regName},DE` };
  if (op === 0x29) return { size: 2, mnemonic: `ADD ${regName},${regName}` };
  if (op === 0x39) return { size: 2, mnemonic: `ADD ${regName},SP` };

  if (op === 0x34) return noteIdx(`INC ${idxMem}`);
  if (op === 0x35) return noteIdx(`DEC ${idxMem}`);
  if (op === 0x36) return noteIdx(`LD ${idxMem},${hex(romByte(pc + 3), 2)}`, 4);

  const loadFrom = [0x46, 0x4E, 0x56, 0x5E, 0x66, 0x6E, 0x7E];
  const loadTo = [0x70, 0x71, 0x72, 0x73, 0x74, 0x75, 0x77];
  const aluFrom = [0x86, 0x8E, 0x96, 0x9E, 0xA6, 0xAE, 0xB6, 0xBE];
  if (loadFrom.includes(op)) return noteIdx(`LD ${regs8[op >> 3]},${idxMem}`);
  if (loadTo.includes(op)) return noteIdx(`LD ${idxMem},${regs8[op & 7]}`);
  if (aluFrom.includes(op)) {
    const mnemonic = `${alu[(op >> 3) & 7]} ${idxMem}`;
    if (op === 0xBE) stats.cps.push({ at: pc, value: idxMem });
    return noteIdx(mnemonic);
  }

  return { size: 2, mnemonic: `${hex(prefix, 2)} ${hex(op, 2)}` };
}

function decodeEd(pc, stats) {
  const op2 = romByte(pc + 1);

  if (op2 === 0xB0) return { size: 2, mnemonic: 'LDIR' };
  if (op2 === 0xB8) return { size: 2, mnemonic: 'LDDR' };
  if (op2 === 0xA0) return { size: 2, mnemonic: 'LDI' };
  if (op2 === 0xA8) return { size: 2, mnemonic: 'LDD' };
  if (op2 === 0xB1) return { size: 2, mnemonic: 'CPIR' };
  if (op2 === 0xB9) return { size: 2, mnemonic: 'CPDR' };
  if (op2 === 0xA1) return { size: 2, mnemonic: 'CPI' };
  if (op2 === 0xA9) return { size: 2, mnemonic: 'CPD' };
  if (op2 === 0x47) return { size: 2, mnemonic: 'LD I,A' };
  if (op2 === 0x57) return { size: 2, mnemonic: 'LD A,I' };
  if (op2 === 0x4F) return { size: 2, mnemonic: 'LD R,A' };
  if (op2 === 0x5F) return { size: 2, mnemonic: 'LD A,R' };
  if (op2 === 0x44) return { size: 2, mnemonic: 'NEG' };
  if (op2 === 0x4D) return { size: 2, mnemonic: 'RETI' };
  if (op2 === 0x45) return { size: 2, mnemonic: 'RETN' };
  if (op2 === 0x46) return { size: 2, mnemonic: 'IM 0' };
  if (op2 === 0x56) return { size: 2, mnemonic: 'IM 1' };
  if (op2 === 0x5E) return { size: 2, mnemonic: 'IM 2' };
  if (op2 === 0x67) return { size: 2, mnemonic: 'RRD' };
  if (op2 === 0x6F) return { size: 2, mnemonic: 'RLD' };

  if ((op2 & 0xCF) === 0x42) return { size: 2, mnemonic: `SBC HL,${rp[(op2 >> 4) & 3]}` };
  if ((op2 & 0xCF) === 0x4A) return { size: 2, mnemonic: `ADC HL,${rp[(op2 >> 4) & 3]}` };
  if ((op2 & 0xC7) === 0x40) return { size: 2, mnemonic: `IN ${regs8[(op2 >> 3) & 7]},(C)` };
  if ((op2 & 0xC7) === 0x41) return { size: 2, mnemonic: `OUT (C),${regs8[(op2 >> 3) & 7]}` };

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

  if (op2 === 0x64) return { size: 3, mnemonic: `TST A,${hex(romByte(pc + 2), 2)}` };
  if ((op2 & 0xCF) === 0x4C) return { size: 2, mnemonic: `MLT ${rp[(op2 >> 4) & 3]}` };

  return { size: 2, mnemonic: `ED ${hex(op2, 2)}` };
}

function decode(pc, stats) {
  const op = romByte(pc);

  if (op === 0xDD) return decodeIxIy(pc, stats, 0xDD);
  if (op === 0xFD) return decodeIxIy(pc, stats, 0xFD);
  if (op === 0xCB) return decodeCb(pc, stats);
  if (op === 0xED) return decodeEd(pc, stats);

  if (op === 0x00) return { size: 1, mnemonic: 'NOP' };
  if (op === 0x76) return { size: 1, mnemonic: 'HALT' };
  if (op === 0xF3) return { size: 1, mnemonic: 'DI' };
  if (op === 0xFB) return { size: 1, mnemonic: 'EI' };
  if (op === 0xC9) return { size: 1, mnemonic: 'RET' };
  if (op === 0xD9) return { size: 1, mnemonic: 'EXX' };
  if (op === 0xE3) return { size: 1, mnemonic: 'EX (SP),HL' };
  if (op === 0xEB) return { size: 1, mnemonic: 'EX DE,HL' };
  if (op === 0xF9) return { size: 1, mnemonic: 'LD SP,HL' };
  if (op === 0xE9) return { size: 1, mnemonic: 'JP (HL)' };
  if (op === 0x07) return { size: 1, mnemonic: 'RLCA' };
  if (op === 0x0F) return { size: 1, mnemonic: 'RRCA' };
  if (op === 0x17) return { size: 1, mnemonic: 'RLA' };
  if (op === 0x1F) return { size: 1, mnemonic: 'RRA' };
  if (op === 0x27) return { size: 1, mnemonic: 'DAA' };
  if (op === 0x2F) return { size: 1, mnemonic: 'CPL' };
  if (op === 0x37) return { size: 1, mnemonic: 'SCF' };
  if (op === 0x3F) return { size: 1, mnemonic: 'CCF' };
  if (op === 0x08) return { size: 1, mnemonic: "EX AF,AF'" };

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

  if (op === 0xD3) return { size: 2, mnemonic: `OUT (${hex(romByte(pc + 1), 2)}),A` };
  if (op === 0xDB) return { size: 2, mnemonic: `IN A,(${hex(romByte(pc + 1), 2)})` };

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

  if (op === 0x02) return { size: 1, mnemonic: 'LD (BC),A' };
  if (op === 0x12) return { size: 1, mnemonic: 'LD (DE),A' };
  if (op === 0x0A) return { size: 1, mnemonic: 'LD A,(BC)' };
  if (op === 0x1A) return { size: 1, mnemonic: 'LD A,(DE)' };

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
    ldirOps: [],
    knownSubCalls: [],
  };

  const lines = [];
  let pc = start;
  const end = start + length;
  while (pc < end) {
    const ins = decode(pc, stats);
    const bytes = Array.from({ length: ins.size }, (_, i) =>
      hex(romByte(pc + i), 2).slice(2)
    ).join(' ');

    if (ins.mnemonic === 'LDIR' || ins.mnemonic === 'LDDR') {
      stats.ldirOps.push(pc);
    }

    for (const [addr, desc] of Object.entries(KNOWN_SUBS)) {
      if (ins.mnemonic.includes(hex(Number(addr), 6))) {
        stats.knownSubCalls.push({ at: pc, target: Number(addr), desc });
      }
    }

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
      console.log(`  ${hex(op.at, 6)} ${op.mnemonic} ; IY+${hex(op.offset & 0xFF, 2)} => ${hex(op.address, 6)}`);
    }
  }

  console.log('CP comparisons:', stats.cps.map((cp) => `${hex(cp.at, 6)}:${cp.value}`).join(', ') || '(none)');

  if (stats.ldirOps.length > 0) {
    console.log(`LDIR/LDDR block transfers at: ${stats.ldirOps.map(a => hex(a, 6)).join(', ')}`);
  }

  if (stats.knownSubCalls.length > 0) {
    console.log('Known subroutine references:');
    for (const ref of stats.knownSubCalls) {
      console.log(`  ${hex(ref.at, 6)} -> ${hex(ref.target, 6)} ${ref.desc}`);
    }
  }

  return { start, name, stats };
}

// --- Analysis targets ---
// Primary: 0x0A3126 display scroll, scan 500 bytes
// Also scan the known helpers it likely calls
const targets = [
  { name: 'DISPLAY SCROLL (primary)', start: 0x0A3126, length: 500 },
  { name: 'row shift helper (LDIR)', start: 0x0A212C, length: 80 },
  { name: 'VRAM row operation helper', start: 0x0A2A37, length: 80 },
  { name: 'position calculator', start: 0x0A2D30, length: 80 },
  { name: 'common exit/cleanup', start: 0x0A1A34, length: 60 },
];

console.log('Phase 521: Decode 0x0A3126 DISPLAY SCROLL');
console.log(`ROM: ${ROM_PATH} (${rom.length} bytes)`);
console.log('Decoder: eZ80 ADL mode, 24-bit CALL/JP/LD absolute operands');
console.log(`IY base: ${hex(IY_BASE, 6)}`);
console.log(`VRAM text base: ${hex(VRAM_TEXT_BASE, 6)}`);
console.log(`VRAM row stride: ${hex(VRAM_ROW_STRIDE, 4)} (${VRAM_ROW_STRIDE} bytes)`);

const results = targets.map(disassemble);

// --- Constant scan in primary target ---
console.log('\n========================================');
console.log('=== VRAM CONSTANT SCAN in 0x0A3126 ===');
console.log('========================================');
const scanStart = 0x0A3126;
const scanLen = 500;
const vramConstants = [
  { value: 0xD3FD80, name: 'VRAM text base' },
  { value: 0xD40000, name: 'VRAM LCD start' },
  { value: 0x000280, name: 'row stride (640)' },
  { value: 0x0006C0, name: '0x6C0 (1728)' },
  { value: 0x002800, name: 'stride*16 (0x2800)' },
  { value: 0x002D00, name: 'stride*18 (0x2D00)' },
  { value: 0x001A00, name: '26*256?' },
  { value: 0x1A, name: 'col count 26' },
  { value: 0x20, name: 'space 0x20' },
  { value: 0x10, name: '16 (glyph height)' },
  { value: 0x12, name: '18 (glyph height)' },
  { value: 0x09, name: '9 (max row index)' },
  { value: 0x0A, name: '10 (row count)' },
];

for (const vc of vramConstants) {
  if (vc.value <= 0xFF) {
    // Single byte - look for it as immediate operand
    const hits = [];
    for (let i = scanStart; i < scanStart + scanLen; i++) {
      if (romByte(i) === vc.value) {
        // Check if previous byte is an immediate-load opcode
        const prev = romByte(i - 1);
        if (prev === 0x3E || prev === 0x06 || prev === 0x0E || prev === 0x16 ||
            prev === 0x1E || prev === 0x26 || prev === 0x2E || prev === 0xFE ||
            prev === 0xC6 || prev === 0xD6 || prev === 0xE6 || prev === 0xF6 ||
            prev === 0x36) {
          hits.push(hex(i - 1, 6));
        }
      }
    }
    if (hits.length > 0) {
      console.log(`  ${hex(vc.value, 2)} (${vc.name}): immediate at ${hits.join(', ')}`);
    }
  } else {
    // Multi-byte LE
    const b0 = vc.value & 0xFF;
    const b1 = (vc.value >> 8) & 0xFF;
    const b2 = (vc.value >> 16) & 0xFF;
    const hits = [];
    for (let i = scanStart; i < scanStart + scanLen - 2; i++) {
      if (romByte(i) === b0 && romByte(i + 1) === b1) {
        if (vc.value <= 0xFFFF || romByte(i + 2) === b2) {
          hits.push(hex(i, 6));
        }
      }
    }
    if (hits.length > 0) {
      console.log(`  ${hex(vc.value, 6)} (${vc.name}): found at ${hits.join(', ')}`);
    }
  }
}

// --- Summary ---
console.log('\n========================================');
console.log('=== SUMMARY ===');
console.log('========================================');
for (const result of results) {
  const { start, name, stats } = result;
  console.log(`\n${hex(start, 6)} ${name}`);
  console.log(`  CALL targets: ${[...stats.calls].sort().join(', ') || '(none)'}`);
  console.log(`  JP targets: ${[...stats.jps].sort().join(', ') || '(none)'}`);
  console.log(`  RAM addresses: ${[...stats.ram].sort().join(', ') || '(none)'}`);
  console.log(`  CP comparisons: ${stats.cps.map((cp) => `${hex(cp.at, 6)}:${cp.value}`).join(', ') || '(none)'}`);
  console.log(`  IY-relative ops: ${stats.iyOps.length}`);
  console.log(`  LDIR/LDDR ops: ${stats.ldirOps.length}`);
  if (stats.knownSubCalls.length > 0) {
    console.log(`  Known sub refs: ${stats.knownSubCalls.map(r => `${hex(r.at, 6)}->${hex(r.target, 6)} (${r.desc})`).join(', ')}`);
  }
}

console.log('\n========================================');
console.log('=== DISPLAY SCROLL ANALYSIS ===');
console.log('========================================');
console.log(`
Entry: 0x0A3126
Called by:
  - 0x0A2032 line wrap/scroll mode B
  - 0x0A20F5 simple row increment overflow

VRAM geometry:
  Text VRAM: ${hex(VRAM_TEXT_BASE, 6)}
  Row stride: ${VRAM_ROW_STRIDE} bytes (320px * 2 bytes/px)
  10 text rows * 16px = 160 pixel rows
  Total text area: ${160 * VRAM_ROW_STRIDE} bytes (${hex(160 * VRAM_ROW_STRIDE, 6)})
  One text-row block: ${16 * VRAM_ROW_STRIDE} bytes (${hex(16 * VRAM_ROW_STRIDE, 4)})

Expected scroll-up pattern:
  1. Set HL = VRAM_TEXT_BASE (destination, row 0)
  2. Set DE = VRAM_TEXT_BASE + glyph_height * stride (source, row 1)
  3. Set BC = (total_rows - 1) * glyph_height * stride (byte count)
  4. LDIR to shift rows up
  5. Clear bottom row (fill last glyph_height * stride bytes with bg color)

Key helpers to check:
  0x0A212C - row shift with LDIR
  0x0A2A37 - VRAM row operation
  0x0A2D30 - position calculator
  0x0A1A34 - exit/cleanup
`);
