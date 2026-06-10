import { readFileSync } from 'fs';
import { decodeInstruction } from './ez80-decoder.js';

const ROM_PATH = 'TI-84_Plus_CE/ROM.rom';
const IY_BASE = 0xD00080;
const START = 0x08F3B8;
const END = 0x08F460;

const rom = readFileSync(ROM_PATH);

const hexByte = (v) => v.toString(16).padStart(2, '0');
const hexAddr = (v) => `0x${(v >>> 0).toString(16).padStart(6, '0')}`;
const hexVal = (v, w = 2) => `0x${v.toString(16).padStart(w, '0')}`;

// Format a decoded instruction object into human-readable text
function formatInstruction(instr) {
  const tag = instr.tag;

  const simpleNames = {
    'nop': 'NOP', 'ret': 'RET', 'reti': 'RETI', 'retn': 'RETN', 'halt': 'HALT',
    'di': 'DI', 'ei': 'EI', 'exx': 'EXX', 'daa': 'DAA', 'cpl': 'CPL',
    'scf': 'SCF', 'ccf': 'CCF', 'rlca': 'RLCA', 'rrca': 'RRCA', 'rla': 'RLA',
    'rra': 'RRA', 'neg': 'NEG', 'ex-af': "EX AF, AF'", 'ex-de-hl': 'EX DE, HL',
    'ex-sp-hl': 'EX (SP), HL', 'ld-sp-hl': 'LD SP, HL',
    'rrd': 'RRD', 'rld': 'RLD',
    'ldi': 'LDI', 'ldir': 'LDIR', 'ldd': 'LDD', 'lddr': 'LDDR',
    'cpi': 'CPI', 'cpir': 'CPIR', 'cpd': 'CPD', 'cpdr': 'CPDR',
    'ini': 'INI', 'inir': 'INIR', 'ind': 'IND', 'indr': 'INDR',
    'outi': 'OUTI', 'otir': 'OTIR', 'outd': 'OUTD', 'otdr': 'OTDR',
  };
  if (simpleNames[tag]) return simpleNames[tag];

  if (tag === 'ld-reg-reg') return `LD ${instr.dest.toUpperCase()}, ${instr.src.toUpperCase()}`;
  if (tag === 'ld-reg-imm') return `LD ${instr.dest.toUpperCase()}, ${hexVal(instr.value)}`;
  if (tag === 'ld-pair-imm') return `LD ${instr.pair.toUpperCase()}, ${hexVal(instr.value, 6)}`;
  if (tag === 'ld-ind-reg') return `LD (${instr.dest.toUpperCase()}), ${instr.src.toUpperCase()}`;
  if (tag === 'ld-reg-ind') return `LD ${instr.dest.toUpperCase()}, (${instr.src.toUpperCase()})`;
  if (tag === 'ld-mem-reg') return `LD (${hexVal(instr.addr, 6)}), ${instr.src.toUpperCase()}`;
  if (tag === 'ld-reg-mem') return `LD ${instr.dest.toUpperCase()}, (${hexVal(instr.addr, 6)})`;
  if (tag === 'ld-pair-mem') {
    if (instr.direction === 'from-mem') return `LD ${instr.pair.toUpperCase()}, (${hexVal(instr.addr, 6)})`;
    return `LD (${hexVal(instr.addr, 6)}), ${instr.pair.toUpperCase()}`;
  }
  if (tag === 'ld-mem-pair') return `LD (${hexVal(instr.addr, 6)}), ${instr.pair.toUpperCase()}`;
  if (tag === 'ld-sp-pair') return `LD SP, ${instr.pair.toUpperCase()}`;
  if (tag === 'ex-sp-pair') return `EX (SP), ${instr.pair.toUpperCase()}`;
  if (tag === 'ed-ld-pair-mem') return `LD ${instr.pair.toUpperCase()}, (${hexVal(instr.addr, 6)})`;
  if (tag === 'ed-ld-mem-pair') return `LD (${hexVal(instr.addr, 6)}), ${instr.pair.toUpperCase()}`;

  const dispStr = (reg, d) => {
    const sign = d >= 0 ? '+' : '';
    return `(${reg.toUpperCase()}${sign}${d})`;
  };
  if (tag === 'ld-reg-ixd') return `LD ${instr.dest.toUpperCase()}, ${dispStr(instr.indexRegister, instr.displacement)}`;
  if (tag === 'ld-ixd-reg') return `LD ${dispStr(instr.indexRegister, instr.displacement)}, ${instr.src.toUpperCase()}`;
  if (tag === 'ld-ixd-imm') return `LD ${dispStr(instr.indexRegister, instr.displacement)}, ${hexVal(instr.value)}`;
  if (tag === 'ld-pair-indexed') return `LD ${instr.pair.toUpperCase()}, ${dispStr(instr.indexRegister, instr.displacement)}`;
  if (tag === 'ld-indexed-pair') return `LD ${dispStr(instr.indexRegister, instr.displacement)}, ${instr.pair.toUpperCase()}`;
  if (tag === 'ld-ixiy-indexed') return `LD ${instr.dest.toUpperCase()}, ${dispStr(instr.indexRegister, instr.displacement)}`;
  if (tag === 'ld-indexed-ixiy') return `LD ${dispStr(instr.indexRegister, instr.displacement)}, ${instr.src.toUpperCase()}`;

  if (tag === 'inc-reg') return `INC ${instr.reg.toUpperCase()}`;
  if (tag === 'dec-reg') return `DEC ${instr.reg.toUpperCase()}`;
  if (tag === 'inc-pair') return `INC ${instr.pair.toUpperCase()}`;
  if (tag === 'dec-pair') return `DEC ${instr.pair.toUpperCase()}`;
  if (tag === 'inc-ixd') return `INC ${dispStr(instr.indexRegister, instr.displacement)}`;
  if (tag === 'dec-ixd') return `DEC ${dispStr(instr.indexRegister, instr.displacement)}`;

  if (tag === 'alu-reg') return `${instr.op.toUpperCase()} A, ${instr.src.toUpperCase()}`;
  if (tag === 'alu-imm') return `${instr.op.toUpperCase()} A, ${hexVal(instr.value)}`;
  if (tag === 'alu-ixd') return `${instr.op.toUpperCase()} A, ${dispStr(instr.indexRegister, instr.displacement)}`;
  if (tag === 'add-pair') return `ADD ${instr.dest.toUpperCase()}, ${instr.src.toUpperCase()}`;
  if (tag === 'sbc-pair') return `SBC HL, ${instr.src.toUpperCase()}`;
  if (tag === 'adc-pair') return `ADC HL, ${instr.src.toUpperCase()}`;

  if (tag === 'jp') return `JP ${hexVal(instr.target, 6)}`;
  if (tag === 'jp-conditional') return `JP ${instr.condition.toUpperCase()}, ${hexVal(instr.target, 6)}`;
  if (tag === 'jp-indirect') return `JP (${instr.indirectRegister.toUpperCase()})`;
  if (tag === 'jr') return `JR ${hexVal(instr.target, 6)}`;
  if (tag === 'jr-conditional') return `JR ${instr.condition.toUpperCase()}, ${hexVal(instr.target, 6)}`;
  if (tag === 'djnz') return `DJNZ ${hexVal(instr.target, 6)}`;
  if (tag === 'call') return `CALL ${hexVal(instr.target, 6)}`;
  if (tag === 'call-conditional') return `CALL ${instr.condition.toUpperCase()}, ${hexVal(instr.target, 6)}`;
  if (tag === 'ret-conditional') return `RET ${instr.condition.toUpperCase()}`;
  if (tag === 'rst') return `RST ${hexVal(instr.target)}`;

  if (tag === 'push') return `PUSH ${instr.pair.toUpperCase()}`;
  if (tag === 'pop') return `POP ${instr.pair.toUpperCase()}`;

  if (tag === 'bit-test') return `BIT ${instr.bit}, ${instr.reg.toUpperCase()}`;
  if (tag === 'bit-set') return `SET ${instr.bit}, ${instr.reg.toUpperCase()}`;
  if (tag === 'bit-res') return `RES ${instr.bit}, ${instr.reg.toUpperCase()}`;
  if (tag === 'bit-test-ind') return `BIT ${instr.bit}, (HL)`;
  if (tag === 'bit-set-ind') return `SET ${instr.bit}, (HL)`;
  if (tag === 'bit-res-ind') return `RES ${instr.bit}, (HL)`;

  if (tag === 'indexed-cb-bit') return `BIT ${instr.bit}, ${dispStr(instr.indexRegister, instr.displacement)}`;
  if (tag === 'indexed-cb-set') return `SET ${instr.bit}, ${dispStr(instr.indexRegister, instr.displacement)}`;
  if (tag === 'indexed-cb-res') return `RES ${instr.bit}, ${dispStr(instr.indexRegister, instr.displacement)}`;
  if (tag === 'indexed-cb-rotate') return `${instr.operation.toUpperCase()} ${dispStr(instr.indexRegister, instr.displacement)}`;

  if (tag === 'rotate-reg') return `${instr.op.toUpperCase()} ${instr.reg.toUpperCase()}`;
  if (tag === 'rotate-ind') return `${instr.op.toUpperCase()} (HL)`;

  if (tag === 'in-imm') return `IN A, (${hexVal(instr.port)})`;
  if (tag === 'out-imm') return `OUT (${hexVal(instr.port)}), A`;
  if (tag === 'in-reg') return `IN ${instr.reg.toUpperCase()}, (C)`;
  if (tag === 'out-reg') return `OUT (C), ${instr.reg.toUpperCase()}`;
  if (tag === 'in0') return `IN0 ${instr.reg.toUpperCase()}, (${hexVal(instr.port)})`;
  if (tag === 'out0') return `OUT0 (${hexVal(instr.port)}), ${instr.reg.toUpperCase()}`;

  if (tag === 'mlt') return `MLT ${instr.pair.toUpperCase()}`;
  if (tag === 'tst') return `TST A, ${instr.reg ? instr.reg.toUpperCase() : hexVal(instr.value)}`;
  if (tag === 'pea') return `PEA ${instr.base.toUpperCase()}+${instr.displacement}`;
  if (tag === 'lea') return `LEA ${instr.dest.toUpperCase()}, ${instr.base.toUpperCase()}+${instr.displacement}`;
  if (tag === 'slp') return 'SLP';
  if (tag === 'stmix') return 'STMIX';
  if (tag === 'rsmix') return 'RSMIX';
  if (tag === 'im') return `IM ${instr.mode}`;
  if (tag === 'ld-ind-imm') return `LD (HL), ${hexVal(instr.value)}`;

  return `[${tag}]`;
}

