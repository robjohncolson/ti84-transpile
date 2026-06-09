import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const romPath = path.join(__dirname, 'ROM.rom');
const rom = fs.readFileSync(romPath);

const START = 0x07F98B;
const MAX_BYTES = 128;

const knownRam = new Map([
  [0xD005F8, 'primaryDescriptorBuffer'],
  [0xD00603, 'shadowDescriptorBuffer'],
  [0xD005F9, 'descriptorType'],
  [0xD0063A, 'secondaryShadowBuffer'],
  [0xD008E0, 'setjmpSP'],
  [0xD0117F, 'typeDescriptorTable'],
  [0xD02590, 'vatPointer0'],
  [0xD02593, 'vatPointer1'],
  [0xD0258A, 'vatPointer2'],
  [0xD0258D, 'vatPointer3'],
  [0xD0259A, 'vatPointer4'],
  [0xD0259D, 'vatPointer5'],
]);

const ramRefs = new Map();
const branchTargets = [];
const iyRefs = [];

function u8(addr) {
  return rom[addr] ?? 0;
}

function u16(addr) {
  return u8(addr) | (u8(addr + 1) << 8);
}

function u24(addr) {
  return u8(addr) | (u8(addr + 1) << 8) | (u8(addr + 2) << 16);
}

function s8(value) {
  return value & 0x80 ? value - 0x100 : value;
}

function hex(value, width) {
  return value.toString(16).toUpperCase().padStart(width, '0');
}

function fmtAddr(value) {
  return `0x${hex(value, 6)}`;
}

function fmtByte(value) {
  return hex(value, 2);
}

function fmtBytes(addr, len) {
  return Array.from({ length: len }, (_, i) => fmtByte(u8(addr + i))).join(' ');
}

function annotateAddr(value) {
  const name = knownRam.get(value);
  return name ? `${fmtAddr(value)} ; ${name}` : fmtAddr(value);
}

function recordRam(value, at, op) {
  if ((value & 0xFF0000) !== 0xD00000) return;
  if (!ramRefs.has(value)) {
    ramRefs.set(value, { name: knownRam.get(value) ?? null, refs: [] });
  }
  ramRefs.get(value).refs.push({ at, op });
}

function recordTarget(kind, from, target) {
  branchTargets.push({ kind, from, target });
}

function recordIy(at, desc) {
  iyRefs.push({ at, desc });
}

const r8 = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
const rp = ['BC', 'DE', 'HL', 'SP'];
const rp2 = ['BC', 'DE', 'HL', 'AF'];
const cc = ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'];
const alu = ['ADD A,', 'ADC A,', 'SUB', 'SBC A,', 'AND', 'XOR', 'OR', 'CP'];
const rot = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'];

function decodeCB(addr, prefix = null, disp = null) {
  const opAddr = prefix ? addr + 3 : addr + 1;
  const op = u8(opAddr);
  const x = op >> 6;
  const y = (op >> 3) & 7;
  const z = op & 7;
  const target = prefix ? `(${prefix}${s8(disp) < 0 ? '-' : '+'}${hex(Math.abs(s8(disp)), 2)})` : r8[z];
  const len = prefix ? 4 : 2;

  if (prefix === 'IY') recordIy(addr, `CB ${fmtByte(disp)} ${fmtByte(op)} on ${target}`);

  if (x === 0) return { len, asm: `${rot[y]} ${target}` };
  if (x === 1) return { len, asm: `BIT ${y},${target}` };
  if (x === 2) return { len, asm: `RES ${y},${target}` };
  return { len, asm: `SET ${y},${target}` };
}

