import fs from 'fs';
import { decodeInstruction } from './ez80-decoder.js';

const TARGET = 0x06B9E8;
const CALL_PATTERN = [0xCD, 0xE8, 0xB9, 0x06];
const MAX_INSTRUCTIONS = 50;

const rom = fs.readFileSync('TI-84_Plus_CE/ROM.rom');

function hex(value, width = 6) {
  return `0x${value.toString(16).toUpperCase().padStart(width, '0')}`;
}

function bytesAt(start, length) {
  return Array.from(rom.slice(start, start + length))
    .map(b => b.toString(16).padStart(2, '0').toUpperCase())
    .join(' ');
}

function formatInstruction(inst) {
  const h = (v, w) => hex(v, w);
  switch (inst.tag) {
    case 'nop': return 'NOP';
    case 'push': return `PUSH ${inst.pair?.toUpperCase() ?? 'AF'}`;
    case 'pop': return `POP ${inst.pair?.toUpperCase() ?? 'AF'}`;
    case 'di': return 'DI';
    case 'ei': return 'EI';
    case 'ret': return 'RET';
    case 'ret-conditional': return `RET ${inst.condition?.toUpperCase()}`;
    case 'call': return `CALL ${h(inst.target)}`;
    case 'call-conditional': return `CALL ${inst.condition?.toUpperCase()},${h(inst.target)}`;
    case 'jp': return `JP ${h(inst.target)}`;
    case 'jp-conditional': return `JP ${inst.condition?.toUpperCase()},${h(inst.target)}`;
    case 'jp-hl': return 'JP (HL)';
    case 'jr': return `JR ${h(inst.target)}`;
    case 'jr-conditional': return `JR ${inst.condition?.toUpperCase()},${h(inst.target)}`;
    case 'ld-reg-imm': return `LD ${(inst.dest ?? inst.reg)?.toUpperCase()},${h(inst.value, 2)}`;
    case 'ld-pair-imm': return `LD ${inst.pair?.toUpperCase()},${h(inst.value)}`;
    case 'ld-pair-mem': return `LD ${inst.pair?.toUpperCase()},(${h(inst.addr)})`;
    case 'ld-mem-pair': return `LD (${h(inst.addr)}),${inst.pair?.toUpperCase()}`;
    case 'ld-reg-reg': return `LD ${inst.dest?.toUpperCase()},${inst.src?.toUpperCase()}`;
    case 'ld-reg-ind': return `LD ${inst.dest?.toUpperCase()},(${inst.src?.toUpperCase()})`;
    case 'ld-ind-reg': return `LD (${inst.dest?.toUpperCase()}),${inst.src?.toUpperCase()}`;
    case 'ld-ind-imm': return `LD (${inst.dest?.toUpperCase()}),${h(inst.value, 2)}`;
    case 'ld-mem-a': return `LD (${h(inst.addr)}),A`;
    case 'ld-a-mem': return `LD A,(${h(inst.addr)})`;
    case 'cp-imm': return `CP ${h(inst.value, 2)}`;
    case 'cp-reg': return `CP ${inst.reg?.toUpperCase()}`;
    case 'and-imm': return `AND ${h(inst.value, 2)}`;
    case 'and-reg': return `AND ${inst.reg?.toUpperCase()}`;
    case 'or-imm': return `OR ${h(inst.value, 2)}`;
    case 'or-reg': return `OR ${inst.reg?.toUpperCase()}`;
    case 'or-a': return 'OR A';
    case 'xor-reg': return `XOR ${inst.reg?.toUpperCase()}`;
    case 'xor-imm': return `XOR ${h(inst.value, 2)}`;
    case 'add-reg': return `ADD A,${inst.reg?.toUpperCase()}`;
    case 'add-imm': return `ADD A,${h(inst.value, 2)}`;
    case 'sub-imm': return `SUB ${h(inst.value, 2)}`;
    case 'sub-reg': return `SUB ${inst.reg?.toUpperCase()}`;
    case 'inc-reg': return `INC ${inst.reg?.toUpperCase()}`;
    case 'dec-reg': return `DEC ${inst.reg?.toUpperCase()}`;
    case 'inc-pair': return `INC ${inst.pair?.toUpperCase()}`;
    case 'dec-pair': return `DEC ${inst.pair?.toUpperCase()}`;
    case 'add-pair': return `ADD HL,${inst.pair?.toUpperCase()}`;
    case 'sbc-pair': return `SBC HL,${(inst.src ?? inst.pair)?.toUpperCase()}`;
    case 'adc-pair': return `ADC HL,${(inst.src ?? inst.pair)?.toUpperCase()}`;
    case 'bit-test': return `BIT ${inst.bit},${inst.reg?.toUpperCase()}`;
    case 'bit-test-ind': return `BIT ${inst.bit},(HL)`;
    case 'bit-set': return `SET ${inst.bit},${inst.reg?.toUpperCase()}`;
    case 'bit-set-ind': return `SET ${inst.bit},(HL)`;
    case 'bit-res': return `RES ${inst.bit},${inst.reg?.toUpperCase()}`;
    case 'bit-res-ind': return `RES ${inst.bit},(HL)`;
    case 'im': return `IM ${inst.value ?? '?'}`;
    case 'out0': return `OUT0 (${h(inst.port, 2)}),${inst.reg?.toUpperCase() ?? 'A'}`;
    case 'in0': return `IN0 ${inst.reg?.toUpperCase() ?? 'A'},(${h(inst.port, 2)})`;
    case 'out-c': return `OUT (C),${inst.reg?.toUpperCase()}`;
    case 'in-c': return `IN ${inst.reg?.toUpperCase()},(C)`;
    case 'ex-de-hl': return 'EX DE,HL';
    case 'ex-af': return "EX AF,AF'";
    case 'exx': return 'EXX';
    case 'ex-sp-hl': return 'EX (SP),HL';
    case 'rlca': return 'RLCA';
    case 'rrca': return 'RRCA';
    case 'rla': return 'RLA';
    case 'rra': return 'RRA';
    case 'cpl': return 'CPL';
    case 'scf': return 'SCF';
    case 'ccf': return 'CCF';
    case 'daa': return 'DAA';
    case 'halt': return 'HALT';
    case 'rst': return `RST ${h(inst.target, 2)}`;
    case 'djnz': return `DJNZ ${h(inst.target)}`;
    case 'ldir': return 'LDIR';
    case 'lddr': return 'LDDR';
    case 'cpir': return 'CPIR';
    case 'cpdr': return 'CPDR';
    case 'ld-sp-hl': return 'LD SP,HL';
    case 'ld-i-a': return 'LD I,A';
    case 'ld-a-i': return 'LD A,I';
    case 'ld-r-a': return 'LD R,A';
    case 'ld-a-r': return 'LD A,R';
    case 'neg': return 'NEG';
    case 'reti': return 'RETI';
    case 'retn': return 'RETN';
    case 'rotate-reg': return `${inst.op?.toUpperCase()} ${inst.reg?.toUpperCase()}`;
    case 'rotate-ind': return `${inst.op?.toUpperCase()} (HL)`;
    case 'alu-reg': return `${inst.op?.toUpperCase()} A,${inst.src?.toUpperCase()}`;
    case 'alu-imm': return `${inst.op?.toUpperCase()} A,${h(inst.value, 2)}`;
    case 'alu-ind': return `${inst.op?.toUpperCase()} A,(HL)`;
    case 'stmix': return 'STMIX';
    case 'rsmix': return 'RSMIX';
    case 'ld-a-mb': return 'LD A,MB';
    case 'ld-mb-a': return 'LD MB,A';
    case 'slp': return 'SLP';
    case 'ld-ix-imm': return `LD IX,${h(inst.value)}`;
    case 'ld-iy-imm': return `LD IY,${h(inst.value)}`;
    case 'ld-ix-mem': return `LD IX,(${h(inst.addr)})`;
    case 'ld-iy-mem': return `LD IY,(${h(inst.addr)})`;
    case 'ld-mem-ix': return `LD (${h(inst.addr)}),IX`;
    case 'ld-mem-iy': return `LD (${h(inst.addr)}),IY`;
    case 'add-ix': return `ADD IX,${inst.pair?.toUpperCase()}`;
    case 'add-iy': return `ADD IY,${inst.pair?.toUpperCase()}`;
    case 'push-ix': return 'PUSH IX';
    case 'push-iy': return 'PUSH IY';
    case 'pop-ix': return 'POP IX';
    case 'pop-iy': return 'POP IY';
    case 'ld-ixd': return `LD (IX+${h(inst.offset, 2)}),${inst.src?.toUpperCase() ?? h(inst.value, 2)}`;
    case 'ld-iyd': return `LD (IY+${h(inst.offset, 2)}),${inst.src?.toUpperCase() ?? h(inst.value, 2)}`;
    case 'ld-from-ixd': return `LD ${inst.dest?.toUpperCase()},(IX+${h(inst.offset, 2)})`;
    case 'ld-from-iyd': return `LD ${inst.dest?.toUpperCase()},(IY+${h(inst.offset, 2)})`;
    case 'bit-test-ixd': return `BIT ${inst.bit},(IX+${h(inst.offset, 2)})`;
    case 'bit-test-iyd': return `BIT ${inst.bit},(IY+${h(inst.offset, 2)})`;
    case 'bit-set-ixd': return `SET ${inst.bit},(IX+${h(inst.offset, 2)})`;
    case 'bit-set-iyd': return `SET ${inst.bit},(IY+${h(inst.offset, 2)})`;
    case 'bit-res-ixd': return `RES ${inst.bit},(IX+${h(inst.offset, 2)})`;
    case 'bit-res-iyd': return `RES ${inst.bit},(IY+${h(inst.offset, 2)})`;
    default: return inst.tag ?? '???';
  }
}

