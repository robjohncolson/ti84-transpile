import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const rom = fs.readFileSync(ROM_PATH);

const START = 0x09953f;
const MAIN_LIMIT = 0x400;
const SUB_LIMIT = 0x80;
const RAM_BASE = 0xd00000;

const ccRet = new Map([
  [0xc0, 'RET NZ'],
  [0xc8, 'RET Z'],
  [0xd0, 'RET NC'],
  [0xd8, 'RET C'],
  [0xe0, 'RET PO'],
  [0xe8, 'RET PE'],
  [0xf0, 'RET P'],
  [0xf8, 'RET M'],
]);

const regs = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
const rp = ['BC', 'DE', 'HL', 'SP'];
const rp2 = ['BC', 'DE', 'HL', 'AF'];
const alu = ['ADD A,', 'ADC A,', 'SUB', 'SBC A,', 'AND', 'XOR', 'OR', 'CP'];
const cbOps = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'];
const conditions = ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'];

const summary = {
  calls: new Set(),
  jps: new Set(),
  ramReads: new Set(),
  ramWrites: new Set(),
  flagOps: [],
  ixFrame: [],
};

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function byteAt(addr) {
  return rom[addr] ?? 0;
}

function word24(addr) {
  return byteAt(addr) | (byteAt(addr + 1) << 8) | (byteAt(addr + 2) << 16);
}

function rel8(value) {
  return value & 0x80 ? value - 0x100 : value;
}

function signedDisp(value) {
  const n = rel8(value);
  return n < 0 ? `${n}` : `+${n}`;
}

function addRamRead(addr) {
  if (addr >= RAM_BASE) summary.ramReads.add(addr);
}

function addRamWrite(addr) {
  if (addr >= RAM_BASE) summary.ramWrites.add(addr);
}

function noteFlag(addr, text) {
  summary.flagOps.push(`${hex(addr)} ${text}`);
}

function isFlagOp(mnemonic) {
  return /\b(CP|OR|AND|XOR|BIT|SCF|CCF|ADC|SBC|ADD|SUB|INC|DEC)\b/.test(mnemonic);
}

function decodeCb(addr, prefix, disp) {
  const opAddr = prefix ? addr + 3 : addr + 1;
  const op = byteAt(opAddr);
  const x = op >> 6;
  const y = (op >> 3) & 7;
  const z = op & 7;
  const target = prefix ? `(${prefix}${signedDisp(disp)})` : regs[z];
  let mnemonic;

  if (x === 0) mnemonic = `${cbOps[y]} ${target}`;
  else if (x === 1) mnemonic = `BIT ${y},${target}`;
  else if (x === 2) mnemonic = `RES ${y},${target}`;
  else mnemonic = `SET ${y},${target}`;

  if (prefix && z !== 6) mnemonic += `,${regs[z]}`;
  if (mnemonic.startsWith('BIT ')) noteFlag(addr, mnemonic);
  return { size: prefix ? 4 : 2, mnemonic };
}

function prefixedReg(prefix, r, disp) {
  if (r === 4) return `${prefix}H`;
  if (r === 5) return `${prefix}L`;
  if (r === 6) return `(${prefix}${signedDisp(disp)})`;
  return regs[r];
}

