import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const START = 0x07FEFC;
const MAX_BYTES = 128;
const TITLE = 'probe-phase591-decode-07FEFC';

const rom = fs.readFileSync(ROM_PATH);

const RAM_NAMES = new Map([
  [0xD005F8, 'searchKey_typeBuf'],
  [0xD005F9, 'searchKey_type'],
  [0xD00603, 'shadowDescBuf'],
  [0xD0063A, 'searchPathRef'],
  [0xD0259A, 'descriptorShortcut'],
  [0xD02590, 'descriptorBase'],
]);

function hex(value, width = 2) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function signed8(value) {
  return value & 0x80 ? value - 0x100 : value;
}

function u8(addr) {
  return rom[addr] ?? 0;
}

function u16(addr) {
  return u8(addr) | (u8(addr + 1) << 8);
}

function u24(addr) {
  return u8(addr) | (u8(addr + 1) << 8) | (u8(addr + 2) << 16);
}

function annotateAddr(addr) {
  const name = RAM_NAMES.get(addr);
  return name ? `${hex(addr, 6)} ; ${name}` : hex(addr, 6);
}

const regs8 = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
const rp16 = ['BC', 'DE', 'HL', 'SP'];
const alu = ['ADD A,', 'ADC A,', 'SUB', 'SBC A,', 'AND', 'XOR', 'OR', 'CP'];
const cc = ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'];

function relTarget(addr, len, disp) {
  return (addr + len + signed8(disp)) & 0xFFFFFF;
}

function decodeCB(addr, prefix = '') {
  const op = u8(addr + 1);
  const x = op >> 6;
  const y = (op >> 3) & 7;
  const z = op & 7;
  const rot = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'];
  if (x === 0) return { len: 2, asm: `${rot[y]} ${prefix || regs8[z]}` };
  if (x === 1) return { len: 2, asm: `BIT ${y},${prefix || regs8[z]}` };
  if (x === 2) return { len: 2, asm: `RES ${y},${prefix || regs8[z]}` };
  return { len: 2, asm: `SET ${y},${prefix || regs8[z]}` };
}

function decodeED(addr) {
  const op = u8(addr + 1);
  const nn = u24(addr + 2);
  const nn16 = u16(addr + 2);

  if ((op & 0xC7) === 0x43) {
    const rp = rp16[(op >> 4) & 3];
    return { len: 5, asm: `LD (${annotateAddr(nn)}),${rp}`, mem: nn };
  }

  if ((op & 0xC7) === 0x4B) {
    const rp = rp16[(op >> 4) & 3];
    return { len: 5, asm: `LD ${rp},(${annotateAddr(nn)})`, mem: nn };
  }

  const table = new Map([
    [0x44, 'NEG'], [0x45, 'RETN'], [0x46, 'IM 0'], [0x47, 'LD I,A'],
    [0x4D, 'RETI'], [0x4F, 'LD R,A'], [0x56, 'IM 1'], [0x57, 'LD A,I'],
    [0x5E, 'IM 2'], [0x5F, 'LD A,R'], [0x67, 'RRD'], [0x6F, 'RLD'],
    [0xA0, 'LDI'], [0xA1, 'CPI'], [0xA2, 'INI'], [0xA3, 'OUTI'],
    [0xA8, 'LDD'], [0xA9, 'CPD'], [0xAA, 'IND'], [0xAB, 'OUTD'],
    [0xB0, 'LDIR'], [0xB1, 'CPIR'], [0xB2, 'INIR'], [0xB3, 'OTIR'],
    [0xB8, 'LDDR'], [0xB9, 'CPDR'], [0xBA, 'INDR'], [0xBB, 'OTDR'],
  ]);
  if (table.has(op)) return { len: 2, asm: table.get(op) };

  if ((op & 0xC7) === 0x40) {
    return { len: 2, asm: `IN ${regs8[(op >> 3) & 7]},(C)`, io: true };
  }
  if ((op & 0xC7) === 0x41) {
    return { len: 2, asm: `OUT (C),${regs8[(op >> 3) & 7]}`, io: true };
  }
  if ((op & 0xC7) === 0x42) {
    return { len: 2, asm: `SBC HL,${rp16[(op >> 4) & 3]}` };
  }
  if ((op & 0xC7) === 0x4A) {
    return { len: 2, asm: `ADC HL,${rp16[(op >> 4) & 3]}` };
  }

  return { len: 2, asm: `ED ${hex(op)}` };
}

