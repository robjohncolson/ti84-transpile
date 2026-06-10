import { readFileSync } from 'fs';
import { decodeInstruction } from './ez80-decoder.js';

const ROM_PATH = 'TI-84_Plus_CE/ROM.rom';
const TOKEN_READER = 0x090883;
const IY_BASE = 0xD00080;

const rom = readFileSync(ROM_PATH);

const hexByte = (v) => v.toString(16).padStart(2, '0');
const hexAddr = (v) => `0x${(v >>> 0).toString(16).padStart(6, '0')}`;
const hexVal = (v, w = 2) => `0x${v.toString(16).padStart(w, '0')}`;
const signed8 = (v) => (v & 0x80 ? v - 0x100 : v);
const read24 = (addr) => rom[addr] | (rom[addr + 1] << 8) | (rom[addr + 2] << 16);

// Format a decoded instruction object into human-readable text
function formatInstruction(instr) {
  const tag = instr.tag;

  // Simple single-word instructions
  const simpleOps = [
    'nop', 'ret', 'reti', 'retn', 'halt', 'di', 'ei', 'exx', 'daa', 'cpl',
    'scf', 'ccf', 'rlca', 'rrca', 'rla', 'rra', 'neg', 'ex-af', 'ex-de-hl',
    'ex-sp-hl', 'ld-sp-hl', 'rrd', 'rld', 'ldi', 'ldir', 'ldd', 'lddr',
    'cpi', 'cpir', 'cpd', 'cpdr', 'ini', 'inir', 'ind', 'indr',
    'outi', 'otir', 'outd', 'otdr',
  ];
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

  // Register-register loads
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

  // ED pair loads: LD rr, (nn) / LD (nn), rr
  if (tag === 'ed-ld-pair-mem') return `LD ${instr.pair.toUpperCase()}, (${hexVal(instr.addr, 6)})`;
  if (tag === 'ed-ld-mem-pair') return `LD (${hexVal(instr.addr, 6)}), ${instr.pair.toUpperCase()}`;

  // Indexed loads (IX/IY+d)
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

  // INC/DEC
  if (tag === 'inc-reg') return `INC ${instr.reg.toUpperCase()}`;
  if (tag === 'dec-reg') return `DEC ${instr.reg.toUpperCase()}`;
  if (tag === 'inc-pair') return `INC ${instr.pair.toUpperCase()}`;
  if (tag === 'dec-pair') return `DEC ${instr.pair.toUpperCase()}`;
  if (tag === 'inc-ixd') return `INC ${dispStr(instr.indexRegister, instr.displacement)}`;
  if (tag === 'dec-ixd') return `DEC ${dispStr(instr.indexRegister, instr.displacement)}`;

  // ALU
  if (tag === 'alu-reg') return `${instr.op.toUpperCase()} A, ${instr.src.toUpperCase()}`;
  if (tag === 'alu-imm') return `${instr.op.toUpperCase()} A, ${hexVal(instr.value)}`;
  if (tag === 'alu-ixd') return `${instr.op.toUpperCase()} A, ${dispStr(instr.indexRegister, instr.displacement)}`;
  if (tag === 'add-pair') return `ADD ${instr.dest.toUpperCase()}, ${instr.src.toUpperCase()}`;
  if (tag === 'sbc-pair') return `SBC HL, ${instr.src.toUpperCase()}`;
  if (tag === 'adc-pair') return `ADC HL, ${instr.src.toUpperCase()}`;

  // Jumps / calls
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

  // PUSH/POP
  if (tag === 'push') return `PUSH ${instr.pair.toUpperCase()}`;
  if (tag === 'pop') return `POP ${instr.pair.toUpperCase()}`;

  // Bit operations
  if (tag === 'bit-test') return `BIT ${instr.bit}, ${instr.reg.toUpperCase()}`;
  if (tag === 'bit-set') return `SET ${instr.bit}, ${instr.reg.toUpperCase()}`;
  if (tag === 'bit-res') return `RES ${instr.bit}, ${instr.reg.toUpperCase()}`;
  if (tag === 'bit-test-ind') return `BIT ${instr.bit}, (HL)`;
  if (tag === 'bit-set-ind') return `SET ${instr.bit}, (HL)`;
  if (tag === 'bit-res-ind') return `RES ${instr.bit}, (HL)`;

  // Indexed bit operations (FD CB / DD CB)
  if (tag === 'indexed-cb-bit') return `BIT ${instr.bit}, ${dispStr(instr.indexRegister, instr.displacement)}`;
  if (tag === 'indexed-cb-set') return `SET ${instr.bit}, ${dispStr(instr.indexRegister, instr.displacement)}`;
  if (tag === 'indexed-cb-res') return `RES ${instr.bit}, ${dispStr(instr.indexRegister, instr.displacement)}`;
  if (tag === 'indexed-cb-rotate') return `${instr.operation.toUpperCase()} ${dispStr(instr.indexRegister, instr.displacement)}`;

  // Rotate/shift
  if (tag === 'rotate-reg') return `${instr.op.toUpperCase()} ${instr.reg.toUpperCase()}`;
  if (tag === 'rotate-ind') return `${instr.op.toUpperCase()} (HL)`;

  // I/O
  if (tag === 'in-imm') return `IN A, (${hexVal(instr.port)})`;
  if (tag === 'out-imm') return `OUT (${hexVal(instr.port)}), A`;
  if (tag === 'in-reg') return `IN ${instr.reg.toUpperCase()}, (C)`;
  if (tag === 'out-reg') return `OUT (C), ${instr.reg.toUpperCase()}`;
  if (tag === 'in0') return `IN0 ${instr.reg.toUpperCase()}, (${hexVal(instr.port)})`;
  if (tag === 'out0') return `OUT0 (${hexVal(instr.port)}), ${instr.reg.toUpperCase()}`;

  // MLT, TST, PEA, LEA, SLP, STMIX, RSMIX
  if (tag === 'mlt') return `MLT ${instr.pair.toUpperCase()}`;
  if (tag === 'tst') return `TST A, ${instr.reg ? instr.reg.toUpperCase() : hexVal(instr.value)}`;
  if (tag === 'pea') return `PEA ${instr.base.toUpperCase()}+${instr.displacement}`;
  if (tag === 'lea') return `LEA ${instr.dest.toUpperCase()}, ${instr.base.toUpperCase()}+${instr.displacement}`;
  if (tag === 'slp') return 'SLP';
  if (tag === 'stmix') return 'STMIX';
  if (tag === 'rsmix') return 'RSMIX';

  // IM
  if (tag === 'im') return `IM ${instr.mode}`;

  // LD (HL), n
  if (tag === 'ld-ind-imm') return `LD (HL), ${hexVal(instr.value)}`;

  // Fallback
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

// Analyze a decoded region
function analyzeRegion(label, anchor, instructions) {
  const calls = [];
  const backEdges = [];
  const tokenReaderCalls = [];

  for (const entry of instructions) {
    const { instr, addr } = entry;
    const tag = instr.tag;

    // Track all calls
    if (tag === 'call' || tag === 'call-conditional') {
      calls.push({ addr, target: instr.target, conditional: tag === 'call-conditional' });
      if (instr.target === TOKEN_READER) {
        tokenReaderCalls.push(addr);
      }
    }

    // Track backward branches (loop back-edges)
    if (tag === 'jr' || tag === 'jr-conditional' || tag === 'jp' || tag === 'jp-conditional' || tag === 'djnz') {
      if (instr.target < addr) {
        backEdges.push({
          addr,
          target: instr.target,
          kind: tag.toUpperCase(),
          text: entry.text,
        });
      }
    }
  }

  // Find function boundaries (RET/JP terminators)
  const terminators = instructions.filter(e =>
    e.instr.tag === 'ret' || e.instr.tag === 'ret-conditional' ||
    e.instr.tag === 'jp' || e.instr.tag === 'jp-indirect'
  );

  // IY-relative references (flag byte accesses)
  const iyRefs = instructions.filter(e => {
    const tag = e.instr.tag;
    return tag === 'indexed-cb-bit' || tag === 'indexed-cb-set' || tag === 'indexed-cb-res' ||
           tag === 'ld-reg-ixd' || tag === 'ld-ixd-reg' || tag === 'alu-ixd';
  }).filter(e => {
    const reg = e.instr.indexRegister;
    return reg === 'iy';
  }).map(e => {
    const iyAddr = IY_BASE + e.instr.displacement;
    return { addr: e.addr, iyAddr, text: e.text };
  });

  return { calls, backEdges, tokenReaderCalls, terminators, iyRefs };
}

// ====== MAIN ======

const regions = [
  { label: '0x08F454 caller region', anchor: 0x08F454, start: 0x08F420, end: 0x08F4C0 },
  { label: '0x08EB9A caller region', anchor: 0x08EB9A, start: 0x08EB60, end: 0x08EC20 },
];

for (const region of regions) {
  const instructions = decodeRegion(region.start, region.end);
  const analysis = analyzeRegion(region.label, region.anchor, instructions);

  console.log(`\n${'='.repeat(72)}`);
  console.log(`  ${region.label}  (${hexAddr(region.start)} - ${hexAddr(region.end)})`);
  console.log(`${'='.repeat(72)}\n`);

  // Print disassembly
  for (const entry of instructions) {
    const marker = entry.addr === region.anchor ? ' =>' : '   ';
    const addrStr = hexAddr(entry.addr);
    const bytesStr = entry.bytes.padEnd(20);
    console.log(`${marker} ${addrStr}  ${bytesStr}  ${entry.text}`);
  }

  // Print analysis
  console.log(`\n--- CALL targets ---`);
  if (analysis.calls.length === 0) {
    console.log('  (none)');
  }
  for (const c of analysis.calls) {
    const isToken = c.target === TOKEN_READER ? '  *** TOKEN READER ***' : '';
    const cond = c.conditional ? ' (conditional)' : '';
    console.log(`  ${hexAddr(c.addr)} -> CALL ${hexAddr(c.target)}${cond}${isToken}`);
  }

  console.log(`\n--- CALL 0x090883 (token reader) sites ---`);
  if (analysis.tokenReaderCalls.length === 0) {
    console.log('  (none in this window)');
  }
  for (const addr of analysis.tokenReaderCalls) {
    console.log(`  ${hexAddr(addr)}  CALL 0x090883`);
  }

  console.log(`\n--- Loop back-edges (JR/JP/DJNZ backward) ---`);
  if (analysis.backEdges.length === 0) {
    console.log('  (none in this window)');
  }
  for (const edge of analysis.backEdges) {
    console.log(`  ${hexAddr(edge.addr)} -> ${hexAddr(edge.target)}  ${edge.text}`);
  }

  console.log(`\n--- IY-relative references (flag bytes) ---`);
  if (analysis.iyRefs.length === 0) {
    console.log('  (none in this window)');
  }
  for (const ref of analysis.iyRefs) {
    console.log(`  ${hexAddr(ref.addr)}  ${ref.text}  ; IY-addr = ${hexAddr(ref.iyAddr)}`);
  }

  console.log(`\n--- Terminators (RET/JP) ---`);
  for (const t of analysis.terminators) {
    console.log(`  ${hexAddr(t.addr)}  ${t.text}`);
  }

  console.log('');
}

// Summary
console.log(`\n${'='.repeat(72)}`);
console.log('  SUMMARY');
console.log(`${'='.repeat(72)}\n`);

for (const region of regions) {
  const instructions = decodeRegion(region.start, region.end);
  const analysis = analyzeRegion(region.label, region.anchor, instructions);

  console.log(`${region.label}:`);
  console.log(`  Total instructions decoded: ${instructions.length}`);
  console.log(`  CALL 0x090883 count: ${analysis.tokenReaderCalls.length}`);
  console.log(`  Back-edges (loops): ${analysis.backEdges.length}`);
  console.log(`  IY flag refs: ${analysis.iyRefs.length}`);
  console.log(`  Terminators: ${analysis.terminators.length}`);
  console.log('');
}

console.log('phase611: decode-callers probe complete');
