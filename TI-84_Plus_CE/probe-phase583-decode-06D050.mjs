#!/usr/bin/env node
// Phase 583 — Decode 0x06D050: Graph dispatch stub (JP target from 0x06CF41/0x06CFAF)
// Raw decode showed: BIT 0,(IY+2), JR NZ +8, CALL 0x023057, JP 0x06AABF
// This probe:
//   1. Full disassembly of 0x06D050 including both JR branch paths
//   2. Decode 0x06D05E (NZ branch path) for ~50 bytes
//   3. Preview CALL target 0x023057 (first ~30 bytes)
//   4. Preview JP target 0x06AABF (first ~30 bytes)
//   5. Full-ROM xref scan for all CALL/JP to 0x06D050

import { readFileSync } from 'fs';
import { decodeInstruction } from './ez80-decoder.js';

const rom = readFileSync('TI-84_Plus_CE/ROM.rom');

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
// Decode a range of bytes into instruction records
// =========================================================================

function decodeRange(start, byteCount, label) {
  const instructions = [];
  let pc = start;
  const end = start + byteCount;

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

    instructions.push({ address: pc, rawBytes, length: decoded.length, mnemonic, tags, decoded });
    pc += decoded.length;
  }

  return { instructions, startAddr: start, endAddr: pc, byteCount: pc - start, label };
}

// Print a disassembly listing
function printDisasm(result) {
  console.log(`\n=== ${result.label} ===`);
  console.log(`Range: ${hex(result.startAddr)} .. ${hex(result.endAddr - 1)} (${result.byteCount} bytes, ${result.instructions.length} instructions)`);
  console.log('');
  for (const ins of result.instructions) {
    const tagStr = ins.tags.length ? `  ; ${ins.tags.join(', ')}` : '';
    console.log(`${hex(ins.address)}  ${ins.rawBytes.padEnd(20)} ${ins.mnemonic}${tagStr}`);
  }
}

// Print inventory for a set of instructions
function printInventory(instructions, label) {
  const calls = instructions.filter(i => i.tags.includes('CALL'));
  const jps = instructions.filter(i => i.tags.includes('JP'));
  const jrs = instructions.filter(i => i.tags.includes('JR'));
  const rets = instructions.filter(i => i.tags.includes('RET'));
  const iyOps = instructions.filter(i => i.tags.includes('IY'));
  const portIo = instructions.filter(i => i.tags.includes('PORT_IO'));
  const ramRefs = new Map();

  for (const ins of instructions) {
    for (const ref of extractRamAddr(ins.decoded)) {
      const key = hex(ref);
      if (!ramRefs.has(key)) ramRefs.set(key, []);
      ramRefs.get(key).push({ pc: ins.address, mnemonic: ins.mnemonic });
    }
  }

  console.log(`\n=== INVENTORY: ${label} ===`);

  if (calls.length) {
    console.log(`\nCALLs (${calls.length}):`);
    for (const ins of calls) {
      const target = ins.decoded.target;
      console.log(`  ${hex(ins.address)}  ${ins.mnemonic}  (target ${hex(target)})`);
    }
  }

  if (jps.length) {
    console.log(`\nJPs (${jps.length}):`);
    for (const ins of jps) {
      const target = ins.decoded.target;
      console.log(`  ${hex(ins.address)}  ${ins.mnemonic}`);
    }
  }

  if (jrs.length) {
    console.log(`\nJRs (${jrs.length}):`);
    for (const ins of jrs) {
      console.log(`  ${hex(ins.address)}  ${ins.mnemonic}  (target ${hex(ins.decoded.target)})`);
    }
  }

  if (rets.length) {
    console.log(`\nRETs (${rets.length}):`);
    for (const ins of rets) {
      console.log(`  ${hex(ins.address)}  ${ins.mnemonic}`);
    }
  }

  if (iyOps.length) {
    console.log(`\nIY ops (${iyOps.length}):`);
    for (const ins of iyOps) {
      console.log(`  ${hex(ins.address)}  ${ins.mnemonic}`);
    }
  }

  if (portIo.length) {
    console.log(`\nPort I/O (${portIo.length}):`);
    for (const ins of portIo) {
      console.log(`  ${hex(ins.address)}  ${ins.mnemonic}`);
    }
  }

  if (ramRefs.size) {
    console.log(`\nRAM references (${ramRefs.size} unique addresses):`);
    const sorted = [...ramRefs.entries()].sort();
    for (const [ref, uses] of sorted) {
      console.log(`  ${ref}:`);
      for (const use of uses) {
        console.log(`    ${hex(use.pc)}  ${use.mnemonic}`);
      }
    }
  }
}

// =========================================================================
// Raw ROM byte-pattern xref scan
// =========================================================================