function decodeIndexed(addr, ireg) {
  const op = u8(addr + 1);
  if (op === 0xCB) {
    const d = signed8(u8(addr + 2));
    const cb = u8(addr + 3);
    const y = (cb >> 3) & 7;
    const z = cb & 7;
    const target = `(${ireg}${d < 0 ? '-' : '+'}${hex(Math.abs(d))})`;
    const rot = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'];
    if (cb < 0x40) return { len: 4, asm: `${rot[y]} ${target}` };
    if (cb < 0x80) return { len: 4, asm: `BIT ${y},${target}` };
    if (cb < 0xC0) return { len: 4, asm: `RES ${y},${target}` };
    return { len: 4, asm: `SET ${y},${target}` };
  }

  const d = signed8(u8(addr + 2));
  const ixh = ireg === 'IX' ? 'IXH' : 'IYH';
  const ixl = ireg === 'IX' ? 'IXL' : 'IYL';
  const mem = `(${ireg}${d < 0 ? '-' : '+'}${hex(Math.abs(d))})`;
  const rr = regs8.map((r) => (r === 'H' ? ixh : r === 'L' ? ixl : r === '(HL)' ? mem : r));
  const nn = u16(addr + 2);

  if (op === 0x21) return { len: 4, asm: `LD ${ireg},${hex(nn, 4)}` };
  if (op === 0x22) return { len: 5, asm: `LD (${annotateAddr(u24(addr + 2))}),${ireg}`, mem: u24(addr + 2) };
  if (op === 0x2A) return { len: 5, asm: `LD ${ireg},(${annotateAddr(u24(addr + 2))})`, mem: u24(addr + 2) };
  if (op === 0x23) return { len: 2, asm: `INC ${ireg}` };
  if (op === 0x2B) return { len: 2, asm: `DEC ${ireg}` };
  if (op === 0xE1) return { len: 2, asm: `POP ${ireg}` };
  if (op === 0xE3) return { len: 2, asm: `EX (SP),${ireg}` };
  if (op === 0xE5) return { len: 2, asm: `PUSH ${ireg}` };
  if (op === 0xE9) return { len: 2, asm: `JP (${ireg})`, jump: null };
  if (op === 0xF9) return { len: 2, asm: `LD SP,${ireg}` };
  if (op === 0x34) return { len: 3, asm: `INC ${mem}`, iy: ireg === 'IY' };
  if (op === 0x35) return { len: 3, asm: `DEC ${mem}`, iy: ireg === 'IY' };
  if (op === 0x36) return { len: 4, asm: `LD ${mem},${hex(u8(addr + 3))}`, iy: ireg === 'IY' };

  if (op >= 0x40 && op <= 0x7F && op !== 0x76) {
    const r1 = rr[(op >> 3) & 7];
    const r2 = rr[op & 7];
    return { len: r1.includes('(') || r2.includes('(') ? 3 : 2, asm: `LD ${r1},${r2}`, iy: ireg === 'IY' && (r1.includes('IY') || r2.includes('IY')) };
  }
  if ((op & 0xC7) === 0x04) return { len: 2, asm: `INC ${rr[(op >> 3) & 7]}` };
  if ((op & 0xC7) === 0x05) return { len: 2, asm: `DEC ${rr[(op >> 3) & 7]}` };
  if ((op & 0xC7) === 0x06) return { len: rr[(op >> 3) & 7].includes('(') ? 4 : 3, asm: `LD ${rr[(op >> 3) & 7]},${hex(u8(addr + 2))}` };
  if (op >= 0x80 && op <= 0xBF) return { len: rr[op & 7].includes('(') ? 3 : 2, asm: `${alu[(op >> 3) & 7]} ${rr[op & 7]}` };

  const base = decode(addr + 1);
  return { ...base, len: base.len + 1, asm: `${ireg}: ${base.asm}` };
}