function decodeEd(addr) {
  const op = byteAt(addr + 1);
  const op2 = byteAt(addr + 2);
  const op3 = byteAt(addr + 3);
  const op4 = byteAt(addr + 4);
  const nn = op2 | (op3 << 8) | (op4 << 16);
  const r = (op >> 3) & 7;
  const p = (op >> 4) & 3;

  const fixed = new Map([
    [0x44, 'NEG'],
    [0x45, 'RETN'],
    [0x46, 'IM 0'],
    [0x47, 'LD I,A'],
    [0x4d, 'RETI'],
    [0x4f, 'LD R,A'],
    [0x56, 'IM 1'],
    [0x57, 'LD A,I'],
    [0x5e, 'IM 2'],
    [0x5f, 'LD A,R'],
    [0x67, 'RRD'],
    [0x6f, 'RLD'],
    [0xa0, 'LDI'],
    [0xa1, 'CPI'],
    [0xa2, 'INI'],
    [0xa3, 'OUTI'],
    [0xa8, 'LDD'],
    [0xa9, 'CPD'],
    [0xaa, 'IND'],
    [0xab, 'OUTD'],
    [0xb0, 'LDIR'],
    [0xb1, 'CPIR'],
    [0xb2, 'INIR'],
    [0xb3, 'OTIR'],
    [0xb8, 'LDDR'],
    [0xb9, 'CPDR'],
    [0xba, 'INDR'],
    [0xbb, 'OTDR'],
  ]);

  if (fixed.has(op)) return { size: 2, mnemonic: fixed.get(op) };
  if ((op & 0xc7) === 0x40) return { size: 2, mnemonic: `IN ${regs[r]},(C)` };
  if ((op & 0xc7) === 0x41) return { size: 2, mnemonic: `OUT (C),${regs[r]}` };
  if ((op & 0xcf) === 0x42) return { size: 2, mnemonic: `SBC HL,${rp[p]}` };
  if ((op & 0xcf) === 0x4a) return { size: 2, mnemonic: `ADC HL,${rp[p]}` };
  if ((op & 0xcf) === 0x43) {
    addRamWrite(nn);
    return { size: 5, mnemonic: `LD (${hex(nn)}),${rp[p]}` };
  }
  if ((op & 0xcf) === 0x4b) {
    addRamRead(nn);
    return { size: 5, mnemonic: `LD ${rp[p]},(${hex(nn)})` };
  }

  return { size: 2, mnemonic: `ED ${hex(op, 2)}` };
}