function scanRawXrefs(target3Bytes, label) {
  // target3Bytes = [low, mid, high] of the 24-bit address
  const results = [];

  // CALL pattern: CD ll mm hh
  for (let i = 0; i < rom.length - 3; i++) {
    if (rom[i] === 0xCD &&
        rom[i + 1] === target3Bytes[0] &&
        rom[i + 2] === target3Bytes[1] &&
        rom[i + 3] === target3Bytes[2]) {
      results.push({ addr: i, type: 'CALL', raw: `CD ${hexByte(target3Bytes[0])} ${hexByte(target3Bytes[1])} ${hexByte(target3Bytes[2])}` });
    }
    // JP pattern: C3 ll mm hh
    if (rom[i] === 0xC3 &&
        rom[i + 1] === target3Bytes[0] &&
        rom[i + 2] === target3Bytes[1] &&
        rom[i + 3] === target3Bytes[2]) {
      results.push({ addr: i, type: 'JP', raw: `C3 ${hexByte(target3Bytes[0])} ${hexByte(target3Bytes[1])} ${hexByte(target3Bytes[2])}` });
    }
  }

  console.log(`\n=== RAW XREF SCAN: ${label} ===`);
  console.log(`Searching for CD/C3 ${hexByte(target3Bytes[0])} ${hexByte(target3Bytes[1])} ${hexByte(target3Bytes[2])}`);
  if (results.length === 0) {
    console.log('  (none found)');
  } else {
    for (const r of results) {
      // Decode the instruction at that address for context
      let context = '';
      try {
        const inst = decodeInstruction(rom, r.addr, 'adl');
        context = `  => ${formatInstruction(inst)}`;
      } catch (e) {
        context = '  => (decode error)';
      }
      console.log(`  ${hex(r.addr)}  ${r.type}  ${r.raw}${context}`);
    }
  }
  console.log(`Total: ${results.length} references`);
  return results;
}

// =========================================================================
// Main analysis
// =========================================================================

console.log('=== Phase 583: Decode 0x06D050 — Graph Dispatch Stub ===');
console.log(`ROM: TI-84_Plus_CE/ROM.rom (${rom.length} bytes)`);
console.log('JP target from 0x06CF41 (multi-key dispatcher) and 0x06CFAF (graph key handler)');
console.log('');

// 1. Main function at 0x06D050 — decode enough to see both JR paths
const main = decodeRange(0x06D050, 30, '0x06D050 — Main stub (both JR branch paths)');
printDisasm(main);
printInventory(main.instructions, '0x06D050 main stub');

// 2. Decode the NZ branch path at 0x06D05E (~50 bytes)
const nzBranch = decodeRange(0x06D05E, 50, '0x06D05E — NZ branch path (JR NZ target)');
printDisasm(nzBranch);
printInventory(nzBranch.instructions, '0x06D05E NZ branch');

// 3. Preview CALL target 0x023057 (first ~30 bytes)
const call023057 = decodeRange(0x023057, 30, '0x023057 — CALL target preview (first 30 bytes)');
printDisasm(call023057);
printInventory(call023057.instructions, '0x023057 preview');

// 4. Preview JP target 0x06AABF (first ~30 bytes)
const jp06AABF = decodeRange(0x06AABF, 30, '0x06AABF — JP target preview (first 30 bytes)');
printDisasm(jp06AABF);
printInventory(jp06AABF.instructions, '0x06AABF preview');

// 5. Raw xref scan for CALL/JP to 0x06D050
// 0x06D050 in little-endian = 50 D0 06
scanRawXrefs([0x50, 0xD0, 0x06], 'CALL/JP 0x06D050');

// Also scan for conditional JP variants (CA/C2/D2/DA/E2/EA/F2/FA + 50 D0 06)
console.log('\n=== CONDITIONAL JP XREF SCAN for 0x06D050 ===');
const condOpcodes = [0xCA, 0xC2, 0xD2, 0xDA, 0xE2, 0xEA, 0xF2, 0xFA];
const condNames = ['JP Z', 'JP NZ', 'JP NC', 'JP C', 'JP PO', 'JP PE', 'JP P', 'JP M'];
let condTotal = 0;
for (let idx = 0; idx < condOpcodes.length; idx++) {
  for (let i = 0; i < rom.length - 3; i++) {
    if (rom[i] === condOpcodes[idx] &&
        rom[i + 1] === 0x50 &&
        rom[i + 2] === 0xD0 &&
        rom[i + 3] === 0x06) {
      console.log(`  ${hex(i)}  ${condNames[idx]} 0x06D050`);
      condTotal++;
    }
  }
}
if (condTotal === 0) {
  console.log('  (none found)');
}
console.log(`Total conditional JP refs: ${condTotal}`);

// Also scan for conditional CALL variants (CC/C4/D4/DC/E4/EC/F4/FC + 50 D0 06)
console.log('\n=== CONDITIONAL CALL XREF SCAN for 0x06D050 ===');
const condCallOpcodes = [0xCC, 0xC4, 0xD4, 0xDC, 0xE4, 0xEC, 0xF4, 0xFC];
const condCallNames = ['CALL Z', 'CALL NZ', 'CALL NC', 'CALL C', 'CALL PO', 'CALL PE', 'CALL P', 'CALL M'];
let condCallTotal = 0;
for (let idx = 0; idx < condCallOpcodes.length; idx++) {
  for (let i = 0; i < rom.length - 3; i++) {
    if (rom[i] === condCallOpcodes[idx] &&
        rom[i + 1] === 0x50 &&
        rom[i + 2] === 0xD0 &&
        rom[i + 3] === 0x06) {
      console.log(`  ${hex(i)}  ${condCallNames[idx]} 0x06D050`);
      condCallTotal++;
    }
  }
}
if (condCallTotal === 0) {
  console.log('  (none found)');
}
console.log(`Total conditional CALL refs: ${condCallTotal}`);

// =========================================================================
// Summary
// =========================================================================

console.log('\n\n=== SUMMARY ===');
console.log(`Main stub at 0x06D050: ${main.byteCount} bytes, ${main.instructions.length} instructions`);
console.log(`NZ branch at 0x06D05E: ${nzBranch.byteCount} bytes, ${nzBranch.instructions.length} instructions`);
console.log(`CALL target 0x023057 preview: ${call023057.byteCount} bytes`);
console.log(`JP target 0x06AABF preview: ${jp06AABF.byteCount} bytes`);
console.log('');
console.log('DONE');