function decode(addr) {
  const op = u8(addr);
  const x = op >> 6;
  const y = (op >> 3) & 7;
  const z = op & 7;
  const p = y >> 1;
  const q = y & 1;

  if (op === 0xCB) return decodeCB(addr);
  if (op === 0xED) return decodeED(addr);
  if (op === 0xDD) return decodeIndexed(addr, 'IX');
  if (op === 0xFD) return decodeIndexed(addr, 'IY');

  const nn = u24(addr + 1);
  const nn16 = u16(addr + 1);
  const d = u8(addr + 1);

  if (x === 0) {
    if (z === 0) {
      if (y === 0) return { len: 1, asm: 'NOP' };
      if (y === 1) return { len: 4, asm: `LD (${annotateAddr(nn)}),HL`, mem: nn };
      if (y === 2) return { len: 2, asm: `DJNZ ${hex(relTarget(addr, 2, d), 6)}`, jump: relTarget(addr, 2, d) };
      if (y === 3) return { len: 2, asm: `JR ${hex(relTarget(addr, 2, d), 6)}`, jump: relTarget(addr, 2, d) };
      return { len: 2, asm: `JR ${cc[y - 4]},${hex(relTarget(addr, 2, d), 6)}`, jump: relTarget(addr, 2, d) };
    }
    if (z === 1) return q === 0 ? { len: 4, asm: `LD ${rp16[p]},${hex(u24(addr + 1), 6)}` } : { len: 1, asm: `ADD HL,${rp16[p]}` };
    if (z === 2) {
      const ops = ['LD (BC),A', 'LD A,(BC)', 'LD (DE),A', 'LD A,(DE)', `LD (${annotateAddr(nn)}),HL`, `LD HL,(${annotateAddr(nn)})`, `LD (${annotateAddr(nn)}),A`, `LD A,(${annotateAddr(nn)})`];
      return { len: y >= 4 ? 4 : 1, asm: ops[y], mem: y >= 4 ? nn : undefined };
    }
    if (z === 3) return { len: 1, asm: `${q ? 'DEC' : 'INC'} ${rp16[p]}` };
    if (z === 4) return { len: 1, asm: `INC ${regs8[y]}` };
    if (z === 5) return { len: 1, asm: `DEC ${regs8[y]}` };
    if (z === 6) return { len: 2, asm: `LD ${regs8[y]},${hex(d)}` };
    return { len: 1, asm: ['RLCA', 'RRCA', 'RLA', 'RRA', 'DAA', 'CPL', 'SCF', 'CCF'][y] };
  }

  if (x === 1) {
    if (op === 0x76) return { len: 1, asm: 'HALT' };
    return { len: 1, asm: `LD ${regs8[y]},${regs8[z]}` };
  }

  if (x === 2) return { len: 1, asm: `${alu[y]} ${regs8[z]}` };

  if (z === 0) return { len: 1, asm: `RET ${cc[y]}` };
  if (z === 1) return q === 0 ? { len: 1, asm: `POP ${['BC', 'DE', 'HL', 'AF'][p]}` } : { len: 1, asm: ['RET', 'EXX', 'JP (HL)', 'LD SP,HL'][p], jump: p === 2 ? null : undefined };
  if (z === 2) return { len: 4, asm: `JP ${cc[y]},${hex(nn, 6)}`, jump: nn };
  if (z === 3) {
    if (y === 0) return { len: 4, asm: `JP ${hex(nn, 6)}`, jump: nn };
    if (y === 2) return { len: 3, asm: `OUT (${hex(d)}),A`, io: true };
    if (y === 3) return { len: 3, asm: `IN A,(${hex(d)})`, io: true };
    if (y === 4) return { len: 1, asm: 'EX (SP),HL' };
    if (y === 5) return { len: 1, asm: 'EX DE,HL' };
    if (y === 6) return { len: 1, asm: 'DI' };
    if (y === 7) return { len: 1, asm: 'EI' };
  }
  if (z === 4) return { len: 4, asm: `CALL ${cc[y]},${hex(nn, 6)}`, call: nn };
  if (z === 5) return q === 0 ? { len: 1, asm: `PUSH ${['BC', 'DE', 'HL', 'AF'][p]}` } : { len: 4, asm: `CALL ${hex(nn, 6)}`, call: nn };
  if (z === 6) return { len: 2, asm: `${alu[y]} ${hex(d)}` };
  return { len: 1, asm: `RST ${hex(y * 8)}`, call: y * 8 };
}

