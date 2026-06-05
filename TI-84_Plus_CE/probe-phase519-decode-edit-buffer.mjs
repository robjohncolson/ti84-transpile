import { readFileSync } from 'fs';

const ROM_PATH = 'TI-84_Plus_CE/ROM.rom';
const START = 0x06C720;
const MIN_BYTES = 200;
const MAX_BYTES = 0x200;
const IY_BASE = 0xd00080;

// The 4 entry points from 0x097757 post-allocation handler
const ENTRY_POINTS = [
  { addr: 0x06C72D, label: 'type1 (bit 6 of D005FA)', description: 'D005FA bit 6 set' },
  { addr: 0x06C732, label: 'default (no bits)', description: 'D005FA bits 4-6 clear' },
  { addr: 0x06C737, label: 'type2 (bit 5)', description: 'D005FA bit 5 set' },
  { addr: 0x06C73C, label: 'type3 (bit 4)', description: 'D005FA bit 4 set' },
];

const rom = readFileSync(ROM_PATH);

const hex = (value, width = 2) => `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
const addr = (value) => hex(value, 6);
const signed = (byte) => (byte & 0x80 ? byte - 0x100 : byte);
const relTarget = (pc, size, disp) => (pc + size + signed(disp)) & 0xffffff;
const u16 = (off) => rom[off] | (rom[off + 1] << 8);
const u24 = (off) => rom[off] | (rom[off + 1] << 8) | (rom[off + 2] << 16);
const iyAddr = (disp) => (IY_BASE + signed(disp)) & 0xffffff;

const calls = [];
const ramAccesses = [];
const branches = [];
const stackOps = [];
const iyAccesses = [];

function bytesAt(pc, size) {
  return [...rom.subarray(pc, pc + size)].map((byte) => byte.toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

function noteRam(pc, op, address, detail = '') {
  if ((address & 0xff0000) === 0xd00000) {
    ramAccesses.push({ pc, op, address, detail });
  }
}

function noteIy(pc, op, disp, detail = '') {
  const address = iyAddr(disp);
  iyAccesses.push({ pc, op, disp: signed(disp), address, detail });
  noteRam(pc, op, address, `IY${signed(disp) >= 0 ? '+' : ''}${signed(disp)} ${detail}`.trim());
}

const cc = ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'];
const rpPush = ['BC', 'DE', 'HL', 'AF'];
const rp = ['BC', 'DE', 'HL', 'SP'];
const alu = ['ADD A', 'ADC A', 'SUB', 'SBC A', 'AND', 'XOR', 'OR', 'CP'];
const r = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];

function decodeCb(pc, prefix = '') {
  const op = rom[pc + 1];
  const x = op >> 6;
  const y = (op >> 3) & 7;
  const z = op & 7;
  const groups = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'];
  const bitGroups = ['BIT', 'RES', 'SET'];
  const text = x === 0 ? `${groups[y]} ${r[z]}` : `${bitGroups[x - 1]} ${y},${r[z]}`;
  return { size: 2, text: `${prefix}${text}` };
}

function decodeEd(pc, prefix = '') {
  const op = rom[pc + 1];
  const lo = rom[pc + 2];
  const hi = rom[pc + 3];
  const address16 = lo | (hi << 8);
  const block = {
    0x44: 'NEG', 0x45: 'RETN', 0x46: 'IM 0', 0x47: 'LD I,A', 0x4d: 'RETI', 0x4f: 'LD R,A',
    0x56: 'IM 1', 0x57: 'LD A,I', 0x5e: 'IM 2', 0x5f: 'LD A,R',
    0xa0: 'LDI', 0xa1: 'CPI', 0xa2: 'INI', 0xa3: 'OUTI',
    0xa8: 'LDD', 0xa9: 'CPD', 0xaa: 'IND', 0xab: 'OUTD',
    0xb0: 'LDIR', 0xb1: 'CPIR', 0xb2: 'INIR', 0xb3: 'OTIR',
    0xb8: 'LDDR', 0xb9: 'CPDR', 0xba: 'INDR', 0xbb: 'OTDR',
  };
  if (block[op]) return { size: 2, text: `${prefix}${block[op]}` };
  if ((op & 0xcf) === 0x43) {
    const reg = rp[(op >> 4) & 3];
    noteRam(pc, `WRITE ${reg}`, address16, 'ED 16-bit absolute');
    return { size: 4, text: `${prefix}LD (${hex(address16, 4)}),${reg}` };
  }
  if ((op & 0xcf) === 0x4b) {
    const reg = rp[(op >> 4) & 3];
    noteRam(pc, `READ ${reg}`, address16, 'ED 16-bit absolute');
    return { size: 4, text: `${prefix}LD ${reg},(${hex(address16, 4)})` };
  }
  return { size: 2, text: `${prefix}ED ${hex(op)}` };
}

function decodeIndexed(pc, indexReg, prefix = '') {
  const op = rom[pc + 1];

  if (op === 0xcb) {
    const disp = rom[pc + 2];
    const cbop = rom[pc + 3];
    const x = cbop >> 6;
    const y = (cbop >> 3) & 7;
    const z = cbop & 7;
    const groups = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'];
    const bitGroups = ['BIT', 'RES', 'SET'];
    const mem = `(${indexReg}${signed(disp) >= 0 ? '+' : ''}${signed(disp)})`;
    const opName = x === 0 ? groups[y] : `${bitGroups[x - 1]} ${y},`;
    const access = x === 0 ? 'READ/WRITE' : x === 1 ? 'READ BIT' : 'READ/WRITE BIT';
    if (indexReg === 'IY') noteIy(pc, access, disp, `${opName}${mem}`);
    return { size: 4, text: `${prefix}${opName}${mem}${z !== 6 ? ` -> ${r[z]}` : ''}` };
  }

  if (op === 0x21) return { size: 4, text: `${prefix}LD ${indexReg},${addr(u24(pc + 2))}` };
  if (op === 0x22) {
    const target = u24(pc + 2);
    noteRam(pc, `WRITE ${indexReg}`, target);
    return { size: 4, text: `${prefix}LD (${addr(target)}),${indexReg}` };
  }
  if (op === 0x2a) {
    const target = u24(pc + 2);
    noteRam(pc, `READ ${indexReg}`, target);
    return { size: 4, text: `${prefix}LD ${indexReg},(${addr(target)})` };
  }
  if (op === 0x36) {
    const disp = rom[pc + 2];
    const value = rom[pc + 3];
    if (indexReg === 'IY') noteIy(pc, `WRITE ${hex(value)}`, disp, 'LD (IY+d),n');
    return { size: 4, text: `${prefix}LD (${indexReg}${signed(disp) >= 0 ? '+' : ''}${signed(disp)}),${hex(value)}` };
  }
  if ((op & 0xc7) === 0x46) {
    const reg = r[(op >> 3) & 7];
    const disp = rom[pc + 2];
    if (indexReg === 'IY') noteIy(pc, `READ ${reg}`, disp, `LD ${reg},(IY+d)`);
    return { size: 3, text: `${prefix}LD ${reg},(${indexReg}${signed(disp) >= 0 ? '+' : ''}${signed(disp)})` };
  }
  if ((op & 0xf8) === 0x70) {
    const src = r[op & 7];
    const disp = rom[pc + 2];
    if (indexReg === 'IY') noteIy(pc, `WRITE ${src}`, disp, `LD (IY+d),${src}`);
    return { size: 3, text: `${prefix}LD (${indexReg}${signed(disp) >= 0 ? '+' : ''}${signed(disp)}),${src}` };
  }
  if ((op & 0xc7) === 0x86) {
    const disp = rom[pc + 2];
    const opName = alu[(op >> 3) & 7];
    if (indexReg === 'IY') noteIy(pc, 'READ ALU', disp, `${opName} (IY+d)`);
    return { size: 3, text: `${prefix}${opName} (${indexReg}${signed(disp) >= 0 ? '+' : ''}${signed(disp)})` };
  }
  if (op === 0xe5) {
    stackOps.push({ pc, op: `PUSH ${indexReg}` });
    return { size: 2, text: `${prefix}PUSH ${indexReg}` };
  }
  if (op === 0xe1) {
    stackOps.push({ pc, op: `POP ${indexReg}` });
    return { size: 2, text: `${prefix}POP ${indexReg}` };
  }
  if (op === 0x23) return { size: 2, text: `${prefix}INC ${indexReg}` };
  if (op === 0x2b) return { size: 2, text: `${prefix}DEC ${indexReg}` };
  if (op === 0x09) return { size: 2, text: `${prefix}ADD ${indexReg},BC` };
  if (op === 0x19) return { size: 2, text: `${prefix}ADD ${indexReg},DE` };
  if (op === 0x29) return { size: 2, text: `${prefix}ADD ${indexReg},${indexReg}` };
  if (op === 0x39) return { size: 2, text: `${prefix}ADD ${indexReg},SP` };
  if (op === 0xe9) {
    branches.push({ pc, type: `JP (${indexReg})`, target: null });
    return { size: 2, text: `${prefix}JP (${indexReg})` };
  }
  if (op === 0xf9) return { size: 2, text: `${prefix}LD SP,${indexReg}` };

  const base = decodeBase(pc + 1, prefix, true);
  return { size: base.size + 1, text: `${prefix}${base.text.replace(/\bHL\b/g, indexReg).replace(/\(HL\)/g, `(${indexReg}+d)`)} ; indexed prefix` };
}

function decodeBase(pc, prefix = '', nested = false) {
  const op = rom[pc];
  const n = rom[pc + 1];
  const nn = u16(pc + 1);
  const nnn = u24(pc + 1);

  if ([0x40, 0x49, 0x52, 0x5b].includes(op)) {
    const suffix = { 0x40: '.SIS', 0x49: '.LIS', 0x52: '.SIL', 0x5b: '.LIL' }[op];
    const next = decodeBase(pc + 1, `${prefix}${suffix} `);
    return { size: next.size + 1, text: next.text };
  }
  if (op === 0xcb) return decodeCb(pc, prefix);
  if (op === 0xed) return decodeEd(pc, prefix);
  if (op === 0xdd) return decodeIndexed(pc, 'IX', prefix);
  if (op === 0xfd) return decodeIndexed(pc, 'IY', prefix);

  if (op === 0x00) return { size: 1, text: `${prefix}NOP` };
  if (op === 0x08) return { size: 1, text: `${prefix}EX AF,AF'` };
  if (op === 0x10) {
    const target = relTarget(pc, 2, n);
    branches.push({ pc, type: 'DJNZ', target });
    return { size: 2, text: `${prefix}DJNZ ${addr(target)}` };
  }
  if ([0x18, 0x20, 0x28, 0x30, 0x38].includes(op)) {
    const cond = { 0x18: '', 0x20: 'NZ,', 0x28: 'Z,', 0x30: 'NC,', 0x38: 'C,' }[op];
    const target = relTarget(pc, 2, n);
    branches.push({ pc, type: `JR ${cond || 'uncond'}`.trim(), target });
    return { size: 2, text: `${prefix}JR ${cond}${addr(target)}` };
  }
  if (op === 0xc3) {
    branches.push({ pc, type: 'JP', target: nnn, exits: nnn < START || nnn > START + MAX_BYTES });
    return { size: 4, text: `${prefix}JP ${addr(nnn)}` };
  }
  if ((op & 0xc7) === 0xc2) {
    const condition = cc[(op >> 3) & 7];
    branches.push({ pc, type: `JP ${condition}`, target: nnn });
    return { size: 4, text: `${prefix}JP ${condition},${addr(nnn)}` };
  }
  if (op === 0xcd) {
    calls.push({ pc, target: nnn });
    return { size: 4, text: `${prefix}CALL ${addr(nnn)}` };
  }
  if ((op & 0xc7) === 0xc4) {
    const condition = cc[(op >> 3) & 7];
    calls.push({ pc, target: nnn, condition });
    return { size: 4, text: `${prefix}CALL ${condition},${addr(nnn)}` };
  }
  if (op === 0xc9) return { size: 1, text: `${prefix}RET`, exits: true };
  if ((op & 0xc7) === 0xc0) return { size: 1, text: `${prefix}RET ${cc[(op >> 3) & 7]}`, conditionalReturn: true };
  if (op === 0xd9) return { size: 1, text: `${prefix}EXX` };
  if (op === 0xe3) return { size: 1, text: `${prefix}EX (SP),HL` };
  if (op === 0xeb) return { size: 1, text: `${prefix}EX DE,HL` };
  if (op === 0xf3) return { size: 1, text: `${prefix}DI` };
  if (op === 0xfb) return { size: 1, text: `${prefix}EI` };

  if ((op & 0xcf) === 0x01) return { size: 4, text: `${prefix}LD ${rp[(op >> 4) & 3]},${addr(nnn)}` };
  if ((op & 0xcf) === 0x03) return { size: 1, text: `${prefix}INC ${rp[(op >> 4) & 3]}` };
  if ((op & 0xcf) === 0x0b) return { size: 1, text: `${prefix}DEC ${rp[(op >> 4) & 3]}` };
  if ((op & 0xcf) === 0x09) return { size: 1, text: `${prefix}ADD HL,${rp[(op >> 4) & 3]}` };
  if ((op & 0xc7) === 0x04) return { size: 1, text: `${prefix}INC ${r[(op >> 3) & 7]}` };
  if ((op & 0xc7) === 0x05) return { size: 1, text: `${prefix}DEC ${r[(op >> 3) & 7]}` };
  if ((op & 0xc7) === 0x06) return { size: 2, text: `${prefix}LD ${r[(op >> 3) & 7]},${hex(n)}` };
  if (op === 0x02) return { size: 1, text: `${prefix}LD (BC),A` };
  if (op === 0x0a) return { size: 1, text: `${prefix}LD A,(BC)` };
  if (op === 0x12) return { size: 1, text: `${prefix}LD (DE),A` };
  if (op === 0x1a) return { size: 1, text: `${prefix}LD A,(DE)` };
  if (op === 0x22) {
    noteRam(pc, 'WRITE HL', nnn);
    return { size: 4, text: `${prefix}LD (${addr(nnn)}),HL` };
  }
  if (op === 0x2a) {
    noteRam(pc, 'READ HL', nnn);
    return { size: 4, text: `${prefix}LD HL,(${addr(nnn)})` };
  }
  if (op === 0x32) {
    noteRam(pc, 'WRITE A', nnn);
    return { size: 4, text: `${prefix}LD (${addr(nnn)}),A` };
  }
  if (op === 0x3a) {
    noteRam(pc, 'READ A', nnn);
    return { size: 4, text: `${prefix}LD A,(${addr(nnn)})` };
  }
  if (op >= 0x40 && op <= 0x7f) {
    if (op === 0x76) return { size: 1, text: `${prefix}HALT` };
    return { size: 1, text: `${prefix}LD ${r[(op >> 3) & 7]},${r[op & 7]}` };
  }
  if (op >= 0x80 && op <= 0xbf) return { size: 1, text: `${prefix}${alu[(op >> 3) & 7]} ${r[op & 7]}` };
  if ((op & 0xc7) === 0xc6) return { size: 2, text: `${prefix}${alu[(op >> 3) & 7]} ${hex(n)}` };
  if ((op & 0xcf) === 0xc5) {
    stackOps.push({ pc, op: `PUSH ${rpPush[(op >> 4) & 3]}` });
    return { size: 1, text: `${prefix}PUSH ${rpPush[(op >> 4) & 3]}` };
  }
  if ((op & 0xcf) === 0xc1) {
    stackOps.push({ pc, op: `POP ${rpPush[(op >> 4) & 3]}` });
    return { size: 1, text: `${prefix}POP ${rpPush[(op >> 4) & 3]}` };
  }
  if ((op & 0xc7) === 0xc7) return { size: 1, text: `${prefix}RST ${hex(op & 0x38)}` };
  if (op === 0x07) return { size: 1, text: `${prefix}RLCA` };
  if (op === 0x0f) return { size: 1, text: `${prefix}RRCA` };
  if (op === 0x17) return { size: 1, text: `${prefix}RLA` };
  if (op === 0x1f) return { size: 1, text: `${prefix}RRA` };
  if (op === 0x27) return { size: 1, text: `${prefix}DAA` };
  if (op === 0x2f) return { size: 1, text: `${prefix}CPL` };
  if (op === 0x37) return { size: 1, text: `${prefix}SCF` };
  if (op === 0x3f) return { size: 1, text: `${prefix}CCF` };
  if (op === 0xe9) return { size: 1, text: `${prefix}JP (HL)` };

  return { size: 1, text: `${prefix}DB ${hex(op)}` };
}

