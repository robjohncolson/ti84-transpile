/**
 * probe-phase589-map-D01D0B.mjs
 *
 * Scans the entire ROM (0x000000-0x3FFFFF) for all references to RAM address
 * D01D0B, categorizes them as READ/WRITE/ADDRESS, decodes 2 instructions of
 * context before and after each hit, and scans D01D0A and D01D0D for boundary
 * confirmation.
 */
import { readFileSync } from 'fs';

const rom = readFileSync('TI-84_Plus_CE/ROM.rom');
const ROM_SIZE = rom.length; // 4MB = 0x400000

const TARGET = 0xD01D0B;
const BOUNDARY_ADDRS = [0xD01D0A, 0xD01D0D];

function hex(n, w = 6) {
  return '0x' + n.toString(16).toUpperCase().padStart(w, '0');
}

/**
 * Scan ROM for 3-byte little-endian encoding of a 24-bit address.
 */
function scanAddress(addr) {
  const lo = addr & 0xFF;
  const mid = (addr >> 8) & 0xFF;
  const hi = (addr >> 16) & 0xFF;

  const refs = [];

  for (let i = 0; i < ROM_SIZE - 2; i++) {
    if (rom[i] === lo && rom[i + 1] === mid && rom[i + 2] === hi) {
      const ref = classifyRef(i, addr);
      refs.push(ref);
    }
  }
  return refs;
}

