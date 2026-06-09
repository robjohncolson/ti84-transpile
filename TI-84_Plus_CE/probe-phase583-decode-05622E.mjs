#!/usr/bin/env node
// Phase 583 — Decode 0x05622E: Key-code-to-token mapper (~22B, RET at 0x056243)
// Input: A = key code. Output: HL = token pair.
// Reads D0058E as high byte. Special cases for key codes 0xFE and 0xFC.

import { readFileSync } from 'fs';
import { decodeInstruction } from './ez80-decoder.js';

const rom = readFileSync('TI-84_Plus_CE/ROM.rom');

const START = 0x05622E;
const DISASM_BYTES = 40;   // function is ~22B, give a little extra

function hex(v, w = 6) {
  return '0x' + (v >>> 0).toString(16).toUpperCase().padStart(w, '0');
}

function hexByte(v) {
  return (v & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

function readU24LE(offset) {
  return rom[offset] | (rom[offset + 1] << 8) | (rom[offset + 2] << 16);
}

// Format a decoded instruction into a human-readable mnemonic string
function formatInstruction(inst) {
  const prefix = inst.modePrefix ? `${inst.modePrefix} ` : '';
  const t = inst.tag;
  const disp = (d) => (d >= 0 ? `+${d}` : `${d}`);

  let text = t;
  switch (t) {
    case 'nop': text = 'NOP'; break;
    case 'halt': text = 'HALT'; break;
    case 'di': text = 'DI'; break;
    case 'ei': text = 'EI'; break;
    case 'rlca': text = 'RLCA'; break;
    case 'rrca': text = 'RRCA'; break;
    case 'rla': text = 'RLA'; break;
    case 'rra': text = 'RRA'; break;
    case 'daa': text = 'DAA'; break;
    case 'cpl': text = 'CPL'; break;
    case 'scf': text = 'SCF'; break;
    case 'ccf': text = 'CCF'; break;
    case 'exx': text = 'EXX'; break;
    case 'ex-af': text = "EX AF, AF'"; break;
    case 'ex-de-hl': text = 'EX DE, HL'; break;
    case 'ex-sp-hl': text = 'EX (SP), HL'; break;
    case 'ex-sp-pair': text = `EX (SP), ${inst.pair.toUpperCase()}`; break;
    case 'neg': text = 'NEG'; break;
    case 'retn': text = 'RETN'; break;
    case 'reti': text = 'RETI'; break;
    case 'rrd': text = 'RRD'; break;
    case 'rld': text = 'RLD'; break;
    case 'ldi': text = 'LDI'; break;
    case 'ldd': text = 'LDD'; break;
    case 'ldir': text = 'LDIR'; break;
    case 'lddr': text = 'LDDR'; break;
    case 'cpi': text = 'CPI'; break;
    case 'cpd': text = 'CPD'; break;
    case 'cpir': text = 'CPIR'; break;
    case 'cpdr': text = 'CPDR'; break;
    case 'ini': text = 'INI'; break;
    case 'outi': text = 'OUTI'; break;
    case 'ind': text = 'IND'; break;
    case 'outd': text = 'OUTD'; break;
    case 'inir': text = 'INIR'; break;
    case 'otir': text = 'OTIR'; break;
    case 'indr': text = 'INDR'; break;
    case 'otdr': text = 'OTDR'; break;
    case 'otimr': text = 'OTIMR'; break;
    case 'slp': text = 'SLP'; break;
    case 'stmix': text = 'STMIX'; break;
    case 'rsmix': text = 'RSMIX'; break;
    case 'ld-mb-a': text = 'LD MB, A'; break;
    case 'ld-a-mb': text = 'LD A, MB'; break;
    case 'ld-sp-hl': text = 'LD SP, HL'; break;
    case 'ld-sp-pair': text = `LD SP, ${inst.pair.toUpperCase()}`; break;
    case 'im': text = `IM ${inst.value}`; break;
    case 'ld-special': text = `LD ${inst.dest.toUpperCase()}, ${inst.src.toUpperCase()}`; break;
    case 'push': text = `PUSH ${inst.pair.toUpperCase()}`; break;
    case 'pop': text = `POP ${inst.pair.toUpperCase()}`; break;
    case 'ld-pair-imm': text = `LD ${inst.pair.toUpperCase()}, ${hex(inst.value)}`; break;
    case 'ld-pair-mem':
      text = inst.direction === 'to-mem'
        ? `LD (${hex(inst.addr)}), ${inst.pair.toUpperCase()}`
        : `LD ${inst.pair.toUpperCase()}, (${hex(inst.addr)})`;
      break;
    case 'ld-mem-pair': text = `LD (${hex(inst.addr)}), ${inst.pair.toUpperCase()}`; break;
    case 'ld-reg-imm': text = `LD ${inst.dest.toUpperCase()}, ${hexByte(inst.value)}`; break;
    case 'ld-reg-reg': text = `LD ${inst.dest.toUpperCase()}, ${inst.src.toUpperCase()}`; break;
    case 'ld-reg-ind': text = `LD ${inst.dest.toUpperCase()}, (${inst.src.toUpperCase()})`; break;
    case 'ld-ind-reg': text = `LD (${inst.dest.toUpperCase()}), ${inst.src.toUpperCase()}`; break;
    case 'ld-ind-imm': text = `LD (HL), ${hexByte(inst.value)}`; break;
    case 'ld-reg-mem': text = `LD ${inst.dest.toUpperCase()}, (${hex(inst.addr)})`; break;
    case 'ld-mem-reg': text = `LD (${hex(inst.addr)}), ${inst.src.toUpperCase()}`; break;
    case 'ld-reg-ixd':
      text = `LD ${inst.dest.toUpperCase()}, (${inst.indexRegister.toUpperCase()}${disp(inst.displacement)})`;
      break;
    case 'ld-ixd-reg':
      text = `LD (${inst.indexRegister.toUpperCase()}${disp(inst.displacement)}), ${inst.src.toUpperCase()}`;
      break;
    case 'ld-ixd-imm':
      text = `LD (${inst.indexRegister.toUpperCase()}${disp(inst.displacement)}), ${hexByte(inst.value)}`;
      break;
    case 'inc-ixd':
      text = `INC (${inst.indexRegister.toUpperCase()}${disp(inst.displacement)})`;
      break;
    case 'dec-ixd':
      text = `DEC (${inst.indexRegister.toUpperCase()}${disp(inst.displacement)})`;
      break;
    case 'alu-imm': text = `${inst.op.toUpperCase()} ${hexByte(inst.value)}`; break;
    case 'alu-reg': text = `${inst.op.toUpperCase()} ${inst.src.toUpperCase()}`; break;
    case 'alu-ixd':
      text = `${inst.op.toUpperCase()} (${inst.indexRegister.toUpperCase()}${disp(inst.displacement)})`;
      break;
    case 'call': text = `CALL ${hex(inst.target)}`; break;
    case 'call-conditional': text = `CALL ${inst.condition.toUpperCase()}, ${hex(inst.target)}`; break;
    case 'jp': text = `JP ${hex(inst.target)}`; break;
    case 'jp-conditional': text = `JP ${inst.condition.toUpperCase()}, ${hex(inst.target)}`; break;
    case 'jp-indirect': text = `JP (${inst.indirectRegister.toUpperCase()})`; break;
    case 'jr': text = `JR ${hex(inst.target)}`; break;
    case 'jr-conditional': text = `JR ${inst.condition.toUpperCase()}, ${hex(inst.target)}`; break;
    case 'djnz': text = `DJNZ ${hex(inst.target)}`; break;
    case 'ret': text = 'RET'; break;
    case 'ret-conditional': text = `RET ${inst.condition.toUpperCase()}`; break;
    case 'rst': text = `RST ${hexByte(inst.target)}`; break;
    case 'inc-pair': text = `INC ${inst.pair.toUpperCase()}`; break;
    case 'dec-pair': text = `DEC ${inst.pair.toUpperCase()}`; break;
    case 'inc-reg': text = `INC ${inst.reg.toUpperCase()}`; break;
    case 'dec-reg': text = `DEC ${inst.reg.toUpperCase()}`; break;
    case 'add-pair': text = `ADD ${inst.dest.toUpperCase()}, ${inst.src.toUpperCase()}`; break;
    case 'adc-pair': text = `ADC HL, ${inst.src.toUpperCase()}`; break;
    case 'sbc-pair': text = `SBC HL, ${inst.src.toUpperCase()}`; break;
    case 'mlt': text = `MLT ${inst.reg.toUpperCase()}`; break;
    case 'rotate-reg': text = `${inst.op.toUpperCase()} ${inst.reg.toUpperCase()}`; break;
    case 'rotate-ind': text = `${inst.op.toUpperCase()} (HL)`; break;
    case 'bit-test': text = `BIT ${inst.bit}, ${inst.reg.toUpperCase()}`; break;
    case 'bit-test-ind': text = `BIT ${inst.bit}, (HL)`; break;
    case 'bit-res': text = `RES ${inst.bit}, ${inst.reg.toUpperCase()}`; break;
    case 'bit-res-ind': text = `RES ${inst.bit}, (HL)`; break;
    case 'bit-set': text = `SET ${inst.bit}, ${inst.reg.toUpperCase()}`; break;
    case 'bit-set-ind': text = `SET ${inst.bit}, (HL)`; break;
    case 'indexed-cb-rotate':
      text = `${inst.operation.toUpperCase()} (${inst.indexRegister.toUpperCase()}${disp(inst.displacement)})`;
      break;
    case 'indexed-cb-bit':
      text = `BIT ${inst.bit}, (${inst.indexRegister.toUpperCase()}${disp(inst.displacement)})`;
      break;
    case 'indexed-cb-res':
      text = `RES ${inst.bit}, (${inst.indexRegister.toUpperCase()}${disp(inst.displacement)})`;
      break;
    case 'indexed-cb-set':
      text = `SET ${inst.bit}, (${inst.indexRegister.toUpperCase()}${disp(inst.displacement)})`;
      break;
    case 'out-imm': text = `OUT (${hexByte(inst.port)}), A`; break;
    case 'in-imm': text = `IN A, (${hexByte(inst.port)})`; break;
    case 'out-reg': text = `OUT (C), ${inst.reg.toUpperCase()}`; break;
    case 'in-reg': text = `IN ${inst.reg.toUpperCase()}, (C)`; break;
    case 'in0': text = `IN0 ${inst.reg.toUpperCase()}, (${hexByte(inst.port)})`; break;
    case 'out0': text = `OUT0 (${hexByte(inst.port)}), ${inst.reg.toUpperCase()}`; break;
    case 'tst-reg': text = `TST A, ${inst.reg.toUpperCase()}`; break;
    case 'tst-ind': text = 'TST A, (HL)'; break;
    case 'tst-imm': text = `TST A, ${hexByte(inst.value)}`; break;
    case 'tstio': text = `TSTIO ${hexByte(inst.value)}`; break;
    case 'lea':
      text = `LEA ${inst.dest.toUpperCase()}, ${inst.base.toUpperCase()}${disp(inst.displacement)}`;
      break;
    case 'ld-pair-indexed':
      text = `LD ${inst.pair.toUpperCase()}, (${inst.indexRegister.toUpperCase()}${disp(inst.displacement)})`;
      break;
    case 'ld-indexed-pair':
      text = `LD (${inst.indexRegister.toUpperCase()}${disp(inst.displacement)}), ${inst.pair.toUpperCase()}`;
      break;
    case 'ld-ixiy-indexed':
      text = `LD ${inst.dest.toUpperCase()}, (${inst.indexRegister.toUpperCase()}${disp(inst.displacement)})`;
      break;
    case 'ld-indexed-ixiy':
      text = `LD (${inst.indexRegister.toUpperCase()}${disp(inst.displacement)}), ${inst.src.toUpperCase()}`;
      break;
    case 'ld-pair-ind': text = `LD ${inst.pair.toUpperCase()}, (${inst.src.toUpperCase()})`; break;
    case 'ld-ind-pair': text = `LD (${inst.dest.toUpperCase()}), ${inst.pair.toUpperCase()}`; break;
    default: text = t.toUpperCase(); break;
  }
  return `${prefix}${text}`;
}

// Classify instruction by tag for inventory
function classifyTag(inst) {
  const tags = [];
  const t = inst.tag;

  if (t === 'call' || t === 'call-conditional') tags.push('CALL');
  if (t === 'jp' || t === 'jp-conditional' || t === 'jp-indirect') tags.push('JP');
  if (t === 'jr' || t === 'jr-conditional') tags.push('JR');
  if (t === 'di') tags.push('DI');
  if (t === 'ei') tags.push('EI');
  if (t === 'ret' || t === 'ret-conditional') tags.push('RET');
  if (t === 'djnz') tags.push('DJNZ');

  // Port I/O
  if (t === 'in-imm' || t === 'in-reg' || t === 'in0' ||
      t === 'out-imm' || t === 'out-reg' || t === 'out0' ||
      t === 'ini' || t === 'outi' || t === 'ind' || t === 'outd' ||
      t === 'inir' || t === 'otir' || t === 'indr' || t === 'otdr') {
    tags.push('PORT_IO');
  }

  // IY references
  if (inst.indexRegister === 'iy' || inst.pair === 'iy' ||
      inst.dest === 'iy' || inst.src === 'iy' || inst.base === 'iy') {
    tags.push('IY');
  }

  // RAM references (D0xxxx or D4xxxx addresses)
  const addr = inst.addr ?? inst.target ?? inst.value;
  if (typeof addr === 'number' && addr >= 0xD00000 && addr <= 0xDFFFFF) {
    tags.push('RAM');
  }

  return tags;
}

// Extract RAM addresses from instruction
function extractRamAddr(inst) {
  const refs = [];
  for (const field of [inst.addr, inst.target, inst.value]) {
    if (typeof field === 'number' && field >= 0xD00000 && field <= 0xDFFFFF) {
      refs.push(field);
    }
  }
  return refs;
}

// =========================================================================
// Disassemble the function
// =========================================================================

const instructions = [];
const calls = [];
const jps = [];
const jrs = [];
const ramRefs = new Map();  // addr -> [{pc, mnemonic}]
const iyOps = [];
const portIo = [];
const retOps = [];

let pc = START;
const end = START + DISASM_BYTES;

while (pc < end && pc < rom.length) {
  let decoded;
  try {
    decoded = decodeInstruction(rom, pc, 'adl');
  } catch (e) {
    decoded = { tag: 'unknown', length: 1, pc };
  }
  if (!decoded || !decoded.length) {
    decoded = { tag: 'unknown', length: 1, pc };
  }

  const mnemonic = formatInstruction(decoded);
  const rawBytes = Array.from(rom.subarray(pc, pc + decoded.length))
    .map(b => hexByte(b)).join(' ');
  const tags = classifyTag(decoded);

  const record = { address: pc, rawBytes, length: decoded.length, mnemonic, tags, decoded };
  instructions.push(record);

  if (tags.includes('CALL')) calls.push(record);
  if (tags.includes('JP')) jps.push(record);
  if (tags.includes('JR')) jrs.push(record);
  if (tags.includes('IY')) iyOps.push(record);
  if (tags.includes('PORT_IO')) portIo.push(record);
  if (tags.includes('RET')) retOps.push(record);

  for (const ref of extractRamAddr(decoded)) {
    const key = hex(ref);
    if (!ramRefs.has(key)) ramRefs.set(key, []);
    ramRefs.get(key).push({ pc, mnemonic });
  }

  // Stop after RET (function terminator)
  if (decoded.tag === 'ret') break;

  pc += decoded.length;
}
// If we broke out on RET, advance pc past it for the final address
if (instructions.length && instructions[instructions.length - 1].decoded.tag === 'ret') {
  pc += instructions[instructions.length - 1].length;
}

// =========================================================================
// Raw byte scan for callers (CALL and JP to 0x05622E)
// =========================================================================
// eZ80 ADL-mode CALL = CD xx xx xx (4 bytes), JP = C3 xx xx xx (4 bytes)
// Target address is 24-bit little-endian: 0x05622E = 2E 62 05

function scanRawCallers(targetAddr) {
  const lo = targetAddr & 0xFF;          // 0x2E
  const mid = (targetAddr >> 8) & 0xFF;  // 0x62
  const hi = (targetAddr >> 16) & 0xFF;  // 0x05

  const results = [];
  const romLen = rom.length;

  for (let i = 0; i < romLen - 3; i++) {
    const opcode = rom[i];
    // CALL = 0xCD, JP = 0xC3
    if ((opcode === 0xCD || opcode === 0xC3) &&
        rom[i + 1] === lo && rom[i + 2] === mid && rom[i + 3] === hi) {
      const type = opcode === 0xCD ? 'CALL' : 'JP';
      results.push({ addr: i, type });
    }
  }
  return results;
}

// Also scan for conditional CALL/JP patterns
// Conditional CALL: C4/CC/D4/DC/E4/EC/F4/FC xx xx xx
// Conditional JP:   C2/CA/D2/DA/E2/EA/F2/FA xx xx xx
function scanRawConditionalCallers(targetAddr) {
  const lo = targetAddr & 0xFF;
  const mid = (targetAddr >> 8) & 0xFF;
  const hi = (targetAddr >> 16) & 0xFF;

  const condCallOpcodes = [0xC4, 0xCC, 0xD4, 0xDC, 0xE4, 0xEC, 0xF4, 0xFC];
  const condJpOpcodes   = [0xC2, 0xCA, 0xD2, 0xDA, 0xE2, 0xEA, 0xF2, 0xFA];

  const condNames = {
    0xC4: 'NZ', 0xCC: 'Z', 0xD4: 'NC', 0xDC: 'C',
    0xE4: 'PO', 0xEC: 'PE', 0xF4: 'P', 0xFC: 'M',
    0xC2: 'NZ', 0xCA: 'Z', 0xD2: 'NC', 0xDA: 'C',
    0xE2: 'PO', 0xEA: 'PE', 0xF2: 'P', 0xFA: 'M',
  };

  const results = [];
  const romLen = rom.length;

  for (let i = 0; i < romLen - 3; i++) {
    const opcode = rom[i];
    if ((condCallOpcodes.includes(opcode) || condJpOpcodes.includes(opcode)) &&
        rom[i + 1] === lo && rom[i + 2] === mid && rom[i + 3] === hi) {
      const type = condCallOpcodes.includes(opcode) ? 'CALL' : 'JP';
      const cond = condNames[opcode] || '??';
      results.push({ addr: i, type: `${type} ${cond}` });
    }
  }
  return results;
}

// =========================================================================
// Output
// =========================================================================

console.log('=== Phase 583: Decode 0x05622E — Key-Code-to-Token Mapper ===');
console.log(`ROM: TI-84_Plus_CE/ROM.rom`);
console.log(`Disassembly range: ${hex(START)} .. ${hex(pc - 1)} (${pc - START} bytes decoded)`);
console.log('');

// =========================================================================
// Raw bytes dump
// =========================================================================

console.log('=== RAW BYTES ===');
const funcLen = pc - START;
const rawDump = Array.from(rom.subarray(START, pc)).map(b => hexByte(b)).join(' ');
console.log(`${hex(START)}  ${rawDump}`);
console.log(`Function length: ${funcLen} bytes`);
console.log('');

// =========================================================================
// Full disassembly listing
// =========================================================================

console.log('=== FULL DISASSEMBLY ===');
for (const ins of instructions) {
  const tagStr = ins.tags.length ? `  ; ${ins.tags.join(', ')}` : '';
  console.log(`${hex(ins.address)}  ${ins.rawBytes.padEnd(20)} ${ins.mnemonic}${tagStr}`);
}
console.log('');

// =========================================================================
// Instruction inventory
// =========================================================================

console.log('=== INSTRUCTION INVENTORY ===');

console.log(`\nCALLs (${calls.length}):`);
for (const ins of calls) {
  console.log(`  ${hex(ins.address)}  ${ins.mnemonic}`);
}

console.log(`\nJPs (${jps.length}):`);
for (const ins of jps) {
  console.log(`  ${hex(ins.address)}  ${ins.mnemonic}`);
}

console.log(`\nJRs (${jrs.length}):`);
for (const ins of jrs) {
  const target = ins.decoded.target;
  console.log(`  ${hex(ins.address)}  ${ins.mnemonic}  (target ${hex(target)})`);
}

console.log(`\nIY ops (${iyOps.length}):`);
for (const ins of iyOps) {
  console.log(`  ${hex(ins.address)}  ${ins.mnemonic}`);
}

console.log(`\nPort I/O ops (${portIo.length}):`);
for (const ins of portIo) {
  console.log(`  ${hex(ins.address)}  ${ins.mnemonic}`);
}

console.log(`\nRET ops (${retOps.length}):`);
for (const ins of retOps) {
  console.log(`  ${hex(ins.address)}  ${ins.mnemonic}`);
}

// =========================================================================
// RAM references
// =========================================================================

console.log('\n=== RAM REFERENCES (D0xxxx/D4xxxx) ===');
if (ramRefs.size) {
  const sorted = [...ramRefs.entries()].sort();
  for (const [ref, uses] of sorted) {
    console.log(`\n${ref}:`);
    for (const use of uses) {
      console.log(`  ${hex(use.pc)}  ${use.mnemonic}`);
    }
  }
} else {
  console.log('No D0xxxx/D4xxxx references found.');
}

// =========================================================================
// Cross-references (raw byte scan)
// =========================================================================

console.log('\n\n=== CROSS-REFERENCES TO 0x05622E (raw byte scan) ===');
console.log('Scanning for CALL 0x05622E (CD 2E 62 05) and JP 0x05622E (C3 2E 62 05)...');

const unconditionalCallers = scanRawCallers(START);
const conditionalCallers = scanRawConditionalCallers(START);
const allCallers = [...unconditionalCallers, ...conditionalCallers].sort((a, b) => a.addr - b.addr);

console.log(`Found ${allCallers.length} total references:\n`);

if (allCallers.length) {
  for (const caller of allCallers) {
    // Decode the instruction at the caller address for context
    const callerBytes = Array.from(rom.subarray(caller.addr, caller.addr + 4))
      .map(b => hexByte(b)).join(' ');
    // Also show a few bytes before for context
    const contextStart = Math.max(0, caller.addr - 8);
    const contextBytes = Array.from(rom.subarray(contextStart, caller.addr))
      .map(b => hexByte(b)).join(' ');
    console.log(`  ${hex(caller.addr)}  ${callerBytes}  ${caller.type} 0x05622E`);
    console.log(`    context before: [${hex(contextStart)}] ${contextBytes}`);
  }
} else {
  console.log('  No CALL/JP references found in ROM.');
}

// =========================================================================
// Semantic analysis
// =========================================================================

console.log('\n\n=== SEMANTIC ANALYSIS ===');
console.log('');
console.log('Function signature: key_to_token(A) -> HL');
console.log('');
console.log('Pseudocode:');
console.log('  HL = 0x000000');
console.log('  L = A                    ; L = key code');
console.log('  A = [D0058E]             ; A = high byte from RAM');
console.log('  H = A                    ; H = high byte  (HL = [D0058E]:keycode)');
console.log('  A = L                    ; A = key code again');
console.log('  CP 0xFE');
console.log('  JR Z, swap               ; if key == 0xFE, jump to swap');
console.log('  CP 0xFC');
console.log('  JR NZ, done              ; if key != 0xFC, skip swap (normal exit)');
console.log('swap:');
console.log('  L = H                    ; L = old H = [D0058E]');
console.log('  H = A                    ; H = key code (0xFE or 0xFC)');
console.log('done:');
console.log('  RET                      ; return HL');
console.log('');
console.log('Control flow analysis:');
console.log('');
console.log('Normal path (key code != 0xFE and != 0xFC):');
console.log('  CP 0xFE: zero flag clear -> JR Z not taken');
console.log('  CP 0xFC: zero flag clear -> JR NZ taken -> jumps to 0x056244 (past RET)');
console.log('  Wait — JR NZ target is 0x056244, but RET is at 0x056243.');
console.log('  So JR NZ +3 jumps to the byte AFTER RET. That means for normal keys,');
console.log('  the JR NZ skips the swap AND skips the RET, falling into whatever');
console.log('  follows at 0x056244. This function is NOT standalone for normal keys!');
console.log('  It only returns via RET for 0xFE and 0xFC cases.');
console.log('');
console.log('Special case 0xFE (two-byte token prefix):');
console.log('  CP 0xFE: zero flag set -> JR Z taken -> jumps to 0x056241 (swap)');
console.log('  L = H = [D0058E], H = A = 0xFE');
console.log('  Returns HL = 0xFE:[D0058E] (SWAPPED: prefix 0xFE in H, token in L)');
console.log('');
console.log('Special case 0xFC (two-byte token prefix):');
console.log('  CP 0xFE: zero flag clear -> JR Z not taken');
console.log('  CP 0xFC: zero flag set -> JR NZ not taken -> falls through to swap');
console.log('  L = H = [D0058E], H = A = 0xFC');
console.log('  Returns HL = 0xFC:[D0058E] (SWAPPED: prefix 0xFC in H, token in L)');
console.log('');
console.log('Key insight: In TI-OS, tokens 0xFE and 0xFC are two-byte token prefixes.');
console.log('This function handles token pair construction:');
console.log('  - For 0xFE/0xFC prefixed tokens: swaps so H=prefix, L=[D0058E]');
console.log('  - For normal single-byte tokens: falls through past RET (no return here)');
console.log('');
console.log('D0058E: Current token context byte (written by key processing pipeline).');
console.log('  Used as the second byte of two-byte tokens, or as H for single-byte tokens.');

// =========================================================================
// Summary
// =========================================================================

console.log('\n\n=== SUMMARY ===');
console.log(`Total instructions decoded: ${instructions.length}`);
console.log(`Function span: ${hex(START)} .. ${hex(pc - 1)} (${pc - START} bytes)`);
console.log(`CALLs: ${calls.length}, JPs: ${jps.length}, JRs: ${jrs.length}, RETs: ${retOps.length}`);
console.log(`IY ops: ${iyOps.length}, Port I/O: ${portIo.length}`);
console.log(`Unique RAM addresses referenced: ${ramRefs.size}`);
console.log(`Cross-references found: ${allCallers.length}`);
console.log('');
console.log('DONE');