function findCallers() {
  const callers = [];
  for (let addr = 0; addr <= rom.length - CALL_PATTERN.length; addr++) {
    if (rom[addr] === CALL_PATTERN[0] &&
        rom[addr + 1] === CALL_PATTERN[1] &&
        rom[addr + 2] === CALL_PATTERN[2] &&
        rom[addr + 3] === CALL_PATTERN[3]) {
      callers.push(addr);
    }
  }
  return callers;
}

function disassemble(startAddr, maxInstr) {
  const instructions = [];
  let pc = startAddr;

  for (let i = 0; i < maxInstr; i++) {
    if (pc >= rom.length) break;
    const instr = decodeInstruction(rom, pc, 'adl');
    instructions.push({ addr: pc, instr });
    pc += instr.length;

    if (instr.tag === 'ret') break;
  }

  return instructions;
}

// --- Main ---

console.log('Phase 544 probe: decode 0x06B9E8 — equation lookup for type 0x11 errors');
console.log(`ROM size: ${rom.length} bytes`);
console.log('Context: 0x03EBB0 error display — when type AND 0x3F == 0x11: POP AF, CALL 0x06B9E8, LD A,(HL)');
console.log('Known RAM: D005F8=OP1, D00603=OP2, D00080=IY base, D00813=error context');