function classifyRef(dataOffset, addr) {
  const b1 = dataOffset >= 1 ? rom[dataOffset - 1] : -1;
  const b2 = dataOffset >= 2 ? rom[dataOffset - 2] : -1;
  const b3 = dataOffset >= 3 ? rom[dataOffset - 3] : -1;

  let type = 'UNKNOWN';
  let instr = '???';
  let instrAddr = dataOffset;

  // Check for DD ED / FD ED prefixed (IX/IY via ED opcodes)
  if (b3 === 0xDD && b2 === 0xED) {
    instrAddr = dataOffset - 3;
    switch (b1) {
      case 0x4B: type = 'READ';  instr = `LD.LIL BC,(${hex(addr)})`; break;
      case 0x5B: type = 'READ';  instr = `LD.LIL DE,(${hex(addr)})`; break;
      case 0x6B: type = 'READ';  instr = `LD.LIL IX,(${hex(addr)})`; break;
      case 0x7B: type = 'READ';  instr = `LD.LIL SP,(${hex(addr)})`; break;
      case 0x43: type = 'WRITE'; instr = `LD.LIL (${hex(addr)}),BC`; break;
      case 0x53: type = 'WRITE'; instr = `LD.LIL (${hex(addr)}),DE`; break;
      case 0x63: type = 'WRITE'; instr = `LD.LIL (${hex(addr)}),IX`; break;
      case 0x73: type = 'WRITE'; instr = `LD.LIL (${hex(addr)}),SP`; break;
    }
  }
  if (type === 'UNKNOWN' && b3 === 0xFD && b2 === 0xED) {
    instrAddr = dataOffset - 3;
    switch (b1) {
      case 0x4B: type = 'READ';  instr = `LD.LIL BC,(${hex(addr)}) [FD]`; break;
      case 0x5B: type = 'READ';  instr = `LD.LIL DE,(${hex(addr)}) [FD]`; break;
      case 0x6B: type = 'READ';  instr = `LD.LIL IY,(${hex(addr)})`; break;
      case 0x7B: type = 'READ';  instr = `LD.LIL SP,(${hex(addr)}) [FD]`; break;
      case 0x43: type = 'WRITE'; instr = `LD.LIL (${hex(addr)}),BC [FD]`; break;
      case 0x53: type = 'WRITE'; instr = `LD.LIL (${hex(addr)}),DE [FD]`; break;
      case 0x63: type = 'WRITE'; instr = `LD.LIL (${hex(addr)}),IY`; break;
      case 0x73: type = 'WRITE'; instr = `LD.LIL (${hex(addr)}),SP [FD]`; break;
    }
  }

  // Check for ED-prefixed instructions (2-byte opcode + 3-byte address)
  if (type === 'UNKNOWN' && b2 === 0xED) {
    instrAddr = dataOffset - 2;
    switch (b1) {
      case 0x4B: type = 'READ';  instr = `LD BC,(${hex(addr)})`; break;
      case 0x5B: type = 'READ';  instr = `LD DE,(${hex(addr)})`; break;
      case 0x6B: type = 'READ';  instr = `LD HL,(${hex(addr)})`; break;
      case 0x7B: type = 'READ';  instr = `LD SP,(${hex(addr)})`; break;
      case 0x43: type = 'WRITE'; instr = `LD (${hex(addr)}),BC`; break;
      case 0x53: type = 'WRITE'; instr = `LD (${hex(addr)}),DE`; break;
      case 0x63: type = 'WRITE'; instr = `LD (${hex(addr)}),HL`; break;
      case 0x73: type = 'WRITE'; instr = `LD (${hex(addr)}),SP`; break;
    }
  }

  // Check for DD/FD prefixed single-byte opcodes
  if (type === 'UNKNOWN' && b2 === 0xDD) {
    instrAddr = dataOffset - 2;
    switch (b1) {
      case 0x21: type = 'ADDR';  instr = `LD IX,${hex(addr)}`; break;
      case 0x22: type = 'WRITE'; instr = `LD (${hex(addr)}),IX`; break;
      case 0x2A: type = 'READ';  instr = `LD IX,(${hex(addr)})`; break;
    }
  }
  if (type === 'UNKNOWN' && b2 === 0xFD) {
    instrAddr = dataOffset - 2;
    switch (b1) {
      case 0x21: type = 'ADDR';  instr = `LD IY,${hex(addr)}`; break;
      case 0x22: type = 'WRITE'; instr = `LD (${hex(addr)}),IY`; break;
      case 0x2A: type = 'READ';  instr = `LD IY,(${hex(addr)})`; break;
    }
  }

  // Check unprefixed single-byte opcodes
  if (type === 'UNKNOWN') {
    instrAddr = dataOffset - 1;
    switch (b1) {
      case 0x3A: type = 'READ';  instr = `LD A,(${hex(addr)})`; break;
      case 0x2A: type = 'READ';  instr = `LD HL,(${hex(addr)})`; break;
      case 0x32: type = 'WRITE'; instr = `LD (${hex(addr)}),A`; break;
      case 0x22: type = 'WRITE'; instr = `LD (${hex(addr)}),HL`; break;
      case 0x21: type = 'ADDR';  instr = `LD HL,${hex(addr)}`; break;
      case 0x01: type = 'ADDR';  instr = `LD BC,${hex(addr)}`; break;
      case 0x11: type = 'ADDR';  instr = `LD DE,${hex(addr)}`; break;
      case 0x31: type = 'ADDR';  instr = `LD SP,${hex(addr)}`; break;
      case 0xC3: type = 'JUMP';  instr = `JP ${hex(addr)}`; break;
      case 0xCD: type = 'CALL';  instr = `CALL ${hex(addr)}`; break;
      case 0xC2: type = 'JUMP';  instr = `JP NZ,${hex(addr)}`; break;
      case 0xCA: type = 'JUMP';  instr = `JP Z,${hex(addr)}`; break;
      case 0xD2: type = 'JUMP';  instr = `JP NC,${hex(addr)}`; break;
      case 0xDA: type = 'JUMP';  instr = `JP C,${hex(addr)}`; break;
      case 0xC4: type = 'CALL';  instr = `CALL NZ,${hex(addr)}`; break;
      case 0xCC: type = 'CALL';  instr = `CALL Z,${hex(addr)}`; break;
      case 0xD4: type = 'CALL';  instr = `CALL NC,${hex(addr)}`; break;
      case 0xDC: type = 'CALL';  instr = `CALL C,${hex(addr)}`; break;
      case 0xE2: type = 'JUMP';  instr = `JP PO,${hex(addr)}`; break;
      case 0xEA: type = 'JUMP';  instr = `JP PE,${hex(addr)}`; break;
      case 0xF2: type = 'JUMP';  instr = `JP P,${hex(addr)}`; break;
      case 0xFA: type = 'JUMP';  instr = `JP M,${hex(addr)}`; break;
      case 0xE4: type = 'CALL';  instr = `CALL PO,${hex(addr)}`; break;
      case 0xEC: type = 'CALL';  instr = `CALL PE,${hex(addr)}`; break;
      case 0xF4: type = 'CALL';  instr = `CALL P,${hex(addr)}`; break;
      case 0xFC: type = 'CALL';  instr = `CALL M,${hex(addr)}`; break;
      default:
        type = 'DATA/UNK';
        instr = `[byte before: ${hex(b1, 2)}] addr bytes at ${hex(dataOffset)}`;
        instrAddr = dataOffset;
        break;
    }
  }

  return { instrAddr, dataOffset, type, instr, addr };
}