// Build raw byte string for an instruction
function byteString(pc, length) {
  const bytes = [];
  for (let i = 0; i < length && pc + i < rom.length; i++) {
    bytes.push(hexByte(rom[pc + i]));
  }
  return bytes.join(' ');
}

// Decode a region and collect structured results
function decodeRegion(start, end) {
  const instructions = [];
  let pc = start;

  while (pc < end) {
    let instr;
    try {
      instr = decodeInstruction(rom, pc, 'adl');
    } catch (e) {
      instr = { pc, length: 1, nextPc: pc + 1, tag: 'unknown', _error: e.message };
    }

    if (!instr || !Number.isFinite(instr.length) || instr.length <= 0) {
      instr = { pc, length: 1, nextPc: pc + 1, tag: 'db' };
    }

    const length = Math.min(instr.length, end - pc);
    instructions.push({
      addr: pc,
      length,
      bytes: byteString(pc, length),
      text: formatInstruction(instr),
      instr,
    });
    pc += length;
  }

  return instructions;
}

// ====== MAIN ======

const instructions = decodeRegion(START, END);

console.log(`Phase 612: decode 0x08F3B8 loop body (${hexAddr(START)} - ${hexAddr(END)})`);
console.log(`Total instructions: ${instructions.length}`);
console.log('');

