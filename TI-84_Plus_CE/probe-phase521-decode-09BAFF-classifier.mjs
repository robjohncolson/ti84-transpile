import fs from 'node:fs';

const ROM_PATH = 'TI-84_Plus_CE/ROM.rom';
const rom = fs.readFileSync(ROM_PATH);

const IY_BASE = 0xD00080;
const TOKEN_TABLE = 0x061D1A;
const TOKEN_PROCESSOR = 0x03E1B4;

// Known handler addresses from session 520
const KNOWN_HANDLERS = {
  0x061D1A: 'default token table (LD A,0x88 -> RST 0x18 -> CALL 0x03E1B4)',
  0x061D22: 'token table + 8',
  0x061D3E: 'token table + 36',
  0x059FFF: 'variable handler',
  0x099FDA: 'another handler',
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
  if (op === 0xE9) return { size: 1, mnemonic: 'JP (HL)' };
  if (op === 0x07) return { size: 1, mnemonic: 'RLCA' };
  if (op === 0x0F) return { size: 1, mnemonic: 'RRCA' };
  if (op === 0x17) return { size: 1, mnemonic: 'RLA' };
  if (op === 0x1F) return { size: 1, mnemonic: 'RRA' };
  if (op === 0x27) return { size: 1, mnemonic: 'DAA' };
  if (op === 0x2F) return { size: 1, mnemonic: 'CPL' };
  if (op === 0x37) return { size: 1, mnemonic: 'SCF' };
  if (op === 0x3F) return { size: 1, mnemonic: 'CCF' };

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
    if (op2 === 0xB0) return { size: 2, mnemonic: 'LDIR' };
    if (op2 === 0xB8) return { size: 2, mnemonic: 'LDDR' };
    if (op2 === 0xB1) return { size: 2, mnemonic: 'CPIR' };
    if (op2 === 0xB9) return { size: 2, mnemonic: 'CPDR' };
    if (op2 === 0xA0) return { size: 2, mnemonic: 'LDI' };
    if (op2 === 0xA8) return { size: 2, mnemonic: 'LDD' };
    if (op2 === 0xA1) return { size: 2, mnemonic: 'CPI' };
    if (op2 === 0xA9) return { size: 2, mnemonic: 'CPD' };
    if (op2 === 0x44) return { size: 2, mnemonic: 'NEG' };
    if (op2 === 0x4D) return { size: 2, mnemonic: 'RETI' };
    if (op2 === 0x45) return { size: 2, mnemonic: 'RETN' };
    if (op2 === 0x46) return { size: 2, mnemonic: 'IM 0' };
    if (op2 === 0x56) return { size: 2, mnemonic: 'IM 1' };
    if (op2 === 0x5E) return { size: 2, mnemonic: 'IM 2' };
    if (op2 === 0x47) return { size: 2, mnemonic: 'LD I,A' };
    if (op2 === 0x4F) return { size: 2, mnemonic: 'LD R,A' };
    if (op2 === 0x57) return { size: 2, mnemonic: 'LD A,I' };
    if (op2 === 0x5F) return { size: 2, mnemonic: 'LD A,R' };
    if (op2 === 0x67) return { size: 2, mnemonic: 'RRD' };
    if (op2 === 0x6F) return { size: 2, mnemonic: 'RLD' };
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
    if ((op2 & 0xCF) === 0x42) {
      return { size: 2, mnemonic: `SBC HL,${rp[(op2 >> 4) & 3]}` };
    }
    if ((op2 & 0xCF) === 0x4A) {
      return { size: 2, mnemonic: `ADC HL,${rp[(op2 >> 4) & 3]}` };
    }
    if ((op2 & 0xC7) === 0x40) return { size: 2, mnemonic: `IN ${regs8[(op2 >> 3) & 7]},(C)` };
    if ((op2 & 0xC7) === 0x41) return { size: 2, mnemonic: `OUT (C),${regs8[(op2 >> 3) & 7]}` };
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

  if (op === 0x02) return { size: 1, mnemonic: 'LD (BC),A' };
  if (op === 0x0A) return { size: 1, mnemonic: 'LD A,(BC)' };
  if (op === 0x12) return { size: 1, mnemonic: 'LD (DE),A' };
  if (op === 0x1A) return { size: 1, mnemonic: 'LD A,(DE)' };

  if (op === 0xD3) return { size: 2, mnemonic: `OUT (${hex(romByte(pc + 1), 2)}),A` };
  if (op === 0xDB) return { size: 2, mnemonic: `IN A,(${hex(romByte(pc + 1), 2)})` };

  const immAlu = {
    0xC6: 'ADD A', 0xCE: 'ADC A', 0xD6: 'SUB', 0xDE: 'SBC A',
    0xE6: 'AND', 0xEE: 'XOR', 0xF6: 'OR',
  };
  if (op in immAlu) return { size: 2, mnemonic: `${immAlu[op]} ${hex(romByte(pc + 1), 2)}` };

  return { size: 1, mnemonic: `DB ${hex(op, 2)}` };
}