/**
 * Minimal instruction-length estimator for context decoding.
 * Returns { len, asm } for the instruction starting at offset.
 */
function decodeAt(offset) {
  if (offset < 0 || offset >= ROM_SIZE) return { len: 1, asm: '???' };

  const b0 = rom[offset];
  const b1 = offset + 1 < ROM_SIZE ? rom[offset + 1] : 0;
  const b2 = offset + 2 < ROM_SIZE ? rom[offset + 2] : 0;

  function imm24(o) {
    return rom[o] | (rom[o + 1] << 8) | (rom[o + 2] << 16);
  }

  // DD prefix (IX instructions)
  if (b0 === 0xDD) {
    if (b1 === 0xED) {
      const addr24 = imm24(offset + 3);
      const regMap = { 0x4B: 'BC', 0x5B: 'DE', 0x6B: 'IX', 0x7B: 'SP',
                       0x43: 'BC', 0x53: 'DE', 0x63: 'IX', 0x73: 'SP' };
      const isLoad = [0x4B, 0x5B, 0x6B, 0x7B].includes(b2);
      const isStore = [0x43, 0x53, 0x63, 0x73].includes(b2);
      if (isLoad) return { len: 6, asm: `LD.LIL ${regMap[b2]},(${hex(addr24)})` };
      if (isStore) return { len: 6, asm: `LD.LIL (${hex(addr24)}),${regMap[b2]}` };
      return { len: 6, asm: `DD ED ${hex(b2, 2)} ...` };
    }
    if (b1 === 0x21) return { len: 5, asm: `LD IX,${hex(imm24(offset + 2))}` };
    if (b1 === 0x22) return { len: 5, asm: `LD (${hex(imm24(offset + 2))}),IX` };
    if (b1 === 0x2A) return { len: 5, asm: `LD IX,(${hex(imm24(offset + 2))})` };
    if (b1 === 0xE5) return { len: 2, asm: 'PUSH IX' };
    if (b1 === 0xE1) return { len: 2, asm: 'POP IX' };
    if (b1 === 0xE9) return { len: 2, asm: 'JP (IX)' };
    return { len: 2, asm: `DD ${hex(b1, 2)}` };
  }

  // FD prefix (IY instructions)
  if (b0 === 0xFD) {
    if (b1 === 0xED) {
      const addr24 = imm24(offset + 3);
      const regMap = { 0x4B: 'BC', 0x5B: 'DE', 0x6B: 'IY', 0x7B: 'SP',
                       0x43: 'BC', 0x53: 'DE', 0x63: 'IY', 0x73: 'SP' };
      const isLoad = [0x4B, 0x5B, 0x6B, 0x7B].includes(b2);
      const isStore = [0x43, 0x53, 0x63, 0x73].includes(b2);
      if (isLoad) return { len: 6, asm: `LD.LIL ${regMap[b2]},(${hex(addr24)})` };
      if (isStore) return { len: 6, asm: `LD.LIL (${hex(addr24)}),${regMap[b2]}` };
      return { len: 6, asm: `FD ED ${hex(b2, 2)} ...` };
    }
    if (b1 === 0x21) return { len: 5, asm: `LD IY,${hex(imm24(offset + 2))}` };
    if (b1 === 0x22) return { len: 5, asm: `LD (${hex(imm24(offset + 2))}),IY` };
    if (b1 === 0x2A) return { len: 5, asm: `LD IY,(${hex(imm24(offset + 2))})` };
    if (b1 === 0xE5) return { len: 2, asm: 'PUSH IY' };
    if (b1 === 0xE1) return { len: 2, asm: 'POP IY' };
    if (b1 === 0xE9) return { len: 2, asm: 'JP (IY)' };
    return { len: 2, asm: `FD ${hex(b1, 2)}` };
  }

  // ED prefix
  if (b0 === 0xED) {
    const edLoads = { 0x4B: 'BC', 0x5B: 'DE', 0x6B: 'HL', 0x7B: 'SP' };
    const edStores = { 0x43: 'BC', 0x53: 'DE', 0x63: 'HL', 0x73: 'SP' };
    if (edLoads[b1]) return { len: 5, asm: `LD ${edLoads[b1]},(${hex(imm24(offset + 2))})` };
    if (edStores[b1]) return { len: 5, asm: `LD (${hex(imm24(offset + 2))}),${edStores[b1]}` };
    if (b1 === 0xB0) return { len: 2, asm: 'LDIR' };
    if (b1 === 0xB8) return { len: 2, asm: 'LDDR' };
    if (b1 === 0xB1) return { len: 2, asm: 'CPIR' };
    if (b1 === 0xB9) return { len: 2, asm: 'CPDR' };
    if (b1 === 0xA0) return { len: 2, asm: 'LDI' };
    if (b1 === 0xA8) return { len: 2, asm: 'LDD' };
    return { len: 2, asm: `ED ${hex(b1, 2)}` };
  }

  // CB prefix (bit ops)
  if (b0 === 0xCB) return { len: 2, asm: `CB ${hex(b1, 2)}` };

  // Unprefixed instructions with 24-bit immediate
  const imm24ops = {
    0x01: 'LD BC,', 0x11: 'LD DE,', 0x21: 'LD HL,', 0x31: 'LD SP,',
    0x22: 'LD (', 0x2A: 'LD HL,(',
    0x32: 'LD (', 0x3A: 'LD A,(',
    0xC3: 'JP ', 0xCD: 'CALL ',
    0xC2: 'JP NZ,', 0xCA: 'JP Z,', 0xD2: 'JP NC,', 0xDA: 'JP C,',
    0xC4: 'CALL NZ,', 0xCC: 'CALL Z,', 0xD4: 'CALL NC,', 0xDC: 'CALL C,',
    0xE2: 'JP PO,', 0xEA: 'JP PE,', 0xF2: 'JP P,', 0xFA: 'JP M,',
    0xE4: 'CALL PO,', 0xEC: 'CALL PE,', 0xF4: 'CALL P,', 0xFC: 'CALL M,',
  };
  if (imm24ops[b0]) {
    const addr24 = imm24(offset + 1);
    let asm = imm24ops[b0] + hex(addr24);
    if (b0 === 0x22) asm = `LD (${hex(addr24)}),HL`;
    if (b0 === 0x2A) asm = `LD HL,(${hex(addr24)})`;
    if (b0 === 0x32) asm = `LD (${hex(addr24)}),A`;
    if (b0 === 0x3A) asm = `LD A,(${hex(addr24)})`;
    return { len: 4, asm };
  }

  // 8-bit immediate
  const imm8ops = {
    0x06: 'LD B,', 0x0E: 'LD C,', 0x16: 'LD D,', 0x1E: 'LD E,',
    0x26: 'LD H,', 0x2E: 'LD L,', 0x36: 'LD (HL),', 0x3E: 'LD A,',
    0xC6: 'ADD A,', 0xCE: 'ADC A,', 0xD6: 'SUB ', 0xDE: 'SBC A,',
    0xE6: 'AND ', 0xEE: 'XOR ', 0xF6: 'OR ', 0xFE: 'CP ',
    0xDB: 'IN A,(', 0xD3: 'OUT (',
  };
  if (imm8ops[b0]) {
    const v = b1;
    let asm = imm8ops[b0] + hex(v, 2);
    if (b0 === 0xDB) asm = `IN A,(${hex(v, 2)})`;
    if (b0 === 0xD3) asm = `OUT (${hex(v, 2)}),A`;
    return { len: 2, asm };
  }

  // Relative jumps (2 bytes)
  if (b0 === 0x18) return { len: 2, asm: `JR ${hex(offset + 2 + ((b1 << 24) >> 24))}` };
  if (b0 === 0x20) return { len: 2, asm: `JR NZ,${hex(offset + 2 + ((b1 << 24) >> 24))}` };
  if (b0 === 0x28) return { len: 2, asm: `JR Z,${hex(offset + 2 + ((b1 << 24) >> 24))}` };
  if (b0 === 0x30) return { len: 2, asm: `JR NC,${hex(offset + 2 + ((b1 << 24) >> 24))}` };
  if (b0 === 0x38) return { len: 2, asm: `JR C,${hex(offset + 2 + ((b1 << 24) >> 24))}` };
  if (b0 === 0x10) return { len: 2, asm: `DJNZ ${hex(offset + 2 + ((b1 << 24) >> 24))}` };

  // RST
  if ((b0 & 0xC7) === 0xC7) return { len: 1, asm: `RST ${hex(b0 & 0x38, 2)}` };

  // Simple 1-byte instructions
  const simple = {
    0x00: 'NOP', 0x76: 'HALT', 0xC9: 'RET', 0xF3: 'DI', 0xFB: 'EI',
    0x07: 'RLCA', 0x0F: 'RRCA', 0x17: 'RLA', 0x1F: 'RRA',
    0x27: 'DAA', 0x2F: 'CPL', 0x37: 'SCF', 0x3F: 'CCF',
    0xC0: 'RET NZ', 0xC8: 'RET Z', 0xD0: 'RET NC', 0xD8: 'RET C',
    0xE0: 'RET PO', 0xE8: 'RET PE', 0xF0: 'RET P', 0xF8: 'RET M',
    0xC5: 'PUSH BC', 0xD5: 'PUSH DE', 0xE5: 'PUSH HL', 0xF5: 'PUSH AF',
    0xC1: 'POP BC', 0xD1: 'POP DE', 0xE1: 'POP HL', 0xF1: 'POP AF',
    0xE9: 'JP (HL)', 0xF9: 'LD SP,HL', 0xEB: 'EX DE,HL',
    0x02: 'LD (BC),A', 0x0A: 'LD A,(BC)', 0x12: 'LD (DE),A', 0x1A: 'LD A,(DE)',
    0x03: 'INC BC', 0x13: 'INC DE', 0x23: 'INC HL', 0x33: 'INC SP',
    0x0B: 'DEC BC', 0x1B: 'DEC DE', 0x2B: 'DEC HL', 0x3B: 'DEC SP',
    0x04: 'INC B', 0x0C: 'INC C', 0x14: 'INC D', 0x1C: 'INC E',
    0x24: 'INC H', 0x2C: 'INC L', 0x34: 'INC (HL)', 0x3C: 'INC A',
    0x05: 'DEC B', 0x0D: 'DEC C', 0x15: 'DEC D', 0x1D: 'DEC E',
    0x25: 'DEC H', 0x2D: 'DEC L', 0x35: 'DEC (HL)', 0x3D: 'DEC A',
    0x09: 'ADD HL,BC', 0x19: 'ADD HL,DE', 0x29: 'ADD HL,HL', 0x39: 'ADD HL,SP',
    0xD9: 'EXX', 0x08: "EX AF,AF'",
  };
  if (simple[b0]) return { len: 1, asm: simple[b0] };

  // LD r,r' range 0x40-0x7F (except HALT=0x76)
  if (b0 >= 0x40 && b0 <= 0x7F) {
    const regs = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
    const dst = regs[(b0 >> 3) & 7];
    const src = regs[b0 & 7];
    return { len: 1, asm: `LD ${dst},${src}` };
  }

  // ALU r range 0x80-0xBF
  if (b0 >= 0x80 && b0 <= 0xBF) {
    const ops = ['ADD A,', 'ADC A,', 'SUB ', 'SBC A,', 'AND ', 'XOR ', 'OR ', 'CP '];
    const regs = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
    return { len: 1, asm: ops[(b0 >> 3) & 7] + regs[b0 & 7] };
  }

  return { len: 1, asm: `DB ${hex(b0, 2)}` };
}

