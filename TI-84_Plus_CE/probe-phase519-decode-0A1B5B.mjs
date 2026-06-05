import { readFileSync } from 'fs';

const ROM_PATH = 'TI-84_Plus_CE/ROM.rom';
const START = 0x0a1b5b;
const MIN_BYTES = 300;
const MAX_BYTES = 0x500;
const IY_BASE = 0xd00080;

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
  if (op === 0xe9) {
    branches.push({ pc, type: `JP (${indexReg})`, target: null });
    return { size: 2, text: `${prefix}JP (${indexReg})` };
  }
  if (op === 0x09) return { size: 2, text: `${prefix}ADD ${indexReg},BC` };
  if (op === 0x19) return { size: 2, text: `${prefix}ADD ${indexReg},DE` };
  if (op === 0x29) return { size: 2, text: `${prefix}ADD ${indexReg},${indexReg}` };
  if (op === 0x39) return { size: 2, text: `${prefix}ADD ${indexReg},SP` };

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
  if (op === 0x07) return { size: 1, text: `${prefix}RLCA` };
  if (op === 0x08) return { size: 1, text: `${prefix}EX AF,AF'` };
  if (op === 0x0f) return { size: 1, text: `${prefix}RRCA` };
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
  if (op === 0x17) return { size: 1, text: `${prefix}RLA` };
  if (op === 0x1f) return { size: 1, text: `${prefix}RRA` };
  if (op === 0x27) return { size: 1, text: `${prefix}DAA` };
  if (op === 0x2f) return { size: 1, text: `${prefix}CPL` };
  if (op === 0x37) return { size: 1, text: `${prefix}SCF` };
  if (op === 0x3f) return { size: 1, text: `${prefix}CCF` };
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
  if (op === 0xe9) {
    branches.push({ pc, type: 'JP (HL)', target: null });
    return { size: 1, text: `${prefix}JP (HL)` };
  }
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
  if (op === 0xd3) return { size: 2, text: `${prefix}OUT (${hex(n)}),A` };
  if (op === 0xdb) return { size: 2, text: `${prefix}IN A,(${hex(n)})` };

  return { size: 1, text: `${prefix}DB ${hex(op)}` };
}

const instructions = [];
let pc = START;
let sawExit = false;