function decodeIndexed(addr, prefix) {
  const ix = prefix === 0xDD ? 'IX' : 'IY';
  const op = u8(addr + 1);
  const baseLen = 2;

  if (op === 0xCB) return decodeCB(addr, ix, u8(addr + 2));

  if (ix === 'IY') {
    const dOps = new Set([0x34, 0x35, 0x36, 0x46, 0x4E, 0x56, 0x5E, 0x66, 0x6E, 0x70, 0x71, 0x72, 0x73, 0x74, 0x75, 0x77, 0x7E, 0x86, 0x8E, 0x96, 0x9E, 0xA6, 0xAE, 0xB6, 0xBE]);
    if (dOps.has(op)) recordIy(addr, `indexed ${fmtByte(op)} displacement ${s8(u8(addr + 2))}`);
  }

  const d = s8(u8(addr + 2));
  const mem = `(${ix}${d < 0 ? '-' : '+'}${hex(Math.abs(d), 2)})`;
  const hi = op >> 6;
  const y = (op >> 3) & 7;
  const z = op & 7;
  const rr = ix;

  if (op === 0x21) return { len: 5, asm: `LD ${rr},${annotateAddr(u24(addr + 2))}` };
  if (op === 0x22) {
    const target = u24(addr + 2);
    recordRam(target, addr, `LD (${fmtAddr(target)}),${rr}`);
    return { len: 5, asm: `LD (${annotateAddr(target)}),${rr}` };
  }
  if (op === 0x2A) {
    const target = u24(addr + 2);
    recordRam(target, addr, `LD ${rr},(${fmtAddr(target)})`);
    return { len: 5, asm: `LD ${rr},(${annotateAddr(target)})` };
  }
  if (op === 0x23) return { len: baseLen, asm: `INC ${rr}` };
  if (op === 0x2B) return { len: baseLen, asm: `DEC ${rr}` };
  if (op === 0x34) return { len: 3, asm: `INC ${mem}` };
  if (op === 0x35) return { len: 3, asm: `DEC ${mem}` };
  if (op === 0x36) return { len: 4, asm: `LD ${mem},0x${fmtByte(u8(addr + 3))}` };
  if (op === 0xE1) return { len: baseLen, asm: `POP ${rr}` };
  if (op === 0xE3) return { len: baseLen, asm: `EX (SP),${rr}` };
  if (op === 0xE5) return { len: baseLen, asm: `PUSH ${rr}` };
  if (op === 0xE9) return { len: baseLen, asm: `JP (${rr})`, terminal: true };
  if (op === 0xF9) return { len: baseLen, asm: `LD SP,${rr}` };

  if (hi === 1 && op !== 0x76) {
    const dst = y === 6 ? mem : r8[y].replace('H', `${ix}H`).replace('L', `${ix}L`);
    const src = z === 6 ? mem : r8[z].replace('H', `${ix}H`).replace('L', `${ix}L`);
    const len = y === 6 || z === 6 ? 3 : 2;
    return { len, asm: `LD ${dst},${src}` };
  }
  if (hi === 2) {
    const src = z === 6 ? mem : r8[z].replace('H', `${ix}H`).replace('L', `${ix}L`);
    return { len: z === 6 ? 3 : 2, asm: `${alu[y]} ${src}`.replace(', ', ',') };
  }

  return { len: baseLen, asm: `${ix} prefix opcode 0x${fmtByte(op)}` };
}

function decodeED(addr) {
  const op = u8(addr + 1);
  const y = (op >> 3) & 7;
  const z = op & 7;
  const p = (op >> 4) & 3;
  const q = (op >> 3) & 1;

  if ((op & 0xC7) === 0x43) {
    const target = u24(addr + 2);
    recordRam(target, addr, q ? `LD ${rp[p]},(${fmtAddr(target)})` : `LD (${fmtAddr(target)}),${rp[p]}`);
    return { len: 5, asm: q ? `LD ${rp[p]},(${annotateAddr(target)})` : `LD (${annotateAddr(target)}),${rp[p]}` };
  }

  if (op >= 0x40 && op <= 0x7F) {
    if (z === 0) return { len: 2, asm: `IN ${r8[y]},(C)` };
    if (z === 1) return { len: 2, asm: `OUT (C),${r8[y]}` };
    if (z === 2) return { len: 2, asm: q ? `ADC HL,${rp[p]}` : `SBC HL,${rp[p]}` };
    if (z === 4) return { len: 2, asm: 'NEG' };
    if (z === 5) return { len: 2, asm: op === 0x4D ? 'RETI' : 'RETN', terminal: true };
    if (z === 6) return { len: 2, asm: `IM ${[0, 0, 1, 2, 0, 0, 1, 2][y]}` };
  }

  const block = new Map([
    [0xA0, 'LDI'], [0xA1, 'CPI'], [0xA2, 'INI'], [0xA3, 'OUTI'],
    [0xA8, 'LDD'], [0xA9, 'CPD'], [0xAA, 'IND'], [0xAB, 'OUTD'],
    [0xB0, 'LDIR'], [0xB1, 'CPIR'], [0xB2, 'INIR'], [0xB3, 'OTIR'],
    [0xB8, 'LDDR'], [0xB9, 'CPDR'], [0xBA, 'INDR'], [0xBB, 'OTDR'],
  ]);
  if (block.has(op)) return { len: 2, asm: block.get(op) };

  return { len: 2, asm: `ED 0x${fmtByte(op)}` };
}