/**
 * Decode N instructions backward from offset (best effort).
 * Tries multiple start points to find a chain that lands exactly at offset.
 */
function decodeContextBefore(offset, count) {
  for (let startGuess = offset - count * 6; startGuess < offset; startGuess++) {
    if (startGuess < 0) continue;
    const chain = [];
    let pc = startGuess;
    while (pc < offset) {
      const d = decodeAt(pc);
      chain.push({ addr: pc, ...d });
      pc += d.len;
    }
    if (pc === offset && chain.length >= count) {
      return chain.slice(-count);
    }
  }
  return [];
}

function decodeContextAfter(offset, count) {
  const results = [];
  let pc = offset;
  for (let i = 0; i < count && pc < ROM_SIZE; i++) {
    const d = decodeAt(pc);
    results.push({ addr: pc, ...d });
    pc += d.len;
  }
  return results;
}

// ── Main scan ──

console.log('=== D01D0B Reference Scanner ===');
console.log(`ROM size: ${hex(ROM_SIZE)} (${ROM_SIZE} bytes)`);
console.log('');

// Scan target address
console.log(`== References to ${hex(TARGET)} ==`);
const targetRefs = scanAddress(TARGET);
console.log(`Found ${targetRefs.length} references:\n`);

const typeCounts = {};
const regionMap = new Map();