// Decode 16 bytes before target to check if it's a true entry point
console.log(`\n--- Pre-context (16 bytes before ${hex(TARGET)}) ---`);
const preStart = TARGET - 16;
const preInstructions = disassemble(preStart, 10);
for (const { addr, instr } of preInstructions) {
  if (addr >= TARGET) break;
  const bytes = bytesAt(addr, instr.length);
  const asm = formatInstruction(instr);
  const marker = (instr.tag === 'ret' || instr.tag === 'jp') ? '  <-- boundary' : '';
  console.log(`  ${hex(addr)}: [${bytes}]  ${asm}${marker}`);
}

// Main disassembly
console.log(`\n--- Disassembly at ${hex(TARGET)} (up to ${MAX_INSTRUCTIONS} instructions) ---`);

const instructions = disassemble(TARGET, MAX_INSTRUCTIONS);
for (const { addr, instr } of instructions) {
  const bytes = bytesAt(addr, instr.length);
  const asm = formatInstruction(instr);

  // Annotate known RAM addresses
  let annotation = '';
  if (asm.includes('D005F8')) annotation = '  ; OP1';
  else if (asm.includes('D00603')) annotation = '  ; OP2';
  else if (asm.includes('D0060E')) annotation = '  ; OP3';
  else if (asm.includes('D00080')) annotation = '  ; IY base';
  else if (asm.includes('D00813')) annotation = '  ; error context';

  console.log(`  ${hex(addr)}: [${bytes}]  ${asm}${annotation}`);
}