function decode(addr) {
  const op = u8(addr);
  const x = op >> 6;
  const y = (op >> 3) & 7;
  const z = op & 7;
  const p = (op >> 4) & 3;
  const q = (op >> 3) & 1;

  if (op === 0xCB) return decodeCB(addr);
  if (op === 0xDD || op === 0xFD) return decodeIndexed(addr, op);
  if (op === 0xED) return decodeED(addr);

  if (x === 0) {
    if (z === 0) {
      if (y === 0) return { len: 1, asm: 'NOP' };
      if (y === 1) return { len: 4, asm: `EX AF,AF'` };
      if (y === 2) {
        const target = addr + 2 + s8(u8(addr + 1));
        return { len: 2, asm: `DJNZ ${fmtAddr(target)}` };
      }
      if (y === 3) {
        const target = addr + 2 + s8(u8(addr + 1));
        recordTarget('JR', addr, target);
        return { len: 2, asm: `JR ${fmtAddr(target)}`, terminal: true };
      }
      const target = addr + 2 + s8(u8(addr + 1));
      recordTarget(`JR ${cc[y - 4]}`, addr, target);
      return { len: 2, asm: `JR ${cc[y - 4]},${fmtAddr(target)}` };
    }
    if (z === 1) {
      if (q === 0) {
        const imm = u24(addr + 1);
        return { len: 4, asm: `LD ${rp[p]},${annotateAddr(imm)}` };
      }
      return { len: 1, asm: `ADD HL,${rp[p]}` };
    }
    if (z === 2) {
      if (p === 0 && q === 0) return { len: 1, asm: 'LD (BC),A' };
      if (p === 0 && q === 1) return { len: 1, asm: 'LD A,(BC)' };
      if (p === 1 && q === 0) return { len: 1, asm: 'LD (DE),A' };
      if (p === 1 && q === 1) return { len: 1, asm: 'LD A,(DE)' };
      const target = u24(addr + 1);
      recordRam(target, addr, q ? `LD HL,(${fmtAddr(target)})` : `LD (${fmtAddr(target)}),HL`);
      return { len: 4, asm: q ? `LD HL,(${annotateAddr(target)})` : `LD (${annotateAddr(target)}),HL` };
    }
    if (z === 3) return { len: 1, asm: `${q ? 'DEC' : 'INC'} ${rp[p]}` };
    if (z === 4) return { len: 1, asm: `INC ${r8[y]}` };
    if (z === 5) return { len: 1, asm: `DEC ${r8[y]}` };
    if (z === 6) return { len: 2, asm: `LD ${r8[y]},0x${fmtByte(u8(addr + 1))}` };
    return { len: 1, asm: ['RLCA', 'RRCA', 'RLA', 'RRA', 'DAA', 'CPL', 'SCF', 'CCF'][y] };
  }

  if (x === 1) {
    if (op === 0x76) return { len: 1, asm: 'HALT', terminal: true };
    return { len: 1, asm: `LD ${r8[y]},${r8[z]}` };
  }

  if (x === 2) return { len: 1, asm: `${alu[y]} ${r8[z]}`.replace(', ', ',') };

  if (z === 0) return { len: 1, asm: `RET ${cc[y]}`, terminal: false };
  if (z === 1) return q === 0 ? { len: 1, asm: `POP ${rp2[p]}` } : { len: 1, asm: ['RET', 'EXX', 'JP (HL)', 'LD SP,HL'][p], terminal: p === 0 || p === 2 };
  if (z === 2) {
    const target = u24(addr + 1);
    recordTarget(`JP ${cc[y]}`, addr, target);
    return { len: 4, asm: `JP ${cc[y]},${fmtAddr(target)}` };
  }
  if (z === 3) {
    if (y === 0) {
      const target = u24(addr + 1);
      recordTarget('JP', addr, target);
      return { len: 4, asm: `JP ${fmtAddr(target)}`, terminal: true };
    }
    if (y === 2) {
      const port = u8(addr + 1);
      return { len: 2, asm: `OUT (0x${fmtByte(port)}),A` };
    }
    if (y === 3) {
      const port = u8(addr + 1);
      return { len: 2, asm: `IN A,(0x${fmtByte(port)})` };
    }
    if (y === 4) return { len: 1, asm: 'EX (SP),HL' };
    if (y === 5) return { len: 1, asm: 'EX DE,HL' };
    if (y === 6) return { len: 1, asm: 'DI' };
    if (y === 7) return { len: 1, asm: 'EI' };
  }
  if (z === 4) {
    const target = u24(addr + 1);
    recordTarget(`CALL ${cc[y]}`, addr, target);
    return { len: 4, asm: `CALL ${cc[y]},${fmtAddr(target)}` };
  }
  if (z === 5) {
    if (q === 0) return { len: 1, asm: `PUSH ${rp2[p]}` };
    if (p === 0) {
      const target = u24(addr + 1);
      recordTarget('CALL', addr, target);
      return { len: 4, asm: `CALL ${fmtAddr(target)}` };
    }
  }
  if (z === 6) return { len: 2, asm: `${alu[y]} 0x${fmtByte(u8(addr + 1))}`.replace(', ', ',') };
  if (z === 7) return { len: 1, asm: ['RST 00h', 'RST 08h', 'RST 10h', 'RST 18h', 'RST 20h', 'RST 28h', 'RST 30h', 'RST 38h'][y] };

  return { len: 1, asm: `DB 0x${fmtByte(op)}` };
}

