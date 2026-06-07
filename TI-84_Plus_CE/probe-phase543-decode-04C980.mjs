import fs from 'fs';
import { decodeInstruction } from './ez80-decoder.js';

const TARGET = 0x04C980;
const CALL_PATTERN = [0xCD, 0x80, 0xC9, 0x04];
const MAX_INSTRUCTIONS = 20;

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

function disassemble() {
  const instructions = [];
  let pc = TARGET;

  for (let i = 0; i < MAX_INSTRUCTIONS; i++) {
    const instr = decodeInstruction(rom, pc, 'adl');
    instructions.push({ addr: pc, instr });
    pc += instr.length;

    if (instr.tag === 'ret') {
      break;
    }
  }

  return instructions;
}

// --- Main ---

console.log('Phase 543 probe: decode 0x04C980 range check utility');
console.log(`ROM size: ${rom.length} bytes`);

console.log(`\nDisassembly at ${hex(TARGET)} (up to ${MAX_INSTRUCTIONS} instructions, stops at RET):`);

const instructions = disassemble();
for (const { addr, instr } of instructions) {
  const bytes = bytesAt(addr, instr.length);
  const asm = formatInstruction(instr);
  console.log(`  ${hex(addr)}: [${bytes}]  ${asm}`);
}

console.log(`\nCaller scan for CALL 0x04C980 (pattern CD 80 C9 04):`);
const callers = findCallers();
if (callers.length === 0) {
  console.log('  no callers found');
} else {
  for (const addr of callers) {
    console.log(`  ${hex(addr)} -> CALL ${hex(TARGET)}`);
  }
}

// Semantic analysis based on decoded tags
const hasOrA = instructions.some(i => i.instr.tag === 'alu-reg' && i.instr.op === 'or' && i.instr.src === 'a');
const hasSbcHL = instructions.some(i => i.instr.tag === 'sbc-pair');
const hasCCF = instructions.some(i => i.instr.tag === 'ccf');
const hasRet = instructions.some(i => i.instr.tag === 'ret');

console.log('\nSemantic analysis:');
console.log(`  OR A present: ${hasOrA} (clears carry before SBC)`);
console.log(`  SBC HL,xx present: ${hasSbcHL} (subtract with borrow for range comparison)`);
console.log(`  CCF present: ${hasCCF} (complement carry flag — inverts in-range/out-of-range sense)`);
console.log(`  RET present: ${hasRet}`);

if (hasOrA && hasSbcHL && hasCCF) {
  console.log('  => Range check: OR A clears carry, SBC HL subtracts bound, CCF inverts carry for caller contract.');
}