// Print full disassembly
for (const entry of instructions) {
  const addrStr = hexAddr(entry.addr);
  const bytesStr = entry.bytes.padEnd(20);
  console.log(`${addrStr}  ${bytesStr}  ${entry.text}`);
}

// Structural analysis
const backwardBranches = [];
const forwardBranches = [];
const callTargets = [];
const iyAccesses = [];

for (const entry of instructions) {
  const { instr, addr } = entry;
  const tag = instr.tag;

  // CALL targets
  if (tag === 'call' || tag === 'call-conditional') {
    callTargets.push({
      addr,
      target: instr.target,
      conditional: tag === 'call-conditional',
      text: entry.text,
    });
  }

  // Branch targets
  if (tag === 'jr' || tag === 'jr-conditional' || tag === 'jp' || tag === 'jp-conditional' || tag === 'djnz') {
    if (instr.target <= addr) {
      backwardBranches.push({ addr, target: instr.target, text: entry.text });
    } else {
      forwardBranches.push({ addr, target: instr.target, text: entry.text });
    }
  }

  // IY-relative references
  if ((tag === 'indexed-cb-bit' || tag === 'indexed-cb-set' || tag === 'indexed-cb-res' ||
       tag === 'ld-reg-ixd' || tag === 'ld-ixd-reg' || tag === 'alu-ixd' ||
       tag === 'inc-ixd' || tag === 'dec-ixd' || tag === 'ld-ixd-imm') &&
      instr.indexRegister === 'iy') {
    const iyAddr = IY_BASE + instr.displacement;
    iyAccesses.push({ addr, iyAddr, text: entry.text });
  }
}