const insns = [];
let pc = START;
const endLimit = START + MAX_BYTES;
while (pc < endLimit) {
  const decoded = decode(pc);
  const len = decoded.len || 1;
  insns.push({ addr: pc, len, bytes: fmtBytes(pc, len), asm: decoded.asm, terminal: Boolean(decoded.terminal) });
  pc += len;
  if (decoded.terminal) break;
}

const end = insns.length ? insns[insns.length - 1].addr + insns[insns.length - 1].len - 1 : START;

console.log('Decode probe: ROM function 0x07F98B');
console.log(`ROM: ${romPath}`);
console.log('');
for (const insn of insns) {
  console.log(`${fmtAddr(insn.addr)}  ${insn.bytes.padEnd(14)}  ${insn.asm}`);
}

console.log('');
console.log('Summary');
console.log(`- Function boundary: ${fmtAddr(START)}..${fmtAddr(end)} (${pc - START} bytes decoded${pc >= endLimit ? ', max-byte limit reached' : ''})`);
console.log(`- Terminator: ${insns.length ? insns[insns.length - 1].asm : 'none'}`);

console.log('- RAM addresses referenced:');
if (ramRefs.size === 0) {
  console.log('  none found in decoded window');
} else {
  for (const [addr, info] of [...ramRefs.entries()].sort((a, b) => a[0] - b[0])) {
    const label = info.name ? `${fmtAddr(addr)} (${info.name})` : fmtAddr(addr);
    const refs = info.refs.map((ref) => `${fmtAddr(ref.at)} ${ref.op}`).join('; ');
    console.log(`  ${label}: ${refs}`);
  }
}

console.log('- CALL/JP/JR targets:');
if (branchTargets.length === 0) {
  console.log('  none found in decoded window');
} else {
  for (const target of branchTargets) {
    console.log(`  ${fmtAddr(target.from)} ${target.kind} -> ${fmtAddr(target.target)}`);
  }
}

console.log('- IY flag/index refs:');
if (iyRefs.length === 0) {
  console.log('  none found in decoded window');
} else {
  for (const ref of iyRefs) {
    console.log(`  ${fmtAddr(ref.at)} ${ref.desc}`);
  }
}

console.log('- Semantic purpose:');
console.log('  This static probe decodes the 0x07F98B routine called with HL=D00603, records direct RAM references,');
console.log('  branches, calls, and IY-indexed flag accesses, and provides evidence for whether the routine validates,');
console.log('  normalizes, copies, or dispatches from the shadow descriptor buffer during the 0x07FEFC resolver loop.');