// ============================================================
// Disassemble a region and collect stats
// ============================================================
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

  return { start, name, stats, lines };
}

// ============================================================
// Extract dispatch table from CP/JR/JP patterns
// ============================================================
function extractDispatchTable(lines) {
  const dispatch = [];
  let lastCpValue = null;
  let lastCpAddr = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Parse address from the beginning
    const addrStr = line.substring(0, 8).trim();

    // Find the mnemonic portion (after the hex bytes)
    const mnemonicStart = line.indexOf('  ', 10);
    if (mnemonicStart < 0) continue;
    const mnemonic = line.substring(mnemonicStart).trim();

    // Track CP instructions
    const cpMatch = mnemonic.match(/^CP (0x[0-9A-F]+)$/);
    if (cpMatch) {
      lastCpValue = parseInt(cpMatch[1], 16);
      lastCpAddr = addrStr;
      continue;
    }

    // Track conditional jumps after CP
    if (lastCpValue !== null) {
      const jrMatch = mnemonic.match(/^JR (Z|NZ|C|NC),(0x[0-9A-F]+)$/);
      const jpMatch = mnemonic.match(/^JP (Z|NZ|C|NC|PE|PO|P|M),(0x[0-9A-F]+)$/);
      const match = jrMatch || jpMatch;

      if (match) {
        const condition = match[1];
        const target = parseInt(match[2], 16);
        let meaning = '';

        if (condition === 'Z') meaning = `token == ${hex(lastCpValue, 2)}`;
        else if (condition === 'NZ') meaning = `token != ${hex(lastCpValue, 2)}`;
        else if (condition === 'C') meaning = `token < ${hex(lastCpValue, 2)}`;
        else if (condition === 'NC') meaning = `token >= ${hex(lastCpValue, 2)}`;

        const handlerName = KNOWN_HANDLERS[target] || '';
        dispatch.push({
          cpAddr: lastCpAddr,
          cpValue: lastCpValue,
          condition,
          target,
          meaning,
          handlerName,
        });
        continue;
      }

      // Unconditional JP after CP sequence
      const jpUncond = mnemonic.match(/^JP (0x[0-9A-F]+)$/);
      if (jpUncond) {
        const target = parseInt(jpUncond[1], 16);
        const handlerName = KNOWN_HANDLERS[target] || '';
        dispatch.push({
          cpAddr: lastCpAddr,
          cpValue: lastCpValue,
          condition: 'unconditional',
          target,
          meaning: `fallthrough after CP ${hex(lastCpValue, 2)}`,
          handlerName,
        });
        lastCpValue = null;
        lastCpAddr = null;
        continue;
      }

      // RET or CALL clears CP context
      if (mnemonic.startsWith('RET') && !mnemonic.startsWith('RET ')) {
        lastCpValue = null;
        lastCpAddr = null;
      }
    }
  }

  return dispatch;
}

// ============================================================
// Main
// ============================================================

console.log('Phase 521: Decode 0x09BAFF EXTENDED TOKEN CLASSIFIER');
console.log(`ROM: ${ROM_PATH} (${rom.length} bytes)`);
console.log('Decoder: eZ80 ADL mode, 24-bit CALL/JP/LD absolute operands');
console.log(`IY base: ${hex(IY_BASE, 6)}`);

// Primary target: 0x09BAFF for 400 bytes
const primary = disassemble({
  name: 'EXTENDED TOKEN CLASSIFIER (primary)',
  start: 0x09BAFF,
  length: 400,
});

// Continuation region
const continuation = disassemble({
  name: 'CLASSIFIER CONTINUATION',
  start: 0x09BAFF + 400,
  length: 200,
});

// Known handler targets for context
const handlerTargets = [
  { name: 'handler 0x061D22 (token table + 8)', start: 0x061D22, length: 60 },
  { name: 'handler 0x061D3E (token table + 36)', start: 0x061D3E, length: 60 },
  { name: 'handler 0x059FFF (variable handler)', start: 0x059FFF, length: 80 },
  { name: 'handler 0x099FDA', start: 0x099FDA, length: 80 },
];

const handlerResults = handlerTargets.map(disassemble);

