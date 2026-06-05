import fs from 'node:fs';

const ROM_PATH = 'TI-84_Plus_CE/ROM.rom';
const rom = fs.readFileSync(ROM_PATH);

const IY_BASE = 0xD00080;

// Known display/scroll subroutines from sessions 519-521
const KNOWN_SUBS = {
  0x0A2032: 'line wrap/scroll (zeroes curCol, IY+13 bit 2 gates scroll)',
  0x0A3126: 'display scroll dual-layer (pixel LDIR/LDDR + text LDIR)',
  0x0A321D: 'edit-buffer scroll (26-col LDDR + space fill)',
  0x0A212C: 'row shift helper (LDIR, adds 0x06C0, BC=0x001A, fills 0x20)',
  0x0A2D30: 'position calculator',
  0x0A2A37: 'VRAM row operation helper',
  0x0A1A34: 'common exit/cleanup',
  0x0A1799: 'font lookup / glyph render',
  0x0A1B5B: 'char render wrapper',
  0x0A1F52: 'post-render helper',
  0x09CE6B: 'composite refresh entry',
  0x097AC8: 'edit-buffer type dispatcher',
  0x0A1F80: 'cursor saver + display buffer sync',
  0x0800B8: 'display buffer sync target',
  0x09BAFF: 'extended token classifier',
  0x0A20F5: 'simple row increment overflow',
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
const ccNames = ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'];
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
  const bit = (op >> 3) & 7;
  const group = op >> 6;
  const iyAddr = (IY_BASE + d) & 0xFFFFFF;
  const mem = `(IY${d < 0 ? '-' : '+'}${hex(Math.abs(d), 2)})`;
  const mnemonic =
    group === 0 ? `${rot[(op >> 3) & 7]} ${mem}` :
    group === 1 ? `BIT ${bit},${mem}` :
    group === 2 ? `RES ${bit},${mem}` :
    `SET ${bit},${mem}`;
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
    group === 0 ? `${rot[(op >> 3) & 7]} ${mem}` :
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
  if (loadFrom.includes(op)) return noteIdx(`LD ${regs8[(op >> 3) & 7]},${idxMem}`);
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

  if ((op & 0xC7) === 0xC0) return { size: 1, mnemonic: `RET ${ccNames[(op >> 3) & 7]}` };
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
    return { size: 4, mnemonic: `JP ${ccNames[(op >> 3) & 7]},${hex(target, 6)}` };
  }
  if (op === 0xCD) {
    const target = u24(pc + 1);
    addUnique(stats.calls, target);
    return { size: 4, mnemonic: `CALL ${hex(target, 6)}` };
  }
  if ((op & 0xC7) === 0xC4) {
    const target = u24(pc + 1);
    addUnique(stats.calls, target);
    return { size: 4, mnemonic: `CALL ${ccNames[(op >> 3) & 7]},${hex(target, 6)}` };
  }
  if (op === 0x18) {
    const target = relTarget(pc, 2, romByte(pc + 1));
    addUnique(stats.jps, target);
    return { size: 2, mnemonic: `JR ${hex(target, 6)}` };
  }
  if ([0x20, 0x28, 0x30, 0x38].includes(op)) {
    const target = relTarget(pc, 2, romByte(pc + 1));
    addUnique(stats.jps, target);
    return { size: 2, mnemonic: `JR ${ccNames[(op >> 3) & 3]},${hex(target, 6)}` };
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

function makeStats() {
  return {
    calls: new Set(),
    jps: new Set(),
    ram: new Set(),
    cps: [],
    iyOps: [],
    ldirOps: [],
    knownSubCalls: [],
  };
}

// Disassemble a region. Follows internal conditional branches.
// stopAtRet: stop linear scan at first unconditional RET (but still scan branch targets).
function disassemble({ name, start, length, stopAtRet = false }) {
  const stats = makeStats();
  const lines = [];
  const visited = new Set();
  const pending = [start];
  const end = start + length;

  while (pending.length > 0) {
    let pc = pending.shift();
    if (pc < start || pc >= end || visited.has(pc)) continue;

    while (pc < end && !visited.has(pc)) {
      visited.add(pc);
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

      // Queue internal conditional branch targets
      const branchMatch = ins.mnemonic.match(/(JR|JP) (NZ|Z|NC|C|PO|PE|P|M),0x([0-9A-F]{6})/);
      if (branchMatch) {
        const target = parseInt(branchMatch[3], 16);
        if (target >= start && target < end) {
          pending.push(target);
        }
      }

      lines.push({ pc, bytes, mnemonic: ins.mnemonic, size: ins.size });
      pc += Math.max(ins.size, 1);

      // Stop at unconditional RET or JP (outside range)
      if (stopAtRet) {
        const m = ins.mnemonic;
        if (m === 'RET' || m.match(/^JP 0x/)) break;
      }
    }
  }

  // Sort by address for clean output
  lines.sort((a, b) => a.pc - b.pc);

  const minAddr = lines.length > 0 ? lines[0].pc : start;
  const maxAddr = lines.length > 0 ? lines[lines.length - 1].pc + lines[lines.length - 1].size : start;

  console.log(`\n${'='.repeat(70)}`);
  console.log(`=== ${hex(start, 6)} ${name} (${maxAddr - minAddr} bytes decoded) ===`);
  console.log(`${'='.repeat(70)}`);
  for (const line of lines) {
    console.log(`${hex(line.pc, 6)}  ${line.bytes.padEnd(14)} ${line.mnemonic}`);
  }

  console.log(`\n--- Stats for ${name} ---`);
  console.log('CALL targets:', [...stats.calls].sort().join(', ') || '(none)');
  console.log('JP/JR targets:', [...stats.jps].sort().join(', ') || '(none)');
  console.log('RAM reads/writes:', [...stats.ram].sort().join(', ') || '(none)');

  if (stats.iyOps.length > 0) {
    console.log('IY-relative operations:');
    for (const op of stats.iyOps) {
      console.log(`  ${hex(op.at, 6)} ${op.mnemonic} ; IY+${hex(op.offset & 0xFF, 2)} => ${hex(op.address, 6)}`);
    }
  } else {
    console.log('IY-relative operations: (none)');
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

  return { start, name, stats, endAddr: maxAddr };
}

// Analyze LDIR/LDDR setup: walk backwards from each block-move to find
// the most recent HL, DE, BC loads.
function analyzeBlockMoveSetup(funcStart, ldirAddrs) {
  if (ldirAddrs.length === 0) return;

  console.log(`\n${'='.repeat(70)}`);
  console.log('=== BLOCK MOVE CONTEXT (LDIR/LDDR register setup) ===');
  console.log(`${'='.repeat(70)}`);

  for (const ldirAddr of ldirAddrs) {
    const opName = romByte(ldirAddr + 1) === 0xB8 ? 'LDDR' : 'LDIR';
    console.log(`\n${opName} at ${hex(ldirAddr, 6)}:`);

    const stats = makeStats();
    let lastHL = null, lastDE = null, lastBC = null;
    let pc = funcStart;
    while (pc <= ldirAddr) {
      const ins = decode(pc, stats);
      const m = ins.mnemonic;
      if (m.match(/^LD HL,/)) lastHL = { at: pc, mnemonic: m };
      if (m.match(/^LD DE,/)) lastDE = { at: pc, mnemonic: m };
      if (m.match(/^LD BC,/)) lastBC = { at: pc, mnemonic: m };
      if (m === 'EX DE,HL') {
        const tmp = lastHL;
        lastHL = lastDE ? { at: pc, mnemonic: `(was DE) ${lastDE.mnemonic}` } : null;
        lastDE = tmp ? { at: pc, mnemonic: `(was HL) ${tmp.mnemonic}` } : null;
      }
      pc += Math.max(ins.size, 1);
    }
    console.log(`  HL (source): ${lastHL ? `${hex(lastHL.at, 6)} ${lastHL.mnemonic}` : '(computed/inherited)'}`);
    console.log(`  DE (dest):   ${lastDE ? `${hex(lastDE.at, 6)} ${lastDE.mnemonic}` : '(computed/inherited)'}`);
    console.log(`  BC (length): ${lastBC ? `${hex(lastBC.at, 6)} ${lastBC.mnemonic}` : '(computed/inherited)'}`);
  }
}

// ============================================================
// Main
// ============================================================

console.log('Phase 522: Decode 0x092F35 InsertMem-based content scroll');
console.log(`ROM: ${ROM_PATH} (${rom.length} bytes)`);
console.log('Decoder: eZ80 ADL mode, 24-bit CALL/JP/LD absolute operands');
console.log(`IY base: ${hex(IY_BASE, 6)}`);
console.log('');
console.log('Context: 0x092F35 is called by 0x0A2032 (line wrap/scroll) in scroll mode A.');
console.log('Related: 0x0A3126 = display scroll, 0x0A321D = edit-buffer scroll.');
console.log('Goal: determine if this is an InsertMem wrapper, inline block-move, or dispatch stub.');

// --- Primary target: 0x092F35, generous window ---
const primary = disassemble({
  name: 'INSERT-MEM SCROLL (0x092F35)',
  start: 0x092F35,
  length: 300,
  stopAtRet: true,
});

// Analyze block move setup for primary
analyzeBlockMoveSetup(0x092F35, primary.stats.ldirOps);

// --- Follow CALLs one level deep ---
const callTargets = [...primary.stats.calls].sort();
if (callTargets.length > 0) {
  console.log(`\n${'='.repeat(70)}`);
  console.log('=== CALLEE DECODE (1 level deep) ===');
  console.log(`${'='.repeat(70)}`);

  for (const targetStr of callTargets) {
    const target = parseInt(targetStr.slice(2), 16);
    const knownDesc = KNOWN_SUBS[target];
    if (knownDesc) {
      console.log(`\n--- ${hex(target, 6)} = KNOWN: ${knownDesc} (brief decode) ---`);
      const callee = disassemble({
        name: `KNOWN: ${knownDesc}`,
        start: target,
        length: 200,
        stopAtRet: true,
      });
      analyzeBlockMoveSetup(target, callee.stats.ldirOps);
    } else {
      const callee = disassemble({
        name: `CALLEE ${hex(target, 6)}`,
        start: target,
        length: 200,
        stopAtRet: true,
      });
      analyzeBlockMoveSetup(target, callee.stats.ldirOps);
    }
  }
}

// --- Follow external JP targets ---
const jpTargets = [...primary.stats.jps].sort();
const externalJps = jpTargets.filter(t => {
  const addr = parseInt(t.slice(2), 16);
  return addr < 0x092F35 || addr >= primary.endAddr;
});
if (externalJps.length > 0) {
  console.log(`\n${'='.repeat(70)}`);
  console.log('=== EXTERNAL JP/JR TARGETS ===');
  console.log(`${'='.repeat(70)}`);

  for (const targetStr of externalJps) {
    const target = parseInt(targetStr.slice(2), 16);
    if (target < 0x400000) {
      const knownDesc = KNOWN_SUBS[target];
      disassemble({
        name: knownDesc ? `JP TARGET (KNOWN: ${knownDesc})` : `JP TARGET ${hex(target, 6)}`,
        start: target,
        length: 150,
        stopAtRet: true,
      });
    }
  }
}

// ============================================================
// Summary
// ============================================================
console.log(`\n${'='.repeat(70)}`);
console.log('=== SUMMARY: 0x092F35 InsertMem-based content scroll ===');
console.log(`${'='.repeat(70)}`);

console.log(`\nFunction span: ${hex(0x092F35, 6)} - ${hex(primary.endAddr, 6)} (${primary.endAddr - 0x092F35} bytes)`);
console.log(`CALL targets: ${[...primary.stats.calls].sort().join(', ') || '(none)'}`);
console.log(`JP/JR targets: ${[...primary.stats.jps].sort().join(', ') || '(none)'}`);
console.log(`RAM addresses: ${[...primary.stats.ram].sort().join(', ') || '(none)'}`);
console.log(`CP comparisons: ${primary.stats.cps.map(cp => `${hex(cp.at, 6)}:${cp.value}`).join(', ') || '(none)'}`);
console.log(`IY-relative ops: ${primary.stats.iyOps.length}`);
console.log(`LDIR/LDDR block transfers: ${primary.stats.ldirOps.length}`);

if (primary.stats.knownSubCalls.length > 0) {
  console.log('\nKnown subroutine references:');
  for (const ref of primary.stats.knownSubCalls) {
    console.log(`  ${hex(ref.at, 6)} -> ${hex(ref.target, 6)} ${ref.desc}`);
  }
}

// Classification
console.log('\n--- Function classification ---');
const hasBlockMove = primary.stats.ldirOps.length > 0;
const callCount = primary.stats.calls.size;
const ramCount = primary.stats.ram.size;
const iyCount = primary.stats.iyOps.length;
const funcSize = primary.endAddr - 0x092F35;

if (funcSize < 30) {
  console.log('SMALL FUNCTION (<30 bytes) - likely a wrapper/stub/gate');
} else if (funcSize < 80) {
  console.log('MEDIUM FUNCTION (30-80 bytes) - likely a focused helper');
} else {
  console.log('LARGE FUNCTION (>80 bytes) - likely a complex operation');
}

if (hasBlockMove) {
  console.log('Contains LDIR/LDDR - performs inline block memory move');
} else if (callCount > 0) {
  console.log('No inline block moves - delegates via CALL(s)');
}

if (callCount > 0) {
  console.log(`Makes ${callCount} subroutine call(s)`);
}
if (ramCount > 0) {
  console.log(`Touches ${ramCount} RAM address(es)`);
}
if (iyCount > 0) {
  console.log(`Uses ${iyCount} IY-relative op(s) - accesses OS system flags`);
}

console.log('\nDone.');