console.log(`\nTotal instructions decoded: ${instructions.length}`);

// Xref scan
console.log(`\n--- Xref scan for CALL ${hex(TARGET)} (pattern CD E8 B9 06) ---`);
const callers = findCallers();
if (callers.length === 0) {
  console.log('  no callers found');
} else {
  for (const addr of callers) {
    console.log(`  ${hex(addr)} -> CALL ${hex(TARGET)}`);
  }
  console.log(`  Total callers: ${callers.length}`);
}

// Follow any CALL targets found in the function
const callTargets = instructions
  .filter(i => i.instr.tag === 'call' || i.instr.tag === 'call-conditional')
  .map(i => ({ addr: i.addr, target: i.instr.target }));

if (callTargets.length > 0) {
  console.log('\n--- Sub-calls made by this function ---');
  for (const { addr, target } of callTargets) {
    console.log(`\n  from ${hex(addr)} -> CALL ${hex(target)}:`);
    const subInstr = disassemble(target, 10);
    for (const { addr: sa, instr: si } of subInstr) {
      const bytes = bytesAt(sa, si.length);
      const asm = formatInstruction(si);
      console.log(`    ${hex(sa)}: [${bytes}]  ${asm}`);
    }
  }
}

// Semantic analysis
console.log('\n--- Semantic analysis ---');
const hasLdHLimm = instructions.some(i => i.instr.tag === 'ld-pair-imm' && i.instr.pair === 'hl');
const hasLdHLmem = instructions.some(i => i.instr.tag === 'ld-pair-mem' && i.instr.pair === 'hl');
const hasAddHL = instructions.some(i => i.instr.tag === 'add-pair');
const hasLdAHL = instructions.some(i => i.instr.tag === 'ld-reg-ind');
const hasAndImm = instructions.some(i => i.instr.tag === 'and-imm');
const hasShift = instructions.some(i => i.instr.tag === 'rotate-reg');
const tags = instructions.map(i => i.instr.tag);

console.log(`  LD HL,imm: ${hasLdHLimm} (loads table base)`);
console.log(`  LD HL,(mem): ${hasLdHLmem} (loads pointer from memory)`);
console.log(`  ADD HL,xx: ${hasAddHL} (index into table)`);
console.log(`  LD r,(HL): ${hasLdAHL} (dereference pointer)`);
console.log(`  AND imm: ${hasAndImm} (mask/type extraction)`);
console.log(`  Shift/rotate: ${hasShift} (multiply index)`);
console.log(`  All tags: ${tags.join(', ')}`);

if (hasLdHLimm && hasAddHL) {
  console.log('  => Likely table lookup: loads base address, adds computed offset, returns pointer in HL');
} else if (hasLdHLmem) {
  console.log('  => Loads pointer from RAM, likely indirect variable lookup');
}
