import { readFileSync } from 'fs';
const rom = readFileSync('TI-84_Plus_CE/ROM.rom');

const POPULATOR = 0x07d583;
const CALL_SITES = [0x044db3, 0x0633f6, 0x06de0e, 0x06e168, 0x0b3540];
const CURSOR_ROOTS = [0x0b9473];

const known = new Map([
  [POPULATOR, 'populator_07D583'],
  [0x0b9473, 'cursor_init_root_0B9473'],
]);

function hex(value, width = 6) {
  return `0x${value.toString(16).toUpperCase().padStart(width, '0')}`;
}

function b(addr) {
  return rom[addr] ?? 0;
}

function u16(addr) {
  return b(addr) | (b(addr + 1) << 8);
}

function u24(addr) {
  return b(addr) | (b(addr + 1) << 8) | (b(addr + 2) << 16);
}

function signed8(value) {
  return value & 0x80 ? value - 0x100 : value;
}

function knownName(addr) {
  return known.has(addr) ? ` <${known.get(addr)}>` : '';
}

function bytesAt(addr, len) {
  return Array.from(rom.subarray(addr, addr + len), x => x.toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

function isRam24(addr) {
  return addr >= 0xd00000 || (addr >= 0xd00000 && addr <= 0xffffff);
}

function isProbablyCodeBoundary(addr) {
  const op = b(addr);
  if (op === 0xc9 || op === 0xd9 || op === 0xed && b(addr + 1) === 0x45) return true;
  if (op === 0xc3 || op === 0xcd) return true;
  return false;
}

function decodeCB(addr, prefix = '') {
  const op = b(addr + 1);
  const group = op >> 6;
  const bit = (op >> 3) & 7;
  const reg = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'][op & 7];
  const names = [
    ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'][bit],
    `BIT ${bit}`,
    `RES ${bit}`,
    `SET ${bit}`,
  ];
  return { len: 2, text: `${names[group]} ${prefix}${reg}`.trim(), kind: group === 1 ? 'read' : 'write' };
}

function decodeED(addr) {
  const op = b(addr + 1);
  const imm = u24(addr + 2);
  if (op === 0x45) return { len: 2, text: 'RETN', terminator: true };
  if (op === 0x4d) return { len: 2, text: 'RETI', terminator: true };
  if (op === 0x5b) return { len: 5, text: `LD DE,(${hex(imm)})`, ramRead: imm };
  if (op === 0x7b) return { len: 5, text: `LD SP,(${hex(imm)})`, ramRead: imm };
  if (op === 0x43) return { len: 5, text: `LD (${hex(imm)}),BC`, ramWrite: imm };
  if (op === 0x53) return { len: 5, text: `LD (${hex(imm)}),DE`, ramWrite: imm };
  if (op === 0x63) return { len: 5, text: `LD (${hex(imm)}),HL`, ramWrite: imm };
  if (op === 0x73) return { len: 5, text: `LD (${hex(imm)}),SP`, ramWrite: imm };
  if ([0xa0, 0xa8, 0xb0, 0xb8].includes(op)) return { len: 2, text: ['LDI', 'LDD', 'LDIR', 'LDDR'][[0xa0, 0xa8, 0xb0, 0xb8].indexOf(op)] };
  if ([0xa1, 0xa9, 0xb1, 0xb9].includes(op)) return { len: 2, text: ['CPI', 'CPD', 'CPIR', 'CPDR'][[0xa1, 0xa9, 0xb1, 0xb9].indexOf(op)] };
  return { len: 2, text: `ED ${op.toString(16).toUpperCase().padStart(2, '0')}` };
}

function decodeIndexed(addr, prefixByte) {
  const r = prefixByte === 0xdd ? 'IX' : 'IY';
  const op = b(addr + 1);
  if (op === 0x21) return { len: 5, text: `LD ${r},${hex(u24(addr + 2))}` };
  if (op === 0x22) {
    const imm = u24(addr + 2);
    return { len: 5, text: `LD (${hex(imm)}),${r}`, ramWrite: imm };
  }
  if (op === 0x2a) {
    const imm = u24(addr + 2);
    return { len: 5, text: `LD ${r},(${hex(imm)})`, ramRead: imm };
  }
  if (op === 0x36) return { len: 4, text: `LD (${r}${signed8(b(addr + 2)) >= 0 ? '+' : ''}${signed8(b(addr + 2))}),${hex(b(addr + 3), 2)}` };
  if (op === 0xcb) {
    const disp = signed8(b(addr + 2));
    const cb = b(addr + 3);
    const group = cb >> 6;
    const bit = (cb >> 3) & 7;
    const action = group === 1 ? `BIT ${bit}` : group === 2 ? `RES ${bit}` : group === 3 ? `SET ${bit}` : ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'][bit];
    return { len: 4, text: `${action} (${r}${disp >= 0 ? '+' : ''}${disp})` };
  }
  if ([0x7e, 0x77, 0x46, 0x70, 0x71, 0x72, 0x73, 0x74, 0x75].includes(op)) {
    return { len: 3, text: `indexed ${r} op ${hex(op, 2)} disp ${signed8(b(addr + 2))}` };
  }
  return { len: 2, text: `${r} prefix ${hex(op, 2)}` };
}

function decode(addr) {
  const op = b(addr);
  const imm24 = () => u24(addr + 1);
  const imm16 = () => u16(addr + 1);
  const rel = () => addr + 2 + signed8(b(addr + 1));
  const simple = {
    0x00: 'NOP', 0x02: 'LD (BC),A', 0x03: 'INC BC', 0x04: 'INC B', 0x05: 'DEC B', 0x07: 'RLCA',
    0x08: 'EX AF,AF\'', 0x09: 'ADD HL,BC', 0x0a: 'LD A,(BC)', 0x0b: 'DEC BC', 0x0c: 'INC C', 0x0d: 'DEC C', 0x0f: 'RRCA',
    0x12: 'LD (DE),A', 0x13: 'INC DE', 0x14: 'INC D', 0x15: 'DEC D', 0x17: 'RLA', 0x19: 'ADD HL,DE',
    0x1a: 'LD A,(DE)', 0x1b: 'DEC DE', 0x1c: 'INC E', 0x1d: 'DEC E', 0x1f: 'RRA',
    0x23: 'INC HL', 0x24: 'INC H', 0x25: 'DEC H', 0x27: 'DAA', 0x29: 'ADD HL,HL', 0x2b: 'DEC HL', 0x2c: 'INC L', 0x2d: 'DEC L', 0x2f: 'CPL',
    0x33: 'INC SP', 0x34: 'INC (HL)', 0x35: 'DEC (HL)', 0x37: 'SCF', 0x39: 'ADD HL,SP', 0x3a: `LD A,(${hex(imm24())})`, 0x3b: 'DEC SP', 0x3c: 'INC A', 0x3d: 'DEC A', 0x3f: 'CCF',
    0x76: 'HALT', 0x7e: 'LD A,(HL)', 0x77: 'LD (HL),A', 0xaf: 'XOR A', 0xc0: 'RET NZ', 0xc8: 'RET Z', 0xc9: 'RET', 0xd0: 'RET NC', 0xd8: 'RET C', 0xe9: 'JP (HL)', 0xf3: 'DI', 0xfb: 'EI',
  };
  if (op in simple) {
    const len = op === 0x3a ? 4 : 1;
    return { len, text: simple[op], terminator: op === 0xc9 || op === 0xe9, ramRead: op === 0x3a ? imm24() : undefined };
  }
  if (op === 0x01) return { len: 4, text: `LD BC,${hex(imm24())}` };
  if (op === 0x06) return { len: 2, text: `LD B,${hex(b(addr + 1), 2)}` };
  if (op === 0x0e) return { len: 2, text: `LD C,${hex(b(addr + 1), 2)}` };
  if (op === 0x11) return { len: 4, text: `LD DE,${hex(imm24())}` };
  if (op === 0x16) return { len: 2, text: `LD D,${hex(b(addr + 1), 2)}` };
  if (op === 0x18) return { len: 2, text: `JR ${hex(rel())}`, branch: rel() };
  if (op === 0x1e) return { len: 2, text: `LD E,${hex(b(addr + 1), 2)}` };
  if (op === 0x20) return { len: 2, text: `JR NZ,${hex(rel())}`, branch: rel(), condition: 'NZ' };
  if (op === 0x21) return { len: 4, text: `LD HL,${hex(imm24())}` };
  if (op === 0x22) return { len: 4, text: `LD (${hex(imm24())}),HL`, ramWrite: imm24() };
  if (op === 0x26) return { len: 2, text: `LD H,${hex(b(addr + 1), 2)}` };
  if (op === 0x28) return { len: 2, text: `JR Z,${hex(rel())}`, branch: rel(), condition: 'Z' };
  if (op === 0x2a) return { len: 4, text: `LD HL,(${hex(imm24())})`, ramRead: imm24() };
  if (op === 0x2e) return { len: 2, text: `LD L,${hex(b(addr + 1), 2)}` };
  if (op === 0x30) return { len: 2, text: `JR NC,${hex(rel())}`, branch: rel(), condition: 'NC' };
  if (op === 0x31) return { len: 4, text: `LD SP,${hex(imm24())}` };
  if (op === 0x32) return { len: 4, text: `LD (${hex(imm24())}),A`, ramWrite: imm24() };
  if (op === 0x36) return { len: 2, text: `LD (HL),${hex(b(addr + 1), 2)}` };
  if (op === 0x38) return { len: 2, text: `JR C,${hex(rel())}`, branch: rel(), condition: 'C' };
  if (op === 0x3e) return { len: 2, text: `LD A,${hex(b(addr + 1), 2)}` };
  if (op === 0x40) return { len: 2, text: `.SIS ${hex(b(addr + 1), 2)}` };
  if (op === 0xc2) return { len: 4, text: `JP NZ,${hex(imm24())}${knownName(imm24())}`, branch: imm24(), condition: 'NZ' };
  if (op === 0xc3) return { len: 4, text: `JP ${hex(imm24())}${knownName(imm24())}`, branch: imm24(), terminator: true };
  if (op === 0xc4) return { len: 4, text: `CALL NZ,${hex(imm24())}${knownName(imm24())}`, call: imm24(), condition: 'NZ' };
  if (op === 0xc6) return { len: 2, text: `ADD A,${hex(b(addr + 1), 2)}` };
  if (op === 0xca) return { len: 4, text: `JP Z,${hex(imm24())}${knownName(imm24())}`, branch: imm24(), condition: 'Z' };
  if (op === 0xcb) return decodeCB(addr);
  if (op === 0xcc) return { len: 4, text: `CALL Z,${hex(imm24())}${knownName(imm24())}`, call: imm24(), condition: 'Z' };
  if (op === 0xcd) return { len: 4, text: `CALL ${hex(imm24())}${knownName(imm24())}`, call: imm24() };
  if (op === 0xce) return { len: 2, text: `ADC A,${hex(b(addr + 1), 2)}` };
  if (op === 0xd2) return { len: 4, text: `JP NC,${hex(imm24())}${knownName(imm24())}`, branch: imm24(), condition: 'NC' };
  if (op === 0xd4) return { len: 4, text: `CALL NC,${hex(imm24())}${knownName(imm24())}`, call: imm24(), condition: 'NC' };
  if (op === 0xd6) return { len: 2, text: `SUB ${hex(b(addr + 1), 2)}` };
  if (op === 0xda) return { len: 4, text: `JP C,${hex(imm24())}${knownName(imm24())}`, branch: imm24(), condition: 'C' };
  if (op === 0xdc) return { len: 4, text: `CALL C,${hex(imm24())}${knownName(imm24())}`, call: imm24(), condition: 'C' };
  if (op === 0xdd || op === 0xfd) return decodeIndexed(addr, op);
  if (op === 0xde) return { len: 2, text: `SBC A,${hex(b(addr + 1), 2)}` };
  if (op === 0xe6) return { len: 2, text: `AND ${hex(b(addr + 1), 2)}` };
  if (op === 0xed) return decodeED(addr);
  if (op === 0xee) return { len: 2, text: `XOR ${hex(b(addr + 1), 2)}` };
  if (op === 0xf6) return { len: 2, text: `OR ${hex(b(addr + 1), 2)}` };
  if (op === 0xfe) return { len: 2, text: `CP ${hex(b(addr + 1), 2)}` };
  if (op >= 0x40 && op <= 0x7f) {
    const regs = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
    return { len: 1, text: `LD ${regs[(op >> 3) & 7]},${regs[op & 7]}` };
  }
  if (op >= 0x80 && op <= 0xbf) {
    const regs = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
    const ops = ['ADD A', 'ADC A', 'SUB', 'SBC A', 'AND', 'XOR', 'OR', 'CP'];
    return { len: 1, text: `${ops[(op >> 3) & 7]} ${regs[op & 7]}` };
  }
  return { len: 1, text: `DB ${hex(op, 2)}`, unknown: true };
}

function linearDecode(start, end) {
  const out = [];
  for (let pc = start; pc < end;) {
    const ins = decode(pc);
    out.push({ addr: pc, bytes: bytesAt(pc, ins.len), ...ins });
    pc += Math.max(1, ins.len);
  }
  return out;
}

function scoreStart(addr, callSite) {
  let score = 0;
  const first = b(addr);
  if ([0xf5, 0xc5, 0xd5, 0xe5, 0xdd, 0xfd, 0x21, 0x3a, 0xaf, 0xcd].includes(first)) score += 2;
  if (addr % 4 === 0 || addr % 8 === 0 || addr % 16 === 0) score += 1;
  const decoded = linearDecode(addr, Math.min(callSite + 12, addr + 260));
  const reaches = decoded.some(x => x.addr === callSite);
  const unknowns = decoded.filter(x => x.unknown).length;
  const calls = decoded.filter(x => x.call).length;
  const terminatorsBefore = decoded.filter(x => x.addr < callSite && x.terminator).length;
  if (reaches) score += 10;
  score += Math.min(calls, 4);
  score -= unknowns * 2;
  score -= terminatorsBefore * 8;
  return { addr, score, decoded };
}

function findFunctionStart(callSite) {
  const candidates = [];
  const min = Math.max(0, callSite - 220);
  for (let addr = min; addr < callSite; addr++) {
    if (addr === min || isProbablyCodeBoundary(addr - 1) || b(addr) === 0xf5 || b(addr) === 0xc5 || b(addr) === 0xd5 || b(addr) === 0xe5) {
      candidates.push(scoreStart(addr, callSite));
    }
  }
  candidates.sort((a, b) => b.score - a.score || b.addr - a.addr);
  return candidates[0]?.addr ?? Math.max(0, callSite - 96);
}

function decodeFunction(callSite) {
  const start = findFunctionStart(callSite);
  const decoded = [];
  const calls = [];
  const ramReads = [];
  const ramWrites = [];
  let populatorCondition = 'unconditional fall-through';
  for (let pc = start; pc < Math.min(rom.length, start + 240);) {
    const ins = decode(pc);
    decoded.push({ addr: pc, bytes: bytesAt(pc, ins.len), ...ins });
    if (ins.call !== undefined) {
      calls.push({ at: pc, target: ins.call, condition: ins.condition ?? 'always' });
      if (ins.call === POPULATOR) populatorCondition = ins.condition ? `CALL ${ins.condition}` : 'CALL always';
    }
    if (ins.ramRead !== undefined) ramReads.push({ at: pc, addr: ins.ramRead });
    if (ins.ramWrite !== undefined) ramWrites.push({ at: pc, addr: ins.ramWrite });
    pc += Math.max(1, ins.len);
    if (pc > callSite + 32 && ins.terminator) break;
  }
  return { start, decoded, calls, ramReads, ramWrites, populatorCondition };
}

function classifyPurpose(fn) {
  const callTargets = new Set(fn.calls.map(c => c.target));
  const writes = new Set(fn.ramWrites.map(x => x.addr));
  const reads = new Set(fn.ramReads.map(x => x.addr));
  const hasPopulator = callTargets.has(POPULATOR);
  const hasDisplayRam = [...writes, ...reads].some(a => a >= 0xd00000 || a >= 0xe00000);
  const hasCursorRoot = CURSOR_ROOTS.some(a => callTargets.has(a));
  if (hasCursorRoot) return 'Cursor initialization related wrapper; verify manually because it directly calls a cursor root.';
  if (hasPopulator && hasDisplayRam) return 'State/display preparation wrapper that touches RAM and then invokes the 0x07D583 populator.';
  if (hasPopulator) return 'Populator dispatch wrapper; it sets registers/flags and delegates to 0x07D583.';
  return 'Decoded containing function; no direct populator call found in selected range.';
}

function relationToCursor(fn) {
  const direct = fn.calls.filter(c => CURSOR_ROOTS.includes(c.target));
  const inRange = fn.start >= 0x0b0000 && fn.start < 0x0c0000;
  if (direct.length) return `DIRECT cursor-root call at ${direct.map(c => hex(c.at)).join(', ')}`;
  if (inRange) return 'Same 0x0B ROM bank neighborhood as cursor code, but no direct call to 0x0B9473 in decoded function.';
  return 'No direct cursor-root call and outside the 0x0B cursor-code neighborhood.';
}

function printFunction(callSite) {
  const fn = decodeFunction(callSite);
  console.log('\n' + '='.repeat(88));
  console.log(`Populator call site ${hex(callSite)} inside function starting near ${hex(fn.start)}`);
  console.log(`Purpose: ${classifyPurpose(fn)}`);
  console.log(`Populator condition: ${fn.populatorCondition}`);
  console.log(`Cursor relationship: ${relationToCursor(fn)}`);
  console.log('Calls:');
  for (const c of fn.calls) console.log(`  ${hex(c.at)} -> ${hex(c.target)}${knownName(c.target)} [${c.condition}]`);
  if (!fn.calls.length) console.log('  none decoded');
  console.log('RAM reads:');
  for (const r of fn.ramReads) console.log(`  ${hex(r.at)} reads ${hex(r.addr)}`);
  if (!fn.ramReads.length) console.log('  none decoded as absolute RAM reads');
  console.log('RAM writes:');
  for (const w of fn.ramWrites) console.log(`  ${hex(w.at)} writes ${hex(w.addr)}`);
  if (!fn.ramWrites.length) console.log('  none decoded as absolute RAM writes');
  console.log('Decoded instructions:');
  for (const ins of fn.decoded) {
    const marker = ins.addr === callSite ? ' <-- POPULATOR CALL SITE' : '';
    console.log(`  ${hex(ins.addr)}  ${ins.bytes.padEnd(15)}  ${ins.text}${marker}`);
  }
}

console.log('Phase 513 populator-site decoder');
console.log(`ROM bytes: ${rom.length}`);
console.log(`Target populator: ${hex(POPULATOR)}`);
console.log(`Known call sites: ${CALL_SITES.map(x => hex(x)).join(', ')}`);
console.log('Cursor init root checked for direct calls: 0x0B9473');

for (const site of CALL_SITES) {
  const pattern = bytesAt(site, 4);
  const expected = `CD 83 D5 07`;
  if (pattern !== expected) {
    console.log(`\nWARNING: ${hex(site)} bytes are ${pattern}, expected ${expected}`);
  }
  printFunction(site);
}

console.log('\nSummary:');
console.log('- Each listed site was decoded from an inferred containing-function entry point.');
console.log('- Cursor-tree verification here checks direct calls to 0x0B9473 in each decoded function; indirect membership needs graph/session data.');
console.log('- 0x0B3540 receives extra attention through the same full function decode and cursor-neighborhood classification.');