// Extract dispatch table
console.log('\n========================================');
console.log('=== DISPATCH TABLE EXTRACTION ===');
console.log('========================================');

const allLines = [...primary.lines, ...continuation.lines];
const dispatch = extractDispatchTable(allLines);

console.log(`\nFound ${dispatch.length} dispatch entries:\n`);
console.log('CP_ADDR    | CP_VALUE | CONDITION     | TARGET     | HANDLER');
console.log('-'.repeat(90));
for (const entry of dispatch) {
  const cpVal = hex(entry.cpValue, 2).padEnd(8);
  const cond = entry.condition.padEnd(13);
  const target = hex(entry.target, 6);
  const handler = entry.handlerName || entry.meaning;
  console.log(`${entry.cpAddr} | ${cpVal} | ${cond} | ${target} | ${handler}`);
}

// Token value -> handler address map
console.log('\n========================================');
console.log('=== TOKEN VALUE -> HANDLER ADDRESS MAP ===');
console.log('========================================\n');

const tokenMap = new Map();
for (const entry of dispatch) {
  const key = `${hex(entry.cpValue, 2)}_${entry.condition}`;
  if (!tokenMap.has(key)) {
    tokenMap.set(key, entry);
  }
}

for (const [key, entry] of tokenMap) {
  console.log(`  Token ${hex(entry.cpValue, 2)} (${entry.condition}) => ${hex(entry.target, 6)} ${entry.handlerName || ''}`);
}

// RAM access summary
console.log('\n========================================');
console.log('=== RAM ACCESS SUMMARY ===');
console.log('========================================\n');

const allRam = new Set([...primary.stats.ram, ...continuation.stats.ram]);
const knownRamNames = {
  '0xD005F9': 'key code',
  '0xD005FA': 'descriptor flags',
  '0xD00596': 'curCol',
  '0xD00082': 'flags (IY+2)',
  '0xD00593': 'curPC / token pointer',
  '0xD0231A': 'curPC (session 520)',
  '0xD02593': 'OPS stack (session 520)',
  '0xD00084': 'flags (IY+4)',
  '0xD00085': 'flags (IY+5)',
  '0xD00086': 'flags (IY+6)',
  '0xD00087': 'flags (IY+7)',
  '0xD00088': 'flags (IY+8)',
  '0xD00089': 'flags (IY+9)',
  '0xD0008A': 'flags (IY+10)',
  '0xD0008B': 'flags (IY+11)',
  '0xD0008C': 'flags (IY+12)',
  '0xD0008D': 'flags (IY+13) display flags',
};

console.log('All RAM addresses accessed:');
for (const addr of [...allRam].sort()) {
  const name = knownRamNames[addr] || '';
  console.log(`  ${addr} ${name}`);
}

console.log('\nIY-relative operations from classifier:');
const allIyOps = [...primary.stats.iyOps, ...continuation.stats.iyOps];
for (const op of allIyOps) {
  console.log(`  ${hex(op.at, 6)} ${op.mnemonic} => ${hex(op.address, 6)}`);
}

// Full CP listing
console.log('\n========================================');
console.log('=== ALL CP COMPARISONS (ordered) ===');
console.log('========================================\n');

const allCps = [...primary.stats.cps, ...continuation.stats.cps];
for (const cp of allCps) {
  console.log(`  ${hex(cp.at, 6)}: CP ${cp.value}`);
}

// Summary
console.log('\n========================================');
console.log('=== FINAL SUMMARY ===');
console.log('========================================');

console.log(`\nClassifier at 0x09BAFF:`);
console.log(`  Total CP comparisons: ${allCps.length}`);
console.log(`  Dispatch entries extracted: ${dispatch.length}`);
console.log(`  Unique handler targets: ${new Set(dispatch.map(d => d.target)).size}`);
console.log(`  CALL targets: ${[...new Set([...primary.stats.calls, ...continuation.stats.calls])].sort().join(', ') || '(none)'}`);
console.log(`  JP targets: ${[...new Set([...primary.stats.jps, ...continuation.stats.jps])].sort().join(', ') || '(none)'}`);
console.log(`  RAM addresses: ${[...allRam].sort().join(', ') || '(none)'}`);
console.log(`  IY-relative ops: ${allIyOps.length}`);
console.log(`  Reaches token table: ${primary.stats.reachesTokenTable || continuation.stats.reachesTokenTable ? 'yes' : 'no'}`);
console.log(`  Reaches token processor: ${primary.stats.reachesTokenProcessor || continuation.stats.reachesTokenProcessor ? 'yes' : 'no'}`);