// === Disassemble ===
const rows = [];
const refs = {
  calls: new Set(),
  jumps: new Set(),
  ram: new Set(),
  iy: [],
  io: [],
};

let pc = START;
const end = START + MAX_BYTES;
let funcEnd = null;
while (pc < end) {
  const ins = decode(pc);
  const bytes = Array.from({ length: ins.len }, (_, i) => hex(u8(pc + i))).join(' ');
  rows.push({ addr: pc, bytes, asm: ins.asm });
  if (ins.call !== undefined) refs.calls.add(ins.call);
  if (ins.jump !== undefined) refs.jumps.add(ins.jump);
  if (ins.mem !== undefined && ins.mem >= 0xD00000) refs.ram.add(ins.mem);
  if (ins.iy || ins.asm.includes('IY')) refs.iy.push(pc);
  if (ins.io) refs.io.push(pc);
  pc += Math.max(ins.len, 1);
}

// Detect function boundary by scanning for the first unconditional RET
// that is NOT jumped over, or an unconditional JP outside the function
for (const row of rows) {
  if (row.asm === 'RET') {
    // Check if any JR target jumps past this RET (meaning it's mid-function)
    const retEnd = row.addr + 1; // RET is 1 byte
    const jumpsPastRet = rows.some(
      (r) => r.asm.startsWith('JR ') && refs.jumps.has(row.addr) === false
    );
    // Simple heuristic: track all internal jump targets
    const internalTargets = new Set();
    for (const j of refs.jumps) {
      if (j >= START && j < end) internalTargets.add(j);
    }
    // If there are instructions after RET that are jump targets, function continues
    const hasCodeAfterRet = rows.some(
      (r) => r.addr > row.addr && internalTargets.has(r.addr)
    );
    if (!hasCodeAfterRet && !funcEnd) {
      funcEnd = retEnd;
    }
  }
  if (!funcEnd && row.asm.startsWith('JP ') && !row.asm.includes(',')) {
    // Unconditional JP — check if it's a tail jump outside function
    for (const j of refs.jumps) {
      if (j !== null && (j < START || j >= end)) {
        // Check if any code after this JP is a jump target
        const jpEnd = row.addr + 4;
        const internalTargets = new Set();
        for (const jt of refs.jumps) {
          if (jt >= START && jt < end) internalTargets.add(jt);
        }
        const hasCodeAfterJp = rows.some(
          (r) => r.addr >= jpEnd && internalTargets.has(r.addr)
        );
        if (!hasCodeAfterJp && !funcEnd) {
          funcEnd = jpEnd;
        }
      }
    }
  }
}

console.log(`${TITLE}`);
console.log(`ROM: ${ROM_PATH}`);
console.log(`Range: ${hex(START, 6)}-${hex(pc - 1, 6)} (${pc - START} bytes decoded; requested ${MAX_BYTES})`);
console.log('');
for (const row of rows) {
  const marker = funcEnd && row.addr >= funcEnd ? ' <-- past func end' : '';
  console.log(`${hex(row.addr, 6)}  ${row.bytes.padEnd(18)} ${row.asm}${marker}`);
}

console.log('');
console.log('References:');
console.log(`  CALL targets: ${[...refs.calls].map((v) => hex(v, 6)).join(', ') || 'none'}`);
console.log(`  JP/JR targets: ${[...refs.jumps].map((v) => hex(v, 6)).join(', ') || 'none'}`);
console.log(`  RAM refs: ${[...refs.ram].map((v) => annotateAddr(v)).join(', ') || 'none'}`);
console.log(`  IY refs: ${refs.iy.map((v) => hex(v, 6)).join(', ') || 'none'}`);
console.log(`  Port I/O: ${refs.io.map((v) => hex(v, 6)).join(', ') || 'none'}`);