function decodeBase(addr, prefix = null, sis = false) {
  const base = prefix ? addr + 1 : addr;
  const op = byteAt(base);
  const ixiy = prefix;
  const regName = ixiy ?? 'HL';
  const sizePrefix = prefix ? 1 : 0;

  if (op === 0xcb && ixiy) return decodeCb(addr, ixiy, byteAt(base + 1));
  if (op === 0xcb) return decodeCb(addr, null, 0);
  if (op === 0xed) {
    const decoded = decodeEd(base);
    return { ...decoded, size: decoded.size + sizePrefix, mnemonic: `${prefix ? `${prefix}:` : ''}${decoded.mnemonic}` };
  }

  if (op === 0x00) return { size: 1 + sizePrefix, mnemonic: 'NOP' };
  if (op === 0x07) return { size: 1 + sizePrefix, mnemonic: 'RLCA' };
  if (op === 0x0f) return { size: 1 + sizePrefix, mnemonic: 'RRCA' };
  if (op === 0x17) return { size: 1 + sizePrefix, mnemonic: 'RLA' };
  if (op === 0x1f) return { size: 1 + sizePrefix, mnemonic: 'RRA' };
  if (op === 0x27) return { size: 1 + sizePrefix, mnemonic: 'DAA' };
  if (op === 0x2f) return { size: 1 + sizePrefix, mnemonic: 'CPL' };
  if (op === 0x37) return { size: 1 + sizePrefix, mnemonic: 'SCF' };
  if (op === 0x3f) return { size: 1 + sizePrefix, mnemonic: 'CCF' };
  if (op === 0x76) return { size: 1 + sizePrefix, mnemonic: 'HALT' };
  if (op === 0xc9) return { size: 1 + sizePrefix, mnemonic: 'RET', terminates: true };
  if (ccRet.has(op)) return { size: 1 + sizePrefix, mnemonic: ccRet.get(op), conditionalReturn: true };

  if ((op & 0xc7) === 0x04) return { size: 1 + sizePrefix, mnemonic: `INC ${prefixedReg(ixiy, (op >> 3) & 7, byteAt(base + 1))}` };
  if ((op & 0xc7) === 0x05) return { size: 1 + sizePrefix, mnemonic: `DEC ${prefixedReg(ixiy, (op >> 3) & 7, byteAt(base + 1))}` };
  if ((op & 0xc7) === 0x06) {
    const r = (op >> 3) & 7;
    const hasDisp = ixiy && r === 6;
    return { size: (hasDisp ? 3 : 2) + sizePrefix, mnemonic: `LD ${prefixedReg(ixiy, r, byteAt(base + 1))},${hex(byteAt(base + (hasDisp ? 2 : 1)), 2)}` };
  }

  if ((op & 0xcf) === 0x01) {
    const p = (op >> 4) & 3;
    const rr = ixiy && p === 2 ? ixiy : rp[p];
    return { size: 4 + sizePrefix, mnemonic: `LD ${rr},${hex(word24(base + 1))}` };
  }
  if ((op & 0xcf) === 0x03) return { size: 1 + sizePrefix, mnemonic: `INC ${ixiy && ((op >> 4) & 3) === 2 ? ixiy : rp[(op >> 4) & 3]}` };
  if ((op & 0xcf) === 0x0b) return { size: 1 + sizePrefix, mnemonic: `DEC ${ixiy && ((op >> 4) & 3) === 2 ? ixiy : rp[(op >> 4) & 3]}` };
  if ((op & 0xcf) === 0x09) return { size: 1 + sizePrefix, mnemonic: `ADD ${regName},${ixiy && ((op >> 4) & 3) === 2 ? ixiy : rp[(op >> 4) & 3]}` };
  if ((op & 0xcf) === 0xc5) return { size: 1 + sizePrefix, mnemonic: `PUSH ${ixiy && ((op >> 4) & 3) === 2 ? ixiy : rp2[(op >> 4) & 3]}` };
  if ((op & 0xcf) === 0xc1) return { size: 1 + sizePrefix, mnemonic: `POP ${ixiy && ((op >> 4) & 3) === 2 ? ixiy : rp2[(op >> 4) & 3]}` };

  if ((op & 0xc0) === 0x40) {
    const dst = (op >> 3) & 7;
    const src = op & 7;
    const usesDisp = ixiy && (dst === 6 || src === 6);
    const disp = byteAt(base + 1);
    const dstText = prefixedReg(ixiy, dst, disp);
    const srcText = prefixedReg(ixiy, src, disp);
    if (usesDisp) summary.ixFrame.push(`${hex(addr)} LD ${dstText},${srcText}`);
    return { size: (usesDisp ? 2 : 1) + sizePrefix, mnemonic: `LD ${dstText},${srcText}` };
  }

  if ((op & 0xc0) === 0x80) {
    const source = prefixedReg(ixiy, op & 7, byteAt(base + 1));
    const usesDisp = ixiy && (op & 7) === 6;
    return { size: (usesDisp ? 2 : 1) + sizePrefix, mnemonic: `${alu[(op >> 3) & 7]} ${source}` };
  }

  if (op === 0x18 || op === 0x20 || op === 0x28 || op === 0x30 || op === 0x38) {
    const names = { 0x18: 'JR', 0x20: 'JR NZ', 0x28: 'JR Z', 0x30: 'JR NC', 0x38: 'JR C' };
    const target = base + 2 + rel8(byteAt(base + 1));
    summary.jps.add(target);
    return { size: 2 + sizePrefix, mnemonic: `${names[op]} ${hex(target)}`, branchTarget: target, terminates: op === 0x18 };
  }

  if (op === 0xc3) {
    const target = word24(base + 1);
    summary.jps.add(target);
    return { size: 4 + sizePrefix, mnemonic: `JP ${hex(target)}`, branchTarget: target, terminates: true };
  }
  if ((op & 0xc7) === 0xc2) {
    const target = word24(base + 1);
    summary.jps.add(target);
    return { size: 4 + sizePrefix, mnemonic: `JP ${conditions[(op >> 3) & 7]},${hex(target)}`, branchTarget: target };
  }
  if (op === 0xcd) {
    const target = word24(base + 1);
    summary.calls.add(target);
    return { size: 4 + sizePrefix, mnemonic: `CALL ${hex(target)}`, callTarget: target };
  }
  if ((op & 0xc7) === 0xc4) {
    const target = word24(base + 1);
    summary.calls.add(target);
    return { size: 4 + sizePrefix, mnemonic: `CALL ${conditions[(op >> 3) & 7]},${hex(target)}`, callTarget: target };
  }

  if (op === 0x01 || op === 0x11 || op === 0x21 || op === 0x31) return { size: 4 + sizePrefix, mnemonic: `LD ${op === 0x21 && ixiy ? ixiy : rp[op >> 4]},${hex(word24(base + 1))}` };
  if (op === 0x22) {
    const target = word24(base + 1);
    addRamWrite(target);
    return { size: 4 + sizePrefix, mnemonic: `LD (${hex(target)}),${regName}` };
  }
  if (op === 0x2a) {
    const target = word24(base + 1);
    addRamRead(target);
    return { size: 4 + sizePrefix, mnemonic: `LD ${regName},(${hex(target)})` };
  }
  if (op === 0x32) {
    const target = word24(base + 1);
    addRamWrite(target);
    return { size: 4 + sizePrefix, mnemonic: `LD (${hex(target)}),A` };
  }
  if (op === 0x3a) {
    const target = word24(base + 1);
    addRamRead(target);
    return { size: 4 + sizePrefix, mnemonic: `LD A,(${hex(target)})` };
  }
  if (op === 0xe9) return { size: 1 + sizePrefix, mnemonic: `JP (${regName})`, terminates: true };
  if (op === 0xf9) return { size: 1 + sizePrefix, mnemonic: `LD SP,${regName}` };
  if ((op & 0xc7) === 0xc6) return { size: 2 + sizePrefix, mnemonic: `${alu[(op >> 3) & 7]} ${hex(byteAt(base + 1), 2)}` };
  if (op === 0xd3) return { size: 2 + sizePrefix, mnemonic: `OUT (${hex(byteAt(base + 1), 2)}),A` };
  if (op === 0xdb) return { size: 2 + sizePrefix, mnemonic: `IN A,(${hex(byteAt(base + 1), 2)})` };

  return { size: 1 + sizePrefix, mnemonic: `${sis ? '.SIS ' : ''}DB ${hex(op, 2)}` };
}

