import fs from 'fs';
import { decodeInstruction } from './ez80-decoder.js';

const TARGET = 0x0802BB;
const CALL_PATTERN = [0xCD, 0xBB, 0x02, 0x08];
const MAX_INSTRUCTIONS = 50;

const rom = fs.readFileSync('TI-84_Plus_CE/ROM.rom');

// Known RAM addresses for annotation
const RAM_NAMES = {
  0xD005F8: 'OP1',
  0xD00603: 'OP2',
  0xD0060E: 'OP3',
  0xD00619: 'OP4',
  0xD00624: 'OP5',
  0xD00596: 'displayCounter',
  0xD00813: 'errorContext',
  0xD0081C: 'errorType',
  0xD008DF: 'errorCode',
  0xD00080: 'IY_base',
};

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
    case 'ex-af': return 'EX AF,AF';
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
    case 'push-ix': return 'PUSH IX';
    case 'push-iy': return 'PUSH IY';
    case 'pop-ix': return 'POP IX';
    case 'pop-iy': return 'POP IY';
    case 'add-ix': return `ADD IX,${inst.pair?.toUpperCase()}`;
    case 'add-iy': return `ADD IY,${inst.pair?.toUpperCase()}`;
    case 'ld-ix-offset': return `LD ${inst.dest?.toUpperCase()},(IX+${h(inst.offset, 2)})`;
    case 'ld-iy-offset': return `LD ${inst.dest?.toUpperCase()},(IY+${h(inst.offset, 2)})`;
    case 'st-ix-offset': return `LD (IX+${h(inst.offset, 2)}),${inst.src?.toUpperCase()}`;
    case 'st-iy-offset': return `LD (IY+${h(inst.offset, 2)}),${inst.src?.toUpperCase()}`;
    case 'bit-test-ix': return `BIT ${inst.bit},(IX+${h(inst.offset, 2)})`;
    case 'bit-test-iy': return `BIT ${inst.bit},(IY+${h(inst.offset, 2)})`;
    case 'bit-set-ix': return `SET ${inst.bit},(IX+${h(inst.offset, 2)})`;
    case 'bit-set-iy': return `SET ${inst.bit},(IY+${h(inst.offset, 2)})`;
    case 'bit-res-ix': return `RES ${inst.bit},(IX+${h(inst.offset, 2)})`;
    case 'bit-res-iy': return `RES ${inst.bit},(IY+${h(inst.offset, 2)})`;
    default: return inst.tag ?? '???';
  }
}

function annotateAddr(addr) {
  return RAM_NAMES[addr] ? ` [${RAM_NAMES[addr]}]` : '';
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
    const instr = decodeInstruction(rom, pc, 'adl');
    instructions.push({ addr: pc, instr });
    pc += instr.length;

    if (instr.tag === 'ret' || instr.tag === 'reti' || instr.tag === 'retn') {
      break;
    }
    // Stop on unconditional JP (tail call / end of routine)
    if (instr.tag === 'jp') {
      break;
    }
  }

  return instructions;
}

// --- Main ---

console.log('Phase 545 probe: decode 0x0802BB string display routine');
console.log(`ROM size: ${rom.length} bytes`);
console.log('Context: string display routine in FPU/OP subsystem area');
console.log('  Known callers: 0x029911, 0x029933, 0x03DF64, 0x03E9E8');
console.log('  Called from 0x03E9D4 (extended error detail handler)');

console.log(`\n=== Disassembly at ${hex(TARGET)} (up to ${MAX_INSTRUCTIONS} instructions, stops at RET/JP) ===`);

const instructions = disassemble(TARGET, MAX_INSTRUCTIONS);
for (const { addr, instr } of instructions) {
  const bytes = bytesAt(addr, instr.length);
  const asm = formatInstruction(instr);
  // Annotate known RAM addresses
  let note = '';
  if (instr.addr !== undefined) note += annotateAddr(instr.addr);
  if (instr.target !== undefined && instr.target !== instr.addr) note += annotateAddr(instr.target);
  if (instr.value !== undefined && instr.value > 0xD00000) note += annotateAddr(instr.value);
  console.log(`  ${hex(addr)}: [${bytes.padEnd(20)}]  ${asm}${note}`);
}

console.log(`\n=== Caller scan for CALL ${hex(TARGET)} (pattern CD BB 02 08) ===`);
const callers = findCallers();
if (callers.length === 0) {
  console.log('  no callers found');
} else {
  console.log(`  ${callers.length} caller(s):`);
  for (const addr of callers) {
    console.log(`  ${hex(addr)} -> CALL ${hex(TARGET)}`);
  }
}

// Analyze call targets within this function
console.log('\n=== Internal call/jump targets ===');
const callTargets = [];
for (const { addr, instr } of instructions) {
  if (instr.tag === 'call' || instr.tag === 'call-conditional') {
    callTargets.push({ from: addr, target: instr.target, type: 'CALL' });
  }
  if (instr.tag === 'jp' || instr.tag === 'jp-conditional') {
    callTargets.push({ from: addr, target: instr.target, type: 'JP' });
  }
  if (instr.tag === 'jr' || instr.tag === 'jr-conditional') {
    callTargets.push({ from: addr, target: instr.target, type: 'JR' });
  }
}
if (callTargets.length === 0) {
  console.log('  none');
} else {
  for (const { from, target, type } of callTargets) {
    console.log(`  ${hex(from)}: ${type} -> ${hex(target)}`);
  }
}

// Semantic analysis
console.log('\n=== Semantic analysis ===');

const memReads = instructions.filter(i => i.instr.tag === 'ld-a-mem');
const memWrites = instructions.filter(i => i.instr.tag === 'ld-mem-a' || i.instr.tag === 'ld-mem-pair');
const compares = instructions.filter(i => i.instr.tag === 'cp-imm' || i.instr.tag === 'cp-reg');
const branches = instructions.filter(i =>
  i.instr.tag === 'jr-conditional' || i.instr.tag === 'jp-conditional' ||
  i.instr.tag === 'call-conditional' || i.instr.tag === 'ret-conditional'
);

console.log(`  Memory reads (LD A,(addr)): ${memReads.length}`);
for (const { addr, instr } of memReads) {
  console.log(`    ${hex(addr)}: LD A,(${hex(instr.addr)})${annotateAddr(instr.addr)}`);
}

console.log(`  Memory writes: ${memWrites.length}`);
for (const { addr, instr } of memWrites) {
  const target = instr.addr;
  console.log(`    ${hex(addr)}: ${formatInstruction(instr)}${annotateAddr(target)}`);
}

console.log(`  Comparisons: ${compares.length}`);
for (const { addr, instr } of compares) {
  console.log(`    ${hex(addr)}: ${formatInstruction(instr)}`);
}

console.log(`  Conditional branches: ${branches.length}`);
for (const { addr, instr } of branches) {
  console.log(`    ${hex(addr)}: ${formatInstruction(instr)}`);
}

console.log(`\nTotal instructions decoded: ${instructions.length}`);
const lastInstr = instructions[instructions.length - 1];
console.log(`Function ends at: ${hex(lastInstr.addr + lastInstr.instr.length)}`);
console.log(`Function size: ${lastInstr.addr + lastInstr.instr.length - TARGET} bytes`);