// === Function Boundary ===
console.log('');
console.log('=== Function Boundary ===');
if (funcEnd) {
  console.log(`  Function spans: ${hex(START, 6)} - ${hex(funcEnd - 1, 6)} (${funcEnd - START} bytes)`);
} else {
  console.log('  No clear function end found in decoded range — may be larger than 128 bytes');
}

// === Cross-reference scan ===
console.log('');
console.log('=== Cross-References: who calls/jumps to 0x07FEFC ===');
const target3 = [START & 0xFF, (START >> 8) & 0xFF, (START >> 16) & 0xFF];
const xrefs = [];
for (let scan = 0; scan < rom.length - 3; scan++) {
  const op = rom[scan];
  // CALL nn (CD) or JP nn (C3)
  if ((op === 0xCD || op === 0xC3) && rom[scan + 1] === target3[0] && rom[scan + 2] === target3[1] && rom[scan + 3] === target3[2]) {
    xrefs.push({ addr: scan, type: op === 0xCD ? 'CALL' : 'JP' });
  }
  // Conditional CALL cc,nn (C4/CC/D4/DC/E4/EC/F4/FC) and JP cc,nn (C2/CA/D2/DA/E2/EA/F2/FA)
  if (((op & 0xC7) === 0xC4 || (op & 0xC7) === 0xC2) && op !== 0xCD && op !== 0xC3 &&
      rom[scan + 1] === target3[0] && rom[scan + 2] === target3[1] && rom[scan + 3] === target3[2]) {
    const isCall = (op & 0xC7) === 0xC4;
    const condIdx = (op >> 3) & 7;
    xrefs.push({ addr: scan, type: `${isCall ? 'CALL' : 'JP'} ${cc[condIdx]}` });
  }
}
if (xrefs.length === 0) {
  console.log('  No direct CALL/JP xrefs found');
} else {
  for (const xr of xrefs) {
    console.log(`  ${hex(xr.addr, 6)}: ${xr.type} ${hex(START, 6)}`);
  }
  console.log(`  Total: ${xrefs.length} xref(s)`);
}

// === Data flow analysis ===
console.log('');
console.log('=== Data Flow Analysis ===');
const ramReads = [];
const ramWrites = [];
for (const row of rows) {
  // LD A,(addr) or LD reg,(addr)
  const readMatch = row.asm.match(/LD [A-Z]+,\(0x([0-9A-F]+)/);
  if (readMatch) {
    const t = parseInt(readMatch[1], 16);
    if (t >= 0xD00000) ramReads.push({ addr: row.addr, target: t, asm: row.asm });
  }
  // LD (addr),reg — write
  const writeMatch = row.asm.match(/LD \(0x([0-9A-F]+)\),[A-Z]/);
  if (writeMatch) {
    const t = parseInt(writeMatch[1], 16);
    if (t >= 0xD00000) ramWrites.push({ addr: row.addr, target: t, asm: row.asm });
  }
}
console.log('  RAM reads:');
if (ramReads.length === 0) console.log('    (none)');
for (const r of ramReads) {
  console.log(`    ${hex(r.addr, 6)}: ${r.asm}  -> ${annotateAddr(r.target)}`);
}
console.log('  RAM writes:');
if (ramWrites.length === 0) console.log('    (none)');
for (const w of ramWrites) {
  console.log(`    ${hex(w.addr, 6)}: ${w.asm}  -> ${annotateAddr(w.target)}`);
}

// === Purpose analysis ===
console.log('');
console.log('=== Purpose Analysis ===');
console.log('  Entry: A = type byte (from caller 0x07FEE1 search dispatcher)');
console.log('  AND 0x3F masks to lower 6 bits of type');
console.log('  Accepts type 0x00 (zero after mask) and type 0x20 only; rejects others via RET NZ');
console.log('  Then dispatches through sub-calls:');
for (const c of refs.calls) {
  console.log(`    CALL ${hex(c, 6)}`);
}
console.log('  Called by 0x07FEE1 (search dispatcher) -> 0x07FEB6 (dual-descriptor type-remapped symbol search)');
