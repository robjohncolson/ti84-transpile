// Phase 579: Decode init trampoline targets 0x0250FA, 0x09E640, 0x09E601
// Called from 0x063033 init trampoline: CALL 0x0250FA -> CALL 0x09E640 -> CALL Z,0x09E601 -> RET

import fs from 'fs';
import { decodeInstruction } from './ez80-decoder.js';

const rom = fs.readFileSync('TI-84_Plus_CE/ROM.rom');

const TARGETS = [
  { address: 0x0250FA, label: 'INIT_TARGET_0250FA' },
  { address: 0x09E640, label: 'INIT_TARGET_09E640' },
  { address: 0x09E601, label: 'INIT_TARGET_09E601' },
];

function hex(v, w = 6) {
  return '0x' + v.toString(16).toUpperCase().padStart(w, '0');
}

function hexByte(v) {
  return '0x' + (v & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

function formatInstruction(inst) {
  const prefix = inst.modePrefix ? `${inst.modePrefix} ` : '';
  let text = inst.tag;

  switch (inst.tag) {
    case 'push': text = `PUSH ${inst.pair.toUpperCase()}`; break;
    case 'pop': text = `POP ${inst.pair.toUpperCase()}`; break;
    case 'ld-pair-imm': text = `LD ${inst.pair.toUpperCase()}, ${hex(inst.value)}`; break;
    case 'ld-pair-mem':
      text = inst.direction === 'to-mem'
        ? `LD (${hex(inst.addr)}), ${inst.pair.toUpperCase()}`
        : `LD ${inst.pair.toUpperCase()}, (${hex(inst.addr)})`;
      break;
    case 'ld-reg-imm': text = `LD ${inst.dest.toUpperCase()}, ${hexByte(inst.value)}`; break;
    case 'ld-reg-reg': text = `LD ${inst.dest.toUpperCase()}, ${inst.src.toUpperCase()}`; break;
    case 'ld-reg-ind': text = `LD ${inst.dest.toUpperCase()}, (${inst.src.toUpperCase()})`; break;
    case 'ld-ind-reg': text = `LD (${inst.dest.toUpperCase()}), ${inst.src.toUpperCase()}`; break;
    case 'ld-ind-imm': text = `LD (HL), ${hexByte(inst.value)}`; break;
    case 'ld-reg-ixd': {
      const sign = inst.displacement >= 0 ? '+' : '';
      text = `LD ${inst.dest.toUpperCase()}, (${inst.indexRegister.toUpperCase()}${sign}${inst.displacement})`;
      break;
    }
    case 'ld-ixd-reg': {
      const sign = inst.displacement >= 0 ? '+' : '';
      text = `LD (${inst.indexRegister.toUpperCase()}${sign}${inst.displacement}), ${inst.src.toUpperCase()}`;
      break;
    }
    case 'ld-ixd-imm': {
      const sign = inst.displacement >= 0 ? '+' : '';
      text = `LD (${inst.indexRegister.toUpperCase()}${sign}${inst.displacement}), ${hexByte(inst.value)}`;
      break;
    }
    case 'ld-a-mem': text = `LD A, (${hex(inst.addr)})`; break;
    case 'ld-mem-a': text = `LD (${hex(inst.addr)}), A`; break;
    case 'ld-reg-mem': text = `LD ${inst.dest.toUpperCase()}, (${hex(inst.addr)})`; break;
    case 'ld-mem-reg': text = `LD (${hex(inst.addr)}), ${inst.src.toUpperCase()}`; break;
    case 'alu-imm': text = `${inst.op.toUpperCase()} ${hexByte(inst.value)}`; break;
    case 'alu-reg': text = `${inst.op.toUpperCase()} ${inst.src.toUpperCase()}`; break;
    case 'alu-ind': text = `${inst.op.toUpperCase()} (HL)`; break;
    case 'alu-ixd': {
      const sign = inst.displacement >= 0 ? '+' : '';
      text = `${inst.op.toUpperCase()} (${inst.indexRegister.toUpperCase()}${sign}${inst.displacement})`;
      break;
    }
    case 'call': text = `CALL ${hex(inst.target)}`; break;
    case 'call-conditional': text = `CALL ${inst.condition.toUpperCase()}, ${hex(inst.target)}`; break;
    case 'jp': text = `JP ${hex(inst.target)}`; break;
    case 'jp-conditional': text = `JP ${inst.condition.toUpperCase()}, ${hex(inst.target)}`; break;
    case 'jp-indirect': text = `JP (${(inst.indirectRegister ?? 'hl').toUpperCase()})`; break;
    case 'jr': text = `JR ${hex(inst.target)}`; break;
    case 'jr-conditional': text = `JR ${inst.condition.toUpperCase()}, ${hex(inst.target)}`; break;
    case 'ret': text = 'RET'; break;
    case 'ret-conditional': text = `RET ${inst.condition.toUpperCase()}`; break;
    case 'inc-pair': text = `INC ${inst.pair.toUpperCase()}`; break;
    case 'dec-pair': text = `DEC ${inst.pair.toUpperCase()}`; break;
    case 'inc-reg': text = `INC ${inst.reg.toUpperCase()}`; break;
    case 'dec-reg': text = `DEC ${inst.reg.toUpperCase()}`; break;
    case 'inc-ixd': {
      const sign = inst.displacement >= 0 ? '+' : '';
      text = `INC (${inst.indexRegister.toUpperCase()}${sign}${inst.displacement})`;
      break;
    }
    case 'dec-ixd': {
      const sign = inst.displacement >= 0 ? '+' : '';
      text = `DEC (${inst.indexRegister.toUpperCase()}${sign}${inst.displacement})`;
      break;
    }
    case 'add-pair': text = `ADD ${inst.dest.toUpperCase()}, ${inst.src.toUpperCase()}`; break;
    case 'djnz': text = `DJNZ ${hex(inst.target)}`; break;
    case 'rotate-reg': text = `${inst.op.toUpperCase()} ${inst.reg.toUpperCase()}`; break;
    case 'rotate-ind': text = `${inst.op.toUpperCase()} (${inst.indirectRegister.toUpperCase()})`; break;
    case 'ex-de-hl': text = 'EX DE, HL'; break;
    case 'nop': text = 'NOP'; break;
    case 'di': text = 'DI'; break;
    case 'ei': text = 'EI'; break;
    case 'halt': text = 'HALT'; break;
    case 'rst': text = `RST ${hexByte(inst.target)}`; break;
    case 'bit': text = `BIT ${inst.bit}, ${inst.reg.toUpperCase()}`; break;
    case 'set': text = `SET ${inst.bit}, ${inst.reg.toUpperCase()}`; break;
    case 'res': text = `RES ${inst.bit}, ${inst.reg.toUpperCase()}`; break;
    case 'bit-test': text = `BIT ${inst.bit}, ${inst.reg.toUpperCase()}`; break;
    case 'bit-test-ind': text = `BIT ${inst.bit}, (${inst.indirectRegister.toUpperCase()})`; break;
    case 'bit-res-ind': text = `RES ${inst.bit}, (${inst.indirectRegister.toUpperCase()})`; break;
    case 'bit-set-ind': text = `SET ${inst.bit}, (${inst.indirectRegister.toUpperCase()})`; break;
    case 'bit-ixd': {
      const sign = inst.displacement >= 0 ? '+' : '';
      text = `BIT ${inst.bit}, (${inst.indexRegister.toUpperCase()}${sign}${inst.displacement})`;
      break;
    }
    case 'set-ixd': {
      const sign = inst.displacement >= 0 ? '+' : '';
      text = `SET ${inst.bit}, (${inst.indexRegister.toUpperCase()}${sign}${inst.displacement})`;
      break;
    }
    case 'res-ixd': {
      const sign = inst.displacement >= 0 ? '+' : '';
      text = `RES ${inst.bit}, (${inst.indexRegister.toUpperCase()}${sign}${inst.displacement})`;
      break;
    }
    case 'ex-sp-hl': text = 'EX (SP), HL'; break;
    case 'ex-sp-ix': text = `EX (SP), ${inst.indexRegister.toUpperCase()}`; break;
    case 'exx': text = 'EXX'; break;
    case 'ex-af': text = "EX AF, AF'"; break;
    case 'cpl': text = 'CPL'; break;
    case 'scf': text = 'SCF'; break;
    case 'ccf': text = 'CCF'; break;
    case 'daa': text = 'DAA'; break;
    case 'rla': text = 'RLA'; break;
    case 'rra': text = 'RRA'; break;
    case 'rlca': text = 'RLCA'; break;
    case 'rrca': text = 'RRCA'; break;
    case 'reti': text = 'RETI'; break;
    case 'retn': text = 'RETN'; break;
    case 'ldir': text = 'LDIR'; break;
    case 'lddr': text = 'LDDR'; break;
    case 'cpir': text = 'CPIR'; break;
    case 'cpdr': text = 'CPDR'; break;
    case 'outi': text = 'OUTI'; break;
    case 'outd': text = 'OUTD'; break;
    case 'ini': text = 'INI'; break;
    case 'ind': text = 'IND'; break;
    case 'out-c-reg': text = `OUT (C), ${inst.reg.toUpperCase()}`; break;
    case 'in-reg-c': text = `IN ${inst.reg.toUpperCase()}, (C)`; break;
    case 'out-imm': text = `OUT (${hexByte(inst.port)}), A`; break;
    case 'in-imm': text = `IN A, (${hexByte(inst.port)})`; break;
    case 'sbc-pair': text = `SBC HL, ${inst.pair.toUpperCase()}`; break;
    case 'adc-pair': text = `ADC HL, ${inst.pair.toUpperCase()}`; break;
    case 'neg': text = 'NEG'; break;
    case 'im': text = `IM ${inst.intMode}`; break;
    case 'ld-i-a': text = 'LD I, A'; break;
    case 'ld-a-i': text = 'LD A, I'; break;
    case 'ld-r-a': text = 'LD R, A'; break;
    case 'ld-a-r': text = 'LD A, R'; break;
    case 'rrd': text = 'RRD'; break;
    case 'rld': text = 'RLD'; break;
    case 'ld-sp-hl': text = 'LD SP, HL'; break;
    case 'ld-sp-ix': text = `LD SP, ${inst.indexRegister.toUpperCase()}`; break;
    case 'add-ix-pair': text = `ADD ${inst.indexRegister.toUpperCase()}, ${inst.pair.toUpperCase()}`; break;
    case 'ld-ix-imm': text = `LD ${inst.indexRegister.toUpperCase()}, ${hex(inst.value)}`; break;
    case 'ld-ix-mem':
      text = inst.direction === 'to-mem'
        ? `LD (${hex(inst.addr)}), ${inst.indexRegister.toUpperCase()}`
        : `LD ${inst.indexRegister.toUpperCase()}, (${hex(inst.addr)})`;
      break;
    case 'push-ix': text = `PUSH ${inst.indexRegister.toUpperCase()}`; break;
    case 'pop-ix': text = `POP ${inst.indexRegister.toUpperCase()}`; break;
    case 'inc-ix': text = `INC ${inst.indexRegister.toUpperCase()}`; break;
    case 'dec-ix': text = `DEC ${inst.indexRegister.toUpperCase()}`; break;
    case 'ld-mem-sp': text = `LD (${hex(inst.addr)}), SP`; break;
    case 'ld-sp-mem': text = `LD SP, (${hex(inst.addr)})`; break;
    case 'otir': text = 'OTIR'; break;
    case 'otdr': text = 'OTDR'; break;
    case 'inir': text = 'INIR'; break;
    case 'indr': text = 'INDR'; break;
    case 'tst-a-reg': text = `TST A, ${inst.reg.toUpperCase()}`; break;
    case 'tst-a-imm': text = `TST A, ${hexByte(inst.value)}`; break;
    case 'tstio': text = `TSTIO ${hexByte(inst.value)}`; break;
    case 'slp': text = 'SLP'; break;
    case 'mlt': text = `MLT ${inst.pair.toUpperCase()}`; break;
    case 'lea-pair': text = `LEA ${inst.dest.toUpperCase()}, ${inst.indexRegister.toUpperCase()}+${inst.displacement}`; break;
    case 'lea-ix': text = `LEA ${inst.destRegister.toUpperCase()}, ${inst.indexRegister.toUpperCase()}+${inst.displacement}`; break;
    case 'pea': text = `PEA ${inst.indexRegister.toUpperCase()}+${inst.displacement}`; break;
    case 'stmix': text = 'STMIX'; break;
    case 'rsmix': text = 'RSMIX'; break;
    case 'indexed-cb-bit': {
      const sign = inst.displacement >= 0 ? '+' : '';
      text = `BIT ${inst.bit}, (${inst.indexRegister.toUpperCase()}${sign}${inst.displacement})`;
      break;
    }
    case 'indexed-cb-res': {
      const sign = inst.displacement >= 0 ? '+' : '';
      text = `RES ${inst.bit}, (${inst.indexRegister.toUpperCase()}${sign}${inst.displacement})`;
      break;
    }
    case 'indexed-cb-set': {
      const sign = inst.displacement >= 0 ? '+' : '';
      text = `SET ${inst.bit}, (${inst.indexRegister.toUpperCase()}${sign}${inst.displacement})`;
      break;
    }
    case 'indexed-cb-rotate': {
      const sign = inst.displacement >= 0 ? '+' : '';
      text = `${inst.operation.toUpperCase()} (${inst.indexRegister.toUpperCase()}${sign}${inst.displacement})`;
      break;
    }
    default: break;
  }

  return `${prefix}${text}`.trim();
}

// Detect if instruction is a CALL
function isCall(inst) {
  return inst.tag === 'call' || inst.tag === 'call-conditional';
}

// Detect if instruction references IY
function isIYOp(inst) {
  if (inst.indexRegister === 'iy') return true;
  return false;
}

// Detect port I/O
function isPortIO(inst) {
  const ioTags = ['out-c-reg', 'in-reg-c', 'out-imm', 'in-imm',
    'outi', 'outd', 'ini', 'ind', 'otir', 'otdr', 'inir', 'indr', 'tstio'];
  return ioTags.includes(inst.tag);
}

// Detect RAM references (addresses >= 0xD00000)
function getRamRefs(inst) {
  const refs = [];
  if (inst.addr !== undefined && inst.addr >= 0xD00000) refs.push(inst.addr);
  if (inst.target !== undefined && inst.target >= 0xD00000) refs.push(inst.target);
  if (inst.value !== undefined && inst.value >= 0xD00000) refs.push(inst.value);
  return refs;
}

// Detect terminal instructions
function isTerminal(inst) {
  if (inst.tag === 'ret' || inst.tag === 'reti' || inst.tag === 'retn') return true;
  if (inst.tag === 'jp' || inst.tag === 'jp-indirect') return true;
  return false;
}

// Find CALL callers in ROM by scanning for CD XX YY ZZ (little-endian)
function findCallers(target) {
  const lo = target & 0xFF;
  const mi = (target >> 8) & 0xFF;
  const hi = (target >> 16) & 0xFF;
  const callers = [];
  for (let i = 0; i <= rom.length - 4; i++) {
    if (rom[i] === 0xCD && rom[i + 1] === lo && rom[i + 2] === mi && rom[i + 3] === hi) {
      callers.push(i);
    }
  }
  return callers;
}

// Also find JP callers (C3 XX YY ZZ)
function findJPRefs(target) {
  const lo = target & 0xFF;
  const mi = (target >> 8) & 0xFF;
  const hi = (target >> 16) & 0xFF;
  const refs = [];
  for (let i = 0; i <= rom.length - 4; i++) {
    if (rom[i] === 0xC3 && rom[i + 1] === lo && rom[i + 2] === mi && rom[i + 3] === hi) {
      refs.push(i);
    }
  }
  return refs;
}

function disassembleFunction(startAddr, maxBytes = 150) {
  const instructions = [];
  const calls = [];
  const ramRefs = [];
  const iyOps = [];
  const portIOs = [];
  let terminatedBy = 'byte limit';

  let pc = startAddr;
  while (pc < startAddr + maxBytes && pc < rom.length) {
    let inst;
    try {
      inst = decodeInstruction(rom, pc, 'adl');
    } catch (e) {
      instructions.push({ pc, length: 1, asm: `<decode error: ${e.message}>` });
      pc += 1;
      continue;
    }

    const asm = formatInstruction(inst);
    const len = inst.length || 1;
    instructions.push({ pc, length: len, asm, inst });

    if (isCall(inst)) {
      calls.push({ pc, target: inst.target, asm });
    }

    for (const ref of getRamRefs(inst)) {
      ramRefs.push({ pc, addr: ref, asm });
    }

    if (isIYOp(inst)) {
      iyOps.push({ pc, asm });
    }

    if (isPortIO(inst)) {
      portIOs.push({ pc, asm });
    }

    pc += len;

    if (isTerminal(inst)) {
      terminatedBy = asm;
      break;
    }
  }

  const callers = findCallers(startAddr);
  const jpRefs = findJPRefs(startAddr);

  return {
    startAddr,
    endAddr: pc,
    size: pc - startAddr,
    terminatedBy,
    instructions,
    calls,
    ramRefs,
    iyOps,
    portIOs,
    callers,
    jpRefs,
  };
}

// --- Main ---
const results = [];

for (const target of TARGETS) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`=== ${target.label} @ ${hex(target.address)} ===`);
  console.log('='.repeat(70));

  const result = disassembleFunction(target.address);
  results.push({ ...target, result });

  console.log(`Size: ${result.size} bytes (${hex(result.startAddr)}..${hex(result.endAddr)})`);
  console.log(`Terminator: ${result.terminatedBy}`);
  console.log(`CALL callers: ${result.callers.length} [${result.callers.map(a => hex(a)).join(', ')}]`);
  console.log(`JP refs: ${result.jpRefs.length} [${result.jpRefs.map(a => hex(a)).join(', ')}]`);
  console.log(`Sub-CALLs: ${result.calls.length}`);
  for (const c of result.calls) {
    console.log(`  ${hex(c.pc)} -> CALL ${hex(c.target)}`);
  }
  console.log(`RAM refs: ${result.ramRefs.length}`);
  for (const r of result.ramRefs) {
    console.log(`  ${hex(r.pc)} -> ${hex(r.addr)} :: ${r.asm}`);
  }
  console.log(`IY ops: ${result.iyOps.length}`);
  for (const op of result.iyOps) {
    console.log(`  ${hex(op.pc)} :: ${op.asm}`);
  }
  console.log(`Port I/O: ${result.portIOs.length}`);
  for (const op of result.portIOs) {
    console.log(`  ${hex(op.pc)} :: ${op.asm}`);
  }

  console.log(`\nDisassembly:`);
  for (const row of result.instructions) {
    const rawBytes = Array.from(rom.slice(row.pc, row.pc + row.length))
      .map(b => b.toString(16).padStart(2, '0'))
      .join(' ');
    console.log(`  ${hex(row.pc)}  ${rawBytes.padEnd(15)}  ${row.asm}`);
  }
}

// Summary
console.log(`\n${'='.repeat(70)}`);
console.log('=== SUMMARY ===');
console.log('='.repeat(70));
for (const { label, address, result } of results) {
  console.log(`${label} @ ${hex(address)}: ${result.size}B, ${result.instructions.length} insns, ${result.calls.length} sub-calls, ${result.callers.length} callers, terminated by ${result.terminatedBy}`);
}