// Decode a wide range starting before the first entry point
const instructions = [];
let pc = START;
const endAddress = START + MAX_BYTES;

// Decode until we've covered enough and seen returns/exits past all entry points
const lastEntryPoint = Math.max(...ENTRY_POINTS.map((ep) => ep.addr));
let retCount = 0;

while (pc < rom.length && pc < endAddress) {
  const decoded = decodeBase(pc);
  instructions.push({ pc, ...decoded, bytes: bytesAt(pc, decoded.size) });
  pc += decoded.size;

  if (decoded.exits || decoded.conditionalReturn) {
    if (pc > lastEntryPoint) {
      retCount++;
      // After seeing 3 returns past last entry, we've likely covered all paths
      if (retCount >= 3 && pc - START >= MIN_BYTES) break;
    }
  }
}

function uniqueBy(items, keyFn) {
  const seen = new Set();
  return items.filter((item) => {
    const key = keyFn(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Determine which instructions belong to which entry point's path
function analyzeEntryPaths() {
  const results = [];

  for (const ep of ENTRY_POINTS) {
    // Collect instructions from this entry point until we hit RET or JP out
    const path = [];
    let collecting = false;
    for (const ins of instructions) {
      if (ins.pc === ep.addr) collecting = true;
      if (collecting) {
        path.push(ins);
        if (ins.exits || (ins.text.includes('JP ') && !ins.text.includes('JP ('))) break;
      }
    }

    // Identify calls, RAM, IY in this path
    const pathCalls = calls.filter((c) => path.some((p) => p.pc === c.pc));
    const pathRam = ramAccesses.filter((ra) => path.some((p) => p.pc === ra.pc));
    const pathIy = iyAccesses.filter((iy) => path.some((p) => p.pc === iy.pc));

    results.push({ ep, path, pathCalls, pathRam, pathIy });
  }

  return results;
}

// Print output
console.log('='.repeat(80));
console.log('Probe phase 519: decode edit-buffer handlers 0x06C72D-0x06C73C');
console.log(`ROM: ${ROM_PATH} (${rom.length} bytes)`);
console.log(`Decoded range: ${addr(START)}..${addr(pc - 1)} (${pc - START} bytes)`);
console.log('='.repeat(80));

console.log('');
console.log('Entry points (from 0x097757 post-allocation handler, D005FA flag dispatch):');
for (const ep of ENTRY_POINTS) {
  console.log(`  ${addr(ep.addr)}  ${ep.label}  (${ep.description})`);
}

console.log('');
console.log('-'.repeat(80));
console.log('Full disassembly:');
console.log('-'.repeat(80));
for (const ins of instructions) {
  const epMatch = ENTRY_POINTS.find((ep) => ep.addr === ins.pc);
  if (epMatch) {
    console.log(`  ; ---- ENTRY: ${epMatch.label} (${epMatch.description}) ----`);
  }
  console.log(`  ${addr(ins.pc)}  ${ins.bytes.padEnd(18)}  ${ins.text}`);
}

console.log('');
console.log('-'.repeat(80));
console.log('CALL targets:');
console.log('-'.repeat(80));
if (!calls.length) {
  console.log('  none in decoded window');
} else {
  for (const call of uniqueBy(calls, (c) => `${c.pc}:${c.target}`)) {
    console.log(`  ${addr(call.pc)} -> ${call.condition ? `${call.condition} ` : ''}${addr(call.target)}`);
  }
}

console.log('');
console.log('-'.repeat(80));
console.log('RAM accesses (D0xxxx):');
console.log('-'.repeat(80));
const ram = uniqueBy(ramAccesses, (x) => `${x.pc}:${x.op}:${x.address}`);
if (!ram.length) {
  console.log('  none decoded as absolute/IY D0xxxx accesses in this window');
} else {
  for (const access of ram) {
    const watched =
      access.address >= 0xd00500 && access.address <= 0xd005ff ? ' [D005xx edit-state]' :
      access.address >= 0xd00600 && access.address <= 0xd006ff ? ' [D006xx display]' :
      access.address >= 0xd00800 && access.address <= 0xd008ff ? ' [D008xx stack/cursor]' :
      '';
    console.log(`  ${addr(access.pc)} ${access.op.padEnd(16)} ${addr(access.address)}${watched}${access.detail ? ` ; ${access.detail}` : ''}`);
  }
}

console.log('');
console.log('-'.repeat(80));
console.log('IY-relative accesses (IY base = 0xD00080):');
console.log('-'.repeat(80));
if (!iyAccesses.length) {
  console.log('  none decoded in this window');
} else {
  for (const access of uniqueBy(iyAccesses, (x) => `${x.pc}:${x.op}:${x.address}`)) {
    console.log(`  ${addr(access.pc)} ${access.op.padEnd(16)} IY${access.disp >= 0 ? '+' : ''}${access.disp} => ${addr(access.address)} ; ${access.detail}`);
  }
}

console.log('');
console.log('-'.repeat(80));
console.log('Branches:');
console.log('-'.repeat(80));
if (!branches.length) {
  console.log('  none decoded in this window');
} else {
  for (const branch of branches) {
    const inRange = branch.target >= START && branch.target < pc;
    const epTarget = ENTRY_POINTS.find((ep) => ep.addr === branch.target);
    const note = epTarget ? ` ; -> ${epTarget.label}` : (branch.target && !inRange) ? ' ; exits decoded range' : '';
    console.log(`  ${addr(branch.pc)} ${branch.type.padEnd(12)} ${branch.target !== null ? addr(branch.target) : '(reg)'}${note}`);
  }
}

console.log('');
console.log('-'.repeat(80));
console.log('Stack operations:');
console.log('-'.repeat(80));
if (!stackOps.length) {
  console.log('  none decoded in this window');
} else {
  for (const op of stackOps) {
    console.log(`  ${addr(op.pc)} ${op.op}`);
  }
}

// Per-entry-point analysis
console.log('');
console.log('='.repeat(80));
console.log('Per-entry-point path analysis:');
console.log('='.repeat(80));

const pathResults = analyzeEntryPaths();

for (const { ep, path, pathCalls, pathRam, pathIy } of pathResults) {
  console.log('');
  console.log(`--- ${addr(ep.addr)} ${ep.label} ---`);
  console.log(`  Instructions in linear path: ${path.length}`);
  console.log(`  Bytes: ${path.reduce((sum, ins) => sum + ins.size, 0)}`);

  if (path.length > 0) {
    console.log('  Code:');
    for (const ins of path) {
      console.log(`    ${addr(ins.pc)}  ${ins.bytes.padEnd(18)}  ${ins.text}`);
    }
  }

  if (pathCalls.length > 0) {
    console.log('  Calls:');
    for (const c of pathCalls) {
      console.log(`    -> ${addr(c.target)}${c.condition ? ` (${c.condition})` : ''}`);
    }
  }

  if (pathRam.length > 0) {
    console.log('  RAM:');
    for (const ra of pathRam) {
      console.log(`    ${ra.op} ${addr(ra.address)}${ra.detail ? ` ; ${ra.detail}` : ''}`);
    }
  }

  if (pathIy.length > 0) {
    console.log('  IY:');
    for (const iy of pathIy) {
      console.log(`    ${iy.op} IY${iy.disp >= 0 ? '+' : ''}${iy.disp} => ${addr(iy.address)} ; ${iy.detail}`);
    }
  }
}

// Shared code analysis
console.log('');
console.log('='.repeat(80));
console.log('Shared vs divergent code:');
console.log('='.repeat(80));

// Check which addresses appear in multiple entry point paths
const addressToEntries = new Map();
for (const { ep, path } of pathResults) {
  for (const ins of path) {
    if (!addressToEntries.has(ins.pc)) addressToEntries.set(ins.pc, []);
    addressToEntries.get(ins.pc).push(ep.label);
  }
}

const shared = [];
const unique = new Map();
for (const [address, entries] of addressToEntries) {
  if (entries.length > 1) {
    shared.push({ address, entries });
  } else {
    if (!unique.has(entries[0])) unique.set(entries[0], []);
    unique.get(entries[0]).push(address);
  }
}

if (shared.length > 0) {
  console.log('');
  console.log('Shared instructions (reached by multiple entry points):');
  for (const s of shared) {
    const ins = instructions.find((i) => i.pc === s.address);
    console.log(`  ${addr(s.address)}  ${ins ? ins.text : '???'}  [${s.entries.join(', ')}]`);
  }
}

for (const [label, addrs] of unique) {
  console.log('');
  console.log(`Unique to ${label}:`);
  for (const a of addrs) {
    const ins = instructions.find((i) => i.pc === a);
    console.log(`  ${addr(a)}  ${ins ? ins.text : '???'}`);
  }
}

// Summary
console.log('');
console.log('='.repeat(80));
console.log('Summary:');
console.log('='.repeat(80));
console.log(`Total decoded: ${pc - START} bytes, ${instructions.length} instructions`);
console.log(`Entry points span: ${addr(ENTRY_POINTS[0].addr)}..${addr(ENTRY_POINTS[ENTRY_POINTS.length - 1].addr)} (${ENTRY_POINTS[ENTRY_POINTS.length - 1].addr - ENTRY_POINTS[0].addr} bytes apart)`);
console.log(`Unique CALL targets: ${[...new Set(calls.map((c) => c.target))].length}`);
console.log(`Unique RAM addresses: ${[...new Set(ramAccesses.map((r) => r.address))].length}`);
console.log(`IY accesses: ${iyAccesses.length}`);
console.log('');
console.log('Interpretation: These 4 entry points are spaced only 15 bytes apart (0x06C72D-0x06C73C),');
console.log('strongly suggesting they share a common tail with different setup preambles.');
console.log('Each entry point likely sets a different register or flag value before falling');
console.log('through to shared edit-buffer manipulation code.');