for (const ref of targetRefs) {
  const regionBase = ref.instrAddr & 0xFFF000;
  const regionKey = hex(regionBase);
  regionMap.set(regionKey, (regionMap.get(regionKey) || 0) + 1);
  typeCounts[ref.type] = (typeCounts[ref.type] || 0) + 1;

  // Print context before
  const before = decodeContextBefore(ref.instrAddr, 2);
  for (const ctx of before) {
    console.log(`    ${hex(ctx.addr)}  .         ${ctx.asm}`);
  }

  // Print the reference instruction itself
  console.log(`  > ${hex(ref.instrAddr)}  ${ref.type.padEnd(8)}  ${ref.instr}`);

  // Print context after (skip past the reference instruction)
  const refInstr = decodeAt(ref.instrAddr);
  const after = decodeContextAfter(ref.instrAddr + refInstr.len, 2);
  for (const ctx of after) {
    console.log(`    ${hex(ctx.addr)}  .         ${ctx.asm}`);
  }
  console.log('');
}

console.log('== Type summary ==');
for (const [t, c] of Object.entries(typeCounts).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${t.padEnd(10)} ${c}`);
}

console.log('');
console.log('== ROM region distribution ==');
for (const [region, count] of [...regionMap.entries()].sort()) {
  console.log(`  ${region}  ${count} ref(s)`);
}

// Scan boundary addresses
console.log('');
console.log('== Boundary addresses ==');
for (const bAddr of BOUNDARY_ADDRS) {
  const refs = scanAddress(bAddr);
  const reads = refs.filter(r => r.type === 'READ').length;
  const writes = refs.filter(r => r.type === 'WRITE').length;
  const addrs = refs.filter(r => r.type === 'ADDR').length;
  const other = refs.length - reads - writes - addrs;
  console.log(`  ${hex(bAddr)}: ${refs.length} refs (${reads}R/${writes}W/${addrs}A${other ? '/' + other + 'other' : ''})`);
  for (const ref of refs) {
    console.log(`    ${hex(ref.instrAddr)}  ${ref.type.padEnd(8)}  ${ref.instr}`);
  }
}

// Also scan D01D0C for cross-reference with session 588
console.log('');
console.log('== Cross-ref: D01D0C (from session 588) ==');
const d0cRefs = scanAddress(0xD01D0C);
console.log(`  D01D0C: ${d0cRefs.length} refs`);

// Hypothesis
console.log('');
console.log('== Hypothesis ==');
const reads = typeCounts['READ'] || 0;
const writes = typeCounts['WRITE'] || 0;
const addrs = typeCounts['ADDR'] || 0;

if (reads > 0 && writes > 0) {
  console.log(`D01D0B has ${reads} reads and ${writes} writes -- actively maintained RAM variable.`);
} else if (reads > 0 && writes === 0) {
  console.log(`D01D0B has ${reads} reads but 0 direct writes -- may be written indirectly (LDIR/block copy) or via pointer.`);
} else if (writes > 0 && reads === 0) {
  console.log(`D01D0B has 0 reads but ${writes} writes -- write-only (flag/signal?).`);
} else {
  console.log(`D01D0B has 0 direct reads and 0 direct writes -- may only appear as address loads or data.`);
}

if (addrs > 0) {
  console.log(`${addrs} address loads suggest it may be used as a pointer target or in block operations.`);
}

const regions = [...regionMap.keys()].sort();
if (regions.length === 0) {
  console.log('No instruction references found -- byte pattern may only appear in data or not at all.');
} else if (regions.length <= 3) {
  console.log(`References concentrated in ${regions.length} region(s): ${regions.join(', ')} -- likely single-subsystem variable.`);
} else {
  console.log(`References spread across ${regions.length} regions -- widely-used OS variable.`);
}

console.log('');
console.log('Session 588 established D01D0C as a single-byte counter paired with D01D0B.');
console.log('D01D0B is expected to be a closely related byte (same structure, adjacent field).');
console.log('If D01D0A has 0 refs and D01D0D also has few/0, then D01D0B-D01D0C is a 2-byte pair.');
console.log('If D01D0A has refs too, the structure may extend downward.');

console.log('');
console.log('PASS: scan complete');
process.exit(0);