while (pc < rom.length && pc < START + MAX_BYTES) {
  const decoded = decodeBase(pc);
  instructions.push({ pc, ...decoded, bytes: bytesAt(pc, decoded.size) });
  pc += decoded.size;

  if (decoded.exits || (decoded.text.includes('JP ') && branches.at(-1)?.exits)) {
    sawExit = true;
    if (pc - START >= MIN_BYTES) break;
  }
  if (pc - START >= MIN_BYTES && sawExit) break;
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

function callHint(target) {
  const known = new Map([
    [0x0a1799, 'pixel rasterizer — writes glyph bitmap to VRAM'],
    [0x0b9032, 'string renderer — iterates string, calls 0x0A1B5B per char'],
    [0x097757, 'post-allocation handler — rendering loop via 0x0A1B5B'],
    [0x0801af, 'token validation path'],
    [0x0846ea, 'allocator path'],
  ]);
  return known.get(target) ?? 'unknown helper; decode with a follow-up probe';
}

function inferPurpose() {
  const hasIyState = iyAccesses.length > 0;
  const hasD005 = ramAccesses.some((x) => x.address >= 0xd00500 && x.address <= 0xd005ff);
  const hasD006 = ramAccesses.some((x) => x.address >= 0xd00600 && x.address <= 0xd006ff);
  const hasD008 = ramAccesses.some((x) => x.address >= 0xd00800 && x.address <= 0xd008ff);
  const callTargets = calls.map((c) => c.target);
  const callsRasterizer = callTargets.includes(0x0a1799);

  const parts = [];
  if (callsRasterizer) parts.push('CALLS 0x0A1799 (pixel rasterizer) — confirms char-to-glyph converter role');
  if (hasIyState) parts.push('touches OS state flags/fields through IY-relative RAM');
  if (hasD005 || hasD006 || hasD008) parts.push(`uses display/cursor RAM:${hasD005 ? ' D005xx (curCol/curRow)' : ''}${hasD006 ? ' D006xx' : ''}${hasD008 ? ' D008xx (VRAM ptr)' : ''}`);
  if (calls.length) parts.push(`delegates to ${calls.length} helper(s)`);
  if (!parts.length) parts.push('mostly register/control-flow work; no watched RAM writes identified');

  return parts.join('; ');
}

console.log(`Probe phase 519: decode char-to-glyph converter ${addr(START)}`);
console.log(`ROM: ${ROM_PATH} (${rom.length} bytes)`);
console.log(`Decoded range: ${addr(START)}..${addr(pc - 1)} (${pc - START} bytes)`);
console.log('');
console.log('Context: 0x0A1B5B is the shared char-to-glyph converter in the rendering pipeline.');
console.log('  Called by: 0x0B9032 (string renderer), 0x097757 (post-allocation handler)');
console.log('  Calls:     0x0A1799 (pixel rasterizer -> VRAM)');
console.log('  Question:  How does char code (A reg) -> glyph data -> rasterizer?');
console.log('');
console.log('=== Disassembly ===');
for (const ins of instructions) {
  console.log(`${addr(ins.pc)}  ${ins.bytes.padEnd(14)}  ${ins.text}`);
}

console.log('');
console.log('=== CALL targets ===');
if (!calls.length) {
  console.log('  none in decoded window');
} else {
  for (const call of calls) {
    console.log(`  ${addr(call.pc)} -> ${call.condition ? `${call.condition} ` : ''}${addr(call.target)} ; ${callHint(call.target)}`);
  }
}

console.log('');
console.log('=== RAM accesses (D0xxxx) ===');
const ram = uniqueBy(ramAccesses, (x) => `${x.pc}:${x.op}:${x.address}:${x.detail}`);
if (!ram.length) {
  console.log('  none decoded as absolute/IY D0xxxx accesses in this window');
} else {
  for (const access of ram) {
    const label =
      access.address === 0xd00595 ? ' [curCol]' :
      access.address === 0xd00594 ? ' [curRow]' :
      access.address === 0xd008d2 ? ' [VRAM write ptr]' :
      access.address >= 0xd00500 && access.address <= 0xd005ff ? ' [D005xx cursor area]' :
      access.address >= 0xd00600 && access.address <= 0xd006ff ? ' [D006xx]' :
      access.address >= 0xd00800 && access.address <= 0xd008ff ? ' [D008xx display area]' :
      access.address >= 0xd00000 && access.address <= 0xd0ffff ? ' [D0xxxx]' : '';
    console.log(`  ${addr(access.pc)} ${access.op.padEnd(16)} ${addr(access.address)}${label}${access.detail ? ` ; ${access.detail}` : ''}`);
  }
}

console.log('');
console.log('=== IY-relative accesses ===');
if (!iyAccesses.length) {
  console.log('  none decoded in this window');
} else {
  for (const access of iyAccesses) {
    console.log(`  ${addr(access.pc)} ${access.op.padEnd(16)} IY${access.disp >= 0 ? '+' : ''}${access.disp} => ${addr(access.address)} ; ${access.detail}`);
  }
}

console.log('');
console.log('=== Branches ===');
if (!branches.length) {
  console.log('  none decoded in this window');
} else {
  for (const branch of branches) {
    const inRange = branch.target !== null && branch.target >= START && branch.target < START + MAX_BYTES;
    console.log(`  ${addr(branch.pc)} ${branch.type.padEnd(12)} ${branch.target !== null ? addr(branch.target) : '(register)'}${branch.exits ? ' ; exits function' : ''}${inRange ? ' ; local' : ''}`);
  }
}

console.log('');
console.log('=== Stack operations ===');
if (!stackOps.length) {
  console.log('  none decoded in this window');
} else {
  for (const op of stackOps) {
    console.log(`  ${addr(op.pc)} ${op.op}`);
  }
}

// Highlight interesting immediate values
console.log('');
console.log('=== Notable immediates (font table base, glyph size, multiply patterns) ===');
for (const ins of instructions) {
  // LD rr, imm24 — ROM-range pointers that could be font base
  const match24 = ins.text.match(/LD (HL|DE|BC|IX|IY),0x([0-9A-F]{6})/);
  if (match24) {
    const val = parseInt(match24[2], 16);
    if (val >= 0x020000 && val < 0x400000) {
      console.log(`  ${addr(ins.pc)}  ${ins.text}  ; ROM data pointer — possible font table`);
    }
  }
  // LD r, imm8 — glyph geometry constants
  const match8 = ins.text.match(/LD [A-Z],0x(1C|0E|10|0C|07)\b/);
  if (match8) {
    const labels = { '1C': '28 bytes/glyph', '0E': '14 pixel height', '10': '16 pixel width', '0C': '12', '07': '7 half-height' };
    console.log(`  ${addr(ins.pc)}  ${ins.text}  ; ${labels[match8[1]] || match8[1]}`);
  }
  // Shift/multiply patterns
  if (ins.text.match(/ADD HL,HL|ADD IX,IX|ADD IY,IY/)) {
    console.log(`  ${addr(ins.pc)}  ${ins.text}  ; shift left (multiply by 2)`);
  }
  if (ins.text.match(/ADD HL,(BC|DE|SP)/)) {
    console.log(`  ${addr(ins.pc)}  ${ins.text}  ; accumulate into HL`);
  }
}

console.log('');
console.log('=== Analysis ===');
console.log(`  Purpose inference: ${inferPurpose()}.`);
console.log('');
console.log('  Key questions to answer from disassembly above:');
console.log('  1. Font table base address: look for LD HL/DE with ROM-range 24-bit immediate');
console.log('  2. Glyph offset computation: char_code * 28 (0x1C), look for multiply/shift sequence');
console.log('  3. Parameters to 0x0A1799: what registers hold glyph pointer, dimensions, VRAM dest');
console.log('  4. Special char handling: CP instructions + conditional branches for control chars');
console.log('  5. Cursor update: writes to D00595 (curCol) or D00594 (curRow) after rendering');