console.log('');
console.log('=== STRUCTURAL SUMMARY ===');

console.log('\n--- Backward branches (loop back-edges) ---');
if (backwardBranches.length === 0) {
  console.log('  (none)');
} else {
  for (const b of backwardBranches) {
    const isLoopBack = b.target === START ? '  *** LOOP BACK-EDGE ***' : '';
    console.log(`  ${hexAddr(b.addr)} -> ${hexAddr(b.target)}  ${b.text}${isLoopBack}`);
  }
}

console.log('\n--- Forward branches ---');
if (forwardBranches.length === 0) {
  console.log('  (none)');
} else {
  for (const b of forwardBranches) {
    const isExit = b.target >= END ? '  *** EXIT ***' : '';
    console.log(`  ${hexAddr(b.addr)} -> ${hexAddr(b.target)}  ${b.text}${isExit}`);
  }
}

console.log('\n--- CALL targets ---');
if (callTargets.length === 0) {
  console.log('  (none)');
} else {
  for (const c of callTargets) {
    const cond = c.conditional ? ' (conditional)' : '';
    console.log(`  ${hexAddr(c.addr)} -> CALL ${hexAddr(c.target)}${cond}  ${c.text}`);
  }
}

console.log('\n--- IY-relative accesses (flag bytes) ---');
if (iyAccesses.length === 0) {
  console.log('  (none)');
} else {
  for (const ref of iyAccesses) {
    console.log(`  ${hexAddr(ref.addr)}  ${ref.text}  ; IY-addr = ${hexAddr(ref.iyAddr)}`);
  }
}

// Loop termination analysis
console.log('\n--- Loop termination analysis ---');
const loopBacks = backwardBranches.filter(b => b.target === START);
if (loopBacks.length > 0) {
  console.log(`  Back-edge(s) to loop start ${hexAddr(START)}:`);
  for (const b of loopBacks) {
    console.log(`    ${hexAddr(b.addr)}  ${b.text}`);
  }
  const conditionalExits = forwardBranches.filter(b => {
    const tag = instructions.find(e => e.addr === b.addr)?.instr.tag;
    return tag === 'jr-conditional' || tag === 'jp-conditional';
  });
  if (conditionalExits.length > 0) {
    console.log(`  Conditional exit(s) from the loop:`);
    for (const e of conditionalExits) {
      console.log(`    ${hexAddr(e.addr)} -> ${hexAddr(e.target)}  ${e.text}`);
    }
  }
} else {
  console.log(`  No back-edge to ${hexAddr(START)} found.`);
  console.log(`  All backward branches target: ${backwardBranches.map(b => hexAddr(b.target)).join(', ') || '(none)'}`);
}

console.log('\nphase612: decode-08f3b8 probe complete');