function decode(addr) {
  const op = byteAt(addr);
  if (op === 0x40) {
    const next = decodeBase(addr + 1, null, true);
    return { ...next, size: next.size + 1, mnemonic: `.SIS ${next.mnemonic}` };
  }
  if (op === 0xdd || op === 0xfd) return decodeBase(addr, op === 0xdd ? 'IX' : 'IY');
  return decodeBase(addr);
}

function disassemble(start, limit, label) {
  const lines = [];
  const end = Math.min(start + limit, rom.length);
  let pc = start;

  while (pc < end) {
    const d = decode(pc);
    const bytes = Array.from({ length: d.size }, (_, i) => hex(byteAt(pc + i), 2).slice(2)).join(' ');
    const line = `${hex(pc)}  ${bytes.padEnd(14)} ${d.mnemonic}`;
    lines.push(line);

    if (isFlagOp(d.mnemonic)) noteFlag(pc, d.mnemonic);
    pc += Math.max(d.size, 1);
    if (d.terminates) break;
  }

  console.log(`\n=== ${label} ${hex(start)}..${hex(pc)} ===`);
  console.log(lines.join('\n'));
}

console.log('phase525 decode 0x09953F conditional test after FP save');
console.log(`ROM: ${ROM_PATH}`);
console.log(`size: ${rom.length} bytes`);

disassemble(START, MAIN_LIMIT, 'main');

const subCalls = [...summary.calls].filter((addr) => addr !== START).sort((a, b) => a - b);
for (const target of subCalls) {
  if (target >= 0 && target < rom.length) disassemble(target, SUB_LIMIT, 'sub-call');
}

console.log('\n=== summary ===');
console.log(`CALL targets: ${[...summary.calls].sort((a, b) => a - b).map((v) => hex(v)).join(', ') || '(none)'}`);
console.log(`JP/JR targets: ${[...summary.jps].sort((a, b) => a - b).map((v) => hex(v)).join(', ') || '(none)'}`);
console.log(`RAM reads >= ${hex(RAM_BASE)}: ${[...summary.ramReads].sort((a, b) => a - b).map((v) => hex(v)).join(', ') || '(none)'}`);
console.log(`RAM writes >= ${hex(RAM_BASE)}: ${[...summary.ramWrites].sort((a, b) => a - b).map((v) => hex(v)).join(', ') || '(none)'}`);
console.log(`IX/IY frame accesses: ${summary.ixFrame.length ? summary.ixFrame.join('; ') : '(none)'}`);
console.log(`carry/zero relevant ops: ${summary.flagOps.length ? summary.flagOps.join('; ') : '(none)'}`);
