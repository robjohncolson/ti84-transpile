#!/usr/bin/env node
/**
 * probe-phase582-decode-022331.mjs
 * Decode 0x022331 — Key Processor function.
 *
 * Called from 0x08C532 (common key processing path) after key remapping.
 * Receives a normalized key code and does the actual insert/process work.
 *
 * Goals:
 *   1. Disassemble ~400 bytes starting at 0x022331
 *   2. Identify function boundary (RET/JP that exits)
 *   3. Document all CALL targets, JP/JR targets, RAM refs (D0xxxx), IY+offset ops
 *   4. Determine what it does with the key code
 *   5. Cross-reference with known functions:
 *      - 0x05C5B3 (token inserter)
 *      - 0x080064 (char classifier)
 *      - 0x08DD60 (token backward reader)
 *      - 0x09BBA6 (token advance+classify)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romPath = path.join(__dirname, 'ROM.rom');
const rom = fs.readFileSync(romPath);

function hex(v, w = 6) {
  return '0x' + (v >>> 0).toString(16).padStart(w, '0').toUpperCase();
}

function hexByte(v) {
  return '0x' + (v & 0xff).toString(16).padStart(2, '0').toUpperCase();
}

// --- Instruction formatter (comprehensive) ---
function formatInstruction(inst) {
  switch (inst.tag) {
    case 'nop': return 'NOP';
    case 'halt': return 'HALT';
    case 'di': return 'DI';
    case 'ei': return 'EI';
    case 'ret': return 'RET';
    case 'reti': return 'RETI';
    case 'retn': return 'RETN';
    case 'ret-conditional': return 'RET ' + inst.condition.toUpperCase();
    case 'rlca': return 'RLCA';
    case 'rrca': return 'RRCA';
    case 'rla': return 'RLA';
    case 'rra': return 'RRA';
    case 'daa': return 'DAA';
    case 'cpl': return 'CPL';
    case 'scf': return 'SCF';
    case 'ccf': return 'CCF';
    case 'exx': return 'EXX';
    case 'ex-af': return "EX AF, AF'";
    case 'ex-de-hl': return 'EX DE, HL';
    case 'ex-sp-hl': return 'EX (SP), HL';
    case 'ex-sp-index': return 'EX (SP), ' + inst.indexRegister.toUpperCase();

    case 'ld-reg-reg': return 'LD ' + inst.dest.toUpperCase() + ', ' + inst.src.toUpperCase();
    case 'ld-reg-imm': return 'LD ' + inst.dest.toUpperCase() + ', ' + hexByte(inst.value);
    case 'ld-pair-imm': return 'LD ' + inst.pair.toUpperCase() + ', ' + hex(inst.value);
    case 'ld-reg-mem': return 'LD ' + inst.dest.toUpperCase() + ', (' + hex(inst.addr) + ')';
    case 'ld-mem-reg': return 'LD (' + hex(inst.addr) + '), ' + inst.src.toUpperCase();
    case 'ld-pair-mem': return 'LD ' + inst.pair.toUpperCase() + ', (' + hex(inst.addr) + ')';
    case 'ld-mem-pair': return 'LD (' + hex(inst.addr) + '), ' + inst.pair.toUpperCase();
    case 'ld-ind-imm': return 'LD (HL), ' + hexByte(inst.value);
    case 'ld-ind-reg': return 'LD (' + (inst.indirectRegister || 'hl').toUpperCase() + '), ' + inst.src.toUpperCase();
    case 'ld-reg-ind': return 'LD ' + inst.dest.toUpperCase() + ', (' + (inst.indirectRegister || 'hl').toUpperCase() + ')';
    case 'ld-sp-hl': return 'LD SP, HL';
    case 'ld-sp-index': return 'LD SP, ' + inst.indexRegister.toUpperCase();
    case 'ld-a-bc': return 'LD A, (BC)';
    case 'ld-a-de': return 'LD A, (DE)';
    case 'ld-bc-a': return 'LD (BC), A';
    case 'ld-de-a': return 'LD (DE), A';

    case 'ld-index-imm': return 'LD ' + inst.indexRegister.toUpperCase() + ', ' + hex(inst.value);
    case 'ld-index-mem': return 'LD ' + inst.indexRegister.toUpperCase() + ', (' + hex(inst.addr) + ')';
    case 'ld-mem-index': return 'LD (' + hex(inst.addr) + '), ' + inst.indexRegister.toUpperCase();
    case 'ld-indexed-reg': {
      const s = inst.displacement >= 0 ? '+' : '';
      return 'LD (' + inst.indexRegister.toUpperCase() + s + inst.displacement + '), ' + inst.src.toUpperCase();
    }
    case 'ld-reg-indexed': {
      const s = inst.displacement >= 0 ? '+' : '';
      return 'LD ' + inst.dest.toUpperCase() + ', (' + inst.indexRegister.toUpperCase() + s + inst.displacement + ')';
    }
    case 'ld-indexed-imm': {
      const s = inst.displacement >= 0 ? '+' : '';
      return 'LD (' + inst.indexRegister.toUpperCase() + s + inst.displacement + '), ' + hexByte(inst.value);
    }

    case 'inc-reg': return 'INC ' + inst.reg.toUpperCase();
    case 'dec-reg': return 'DEC ' + inst.reg.toUpperCase();
    case 'inc-pair': return 'INC ' + inst.pair.toUpperCase();
    case 'dec-pair': return 'DEC ' + inst.pair.toUpperCase();
    case 'inc-index': return 'INC ' + inst.indexRegister.toUpperCase();
    case 'dec-index': return 'DEC ' + inst.indexRegister.toUpperCase();
    case 'inc-ind': return 'INC (HL)';
    case 'dec-ind': return 'DEC (HL)';

    case 'add-pair': return 'ADD HL, ' + inst.src.toUpperCase();
    case 'adc-pair': return 'ADC HL, ' + inst.src.toUpperCase();
    case 'sbc-pair': return 'SBC HL, ' + inst.src.toUpperCase();
    case 'add-index-pair': return 'ADD ' + inst.indexRegister.toUpperCase() + ', ' + inst.src.toUpperCase();

    case 'alu-reg': return inst.op.toUpperCase() + ' ' + inst.src.toUpperCase();
    case 'alu-imm': return inst.op.toUpperCase() + ' ' + hexByte(inst.value);
    case 'alu-ind': return inst.op.toUpperCase() + ' (HL)';
    case 'alu-indexed': {
      const s = inst.displacement >= 0 ? '+' : '';
      return inst.op.toUpperCase() + ' (' + inst.indexRegister.toUpperCase() + s + inst.displacement + ')';
    }

    case 'jp': return 'JP ' + hex(inst.target);
    case 'jp-conditional': return 'JP ' + inst.condition.toUpperCase() + ', ' + hex(inst.target);
    case 'jp-indirect': return 'JP (' + (inst.indirectRegister || 'hl').toUpperCase() + ')';
    case 'jr': return 'JR ' + hex(inst.target);
    case 'jr-conditional': return 'JR ' + inst.condition.toUpperCase() + ', ' + hex(inst.target);
    case 'djnz': return 'DJNZ ' + hex(inst.target);
    case 'call': return 'CALL ' + hex(inst.target);
    case 'call-conditional': return 'CALL ' + inst.condition.toUpperCase() + ', ' + hex(inst.target);
    case 'rst': return 'RST ' + hex(inst.target, 2);

    case 'push': return 'PUSH ' + inst.pair.toUpperCase();
    case 'pop': return 'POP ' + inst.pair.toUpperCase();
    case 'push-index': return 'PUSH ' + inst.indexRegister.toUpperCase();
    case 'pop-index': return 'POP ' + inst.indexRegister.toUpperCase();

    case 'in-a-imm': return 'IN A, (' + hexByte(inst.port) + ')';
    case 'out-imm-a': return 'OUT (' + hexByte(inst.port) + '), A';
    case 'in-reg': return 'IN ' + inst.dest.toUpperCase() + ', (C)';
    case 'out-reg': return 'OUT (C), ' + inst.src.toUpperCase();

    case 'rotate-reg': return inst.op.toUpperCase() + ' ' + inst.reg.toUpperCase();
    case 'rotate-ind': return inst.op.toUpperCase() + ' (HL)';
    case 'bit-test': return 'BIT ' + inst.bit + ', ' + inst.reg.toUpperCase();
    case 'bit-test-ind': return 'BIT ' + inst.bit + ', (HL)';
    case 'bit-set': return 'SET ' + inst.bit + ', ' + inst.reg.toUpperCase();
    case 'bit-set-ind': return 'SET ' + inst.bit + ', (HL)';
    case 'bit-res': return 'RES ' + inst.bit + ', ' + inst.reg.toUpperCase();
    case 'bit-res-ind': return 'RES ' + inst.bit + ', (HL)';

    case 'indexed-cb-bit': {
      const s = inst.displacement >= 0 ? '+' : '';
      return 'BIT ' + inst.bit + ', (' + inst.indexRegister.toUpperCase() + s + inst.displacement + ')';
    }
    case 'indexed-cb-set': {
      const s = inst.displacement >= 0 ? '+' : '';
      return 'SET ' + inst.bit + ', (' + inst.indexRegister.toUpperCase() + s + inst.displacement + ')';
    }
    case 'indexed-cb-res': {
      const s = inst.displacement >= 0 ? '+' : '';
      return 'RES ' + inst.bit + ', (' + inst.indexRegister.toUpperCase() + s + inst.displacement + ')';
    }
    case 'indexed-cb-rotate': {
      const s = inst.displacement >= 0 ? '+' : '';
      return inst.op.toUpperCase() + ' (' + inst.indexRegister.toUpperCase() + s + inst.displacement + ')';
    }

    case 'ldi': return 'LDI';
    case 'ldir': return 'LDIR';
    case 'ldd': return 'LDD';
    case 'lddr': return 'LDDR';
    case 'cpi': return 'CPI';
    case 'cpir': return 'CPIR';
    case 'cpd': return 'CPD';
    case 'cpdr': return 'CPDR';
    case 'ini': return 'INI';
    case 'inir': return 'INIR';
    case 'ind': return 'IND';
    case 'indr': return 'INDR';
    case 'outi': return 'OUTI';
    case 'otir': return 'OTIR';
    case 'outd': return 'OUTD';
    case 'otdr': return 'OTDR';
    case 'im': return 'IM ' + inst.interruptMode;
    case 'neg': return 'NEG';
    case 'rld': return 'RLD';
    case 'rrd': return 'RRD';
    case 'ld-i-a': return 'LD I, A';
    case 'ld-a-i': return 'LD A, I';
    case 'ld-r-a': return 'LD R, A';
    case 'ld-a-r': return 'LD A, R';
    case 'ld-mb-a': return 'LD MB, A';
    case 'ld-a-mb': return 'LD A, MB';

    case 'tst-a-reg': return 'TST A, ' + inst.src.toUpperCase();
    case 'tst-a-imm': return 'TST A, ' + hexByte(inst.value);
    case 'mlt': return 'MLT ' + inst.pair.toUpperCase();
    case 'lea-index': return 'LEA ' + inst.dest.toUpperCase() + ', ' + inst.indexRegister.toUpperCase() + (inst.displacement >= 0 ? '+' : '') + inst.displacement;
    case 'pea-index': return 'PEA ' + inst.indexRegister.toUpperCase() + (inst.displacement >= 0 ? '+' : '') + inst.displacement;

    default: return inst.tag + ' (?)';
  }
}

// --- Disassemble a range ---
function disasmRange(start, end) {
  const rows = [];
  let pc = start;
  while (pc < end) {
    try {
      const inst = decodeInstruction(rom, pc, 'adl');
      if (!inst || inst.length === 0) { pc++; continue; }
      const rawBytes = Array.from(
        rom.slice(inst.pc, inst.pc + inst.length),
        b => b.toString(16).padStart(2, '0')
      ).join(' ');
      rows.push({ pc: inst.pc, len: inst.length, bytes: rawBytes, dasm: formatInstruction(inst), inst });
      pc += inst.length;
    } catch (e) {
      rows.push({ pc, len: 1, bytes: rom[pc].toString(16).padStart(2, '0'), dasm: '??? (decode error)', inst: { tag: 'error' } });
      pc++;
    }
  }
  return rows;
}

function printRows(rows, label) {
  console.log('\n=== ' + label + ' ===');
  for (const r of rows) {
    console.log('  ' + hex(r.pc) + '  ' + r.bytes.padEnd(24) + ' ' + r.dasm);
  }
}

// --- Find callers in ROM ---
function findCallersOf(targetAddr) {
  const callers = [];
  let pc = 0;
  const romEnd = Math.min(rom.length, 0x400000);
  while (pc < romEnd) {
    try {
      const inst = decodeInstruction(rom, pc, 'adl');
      if (!inst || inst.length === 0 || inst.length > 6) { pc++; continue; }
      if (typeof inst.target === 'number' && inst.target === targetAddr) {
        if (inst.tag === 'call' || inst.tag === 'call-conditional' ||
            inst.tag === 'jp' || inst.tag === 'jp-conditional') {
          callers.push({ from: pc, tag: inst.tag, condition: inst.condition || '' });
        }
      }
      pc += inst.length;
    } catch (e) {
      pc++;
    }
  }
  return callers;
}

// Known functions for cross-referencing
const KNOWN_FUNCTIONS = {
  0x05C5B3: 'token inserter',
  0x080064: 'char classifier',
  0x08DD60: 'token backward reader',
  0x09BBA6: 'token advance+classify',
  0x08C72F: 'display refresh',
  0x08C509: 'common key processing path',
  0x08C33D: 'event loop cleanup',
  0x08C331: 'event loop top',
  0x022331: 'KEY PROCESSOR (this function)',
  0x0A27DD: 'key input setup',
  0x063033: 'init trampoline',
  0x07BF19: 'quit handler',
  0x06CF41: 'multi-key dispatcher',
  0x070372: 'font flag-guard',
  0x07B451: 'font mode initializer',
  0x03D1C3: 'key scan dispatcher',
};

// =============================================
// MAIN ANALYSIS
// =============================================
console.log('# Phase 582: Decode 0x022331 — Key Processor Function\n');

// 1. Primary disassembly — 400 bytes
const START = 0x022331;
const PRIMARY_END = START + 400;
console.log('## 1. Primary Disassembly (0x022331, 400 bytes)');
const primaryRows = disasmRange(START, PRIMARY_END);
printRows(primaryRows, 'Key Processor 0x022331 - ' + hex(PRIMARY_END));

// 2. Extended disassembly — another 200 bytes in case the function is large
const EXTENDED_END = PRIMARY_END + 200;
console.log('\n## 2. Extended Disassembly (' + hex(PRIMARY_END) + ' - ' + hex(EXTENDED_END) + ')');
const extRows = disasmRange(PRIMARY_END, EXTENDED_END);
printRows(extRows, 'Extended region');

// 3. Collect all branch/call targets, RAM refs, IY ops from the full 600-byte window
const allRows = [...primaryRows, ...extRows];
const callTargets = new Map();   // target -> [from addresses]
const jpTargets = new Map();     // target -> [from addresses]
const jrTargets = new Map();     // target -> [from addresses]
const ramRefs = new Map();       // RAM addr -> [{pc, operation}]
const iyOps = [];                // IY+offset operations
const retLocations = [];         // RET instruction locations

for (const r of allRows) {
  const inst = r.inst;

  // CALL targets
  if (inst.tag === 'call' || inst.tag === 'call-conditional') {
    if (!callTargets.has(inst.target)) callTargets.set(inst.target, []);
    callTargets.get(inst.target).push(r.pc);
  }

  // JP targets
  if (inst.tag === 'jp' || inst.tag === 'jp-conditional') {
    if (!jpTargets.has(inst.target)) jpTargets.set(inst.target, []);
    jpTargets.get(inst.target).push(r.pc);
  }

  // JR targets
  if (inst.tag === 'jr' || inst.tag === 'jr-conditional' || inst.tag === 'djnz') {
    if (!jrTargets.has(inst.target)) jrTargets.set(inst.target, []);
    jrTargets.get(inst.target).push(r.pc);
  }

  // RAM references (D0xxxx range)
  if (typeof inst.addr === 'number' && inst.addr >= 0xD00000 && inst.addr <= 0xDFFFFF) {
    if (!ramRefs.has(inst.addr)) ramRefs.set(inst.addr, []);
    ramRefs.get(inst.addr).push({ pc: r.pc, dasm: r.dasm });
  }
  if (typeof inst.value === 'number' && inst.value >= 0xD00000 && inst.value <= 0xDFFFFF) {
    if (!ramRefs.has(inst.value)) ramRefs.set(inst.value, []);
    ramRefs.get(inst.value).push({ pc: r.pc, dasm: r.dasm });
  }

  // IY+offset operations (via indexRegister field)
  if (inst.indexRegister === 'iy' && typeof inst.displacement === 'number') {
    iyOps.push({ pc: r.pc, dasm: r.dasm, offset: inst.displacement });
  }

  // RET locations
  if (inst.tag === 'ret' || inst.tag === 'reti' || inst.tag === 'retn' || inst.tag === 'ret-conditional') {
    retLocations.push({ pc: r.pc, dasm: r.dasm });
  }
}

// 4. Report: CALL targets
console.log('\n## 3. CALL Targets');
const sortedCalls = [...callTargets.entries()].sort((a, b) => a[0] - b[0]);
for (const [target, fromAddrs] of sortedCalls) {
  const known = KNOWN_FUNCTIONS[target] || '';
  const knownLabel = known ? '  *** ' + known + ' ***' : '';
  console.log('  CALL ' + hex(target) + '  from ' + fromAddrs.map(a => hex(a)).join(', ') + knownLabel);
}

// 5. Report: JP targets
console.log('\n## 4. JP Targets');
const sortedJPs = [...jpTargets.entries()].sort((a, b) => a[0] - b[0]);
for (const [target, fromAddrs] of sortedJPs) {
  const known = KNOWN_FUNCTIONS[target] || '';
  const knownLabel = known ? '  *** ' + known + ' ***' : '';
  const inRange = (target >= START && target < EXTENDED_END) ? ' (internal)' : ' (external)';
  console.log('  JP ' + hex(target) + '  from ' + fromAddrs.map(a => hex(a)).join(', ') + inRange + knownLabel);
}

// 6. Report: JR targets
console.log('\n## 5. JR/DJNZ Targets');
const sortedJRs = [...jrTargets.entries()].sort((a, b) => a[0] - b[0]);
for (const [target, fromAddrs] of sortedJRs) {
  const inRange = (target >= START && target < EXTENDED_END) ? ' (internal)' : ' (external)';
  console.log('  JR ' + hex(target) + '  from ' + fromAddrs.map(a => hex(a)).join(', ') + inRange);
}

// 7. Report: RAM references
console.log('\n## 6. RAM References (D0xxxx+)');
const sortedRAM = [...ramRefs.entries()].sort((a, b) => a[0] - b[0]);
for (const [addr, refs] of sortedRAM) {
  console.log('  ' + hex(addr) + ':');
  for (const ref of refs) {
    console.log('    ' + hex(ref.pc) + '  ' + ref.dasm);
  }
}

// 8. Report: IY+offset operations
console.log('\n## 7. IY+offset Operations');
const uniqueOffsets = new Set();
for (const op of iyOps) {
  uniqueOffsets.add(op.offset);
  console.log('  ' + hex(op.pc) + '  ' + op.dasm + '  (IY+' + op.offset + ' = 0x' + (op.offset & 0xff).toString(16).padStart(2, '0') + ')');
}
console.log('\n  Unique IY offsets: ' + [...uniqueOffsets].sort((a, b) => a - b).map(o => 'IY+' + o + ' (0x' + (o & 0xff).toString(16).padStart(2, '0') + ')').join(', '));

// 9. Report: RET locations
console.log('\n## 8. RET Locations');
for (const r of retLocations) {
  console.log('  ' + hex(r.pc) + '  ' + r.dasm);
}

// 10. Function boundary analysis
console.log('\n## 9. Function Boundary Analysis');
let firstRet = null;
for (const r of allRows) {
  if (r.inst.tag === 'ret' && r.pc >= START) {
    firstRet = r.pc;
    break;
  }
}
if (firstRet) {
  console.log('  First unconditional RET: ' + hex(firstRet));
  console.log('  Function size (to first RET): ' + (firstRet - START + 1) + ' bytes');
}

// External tail-JPs
for (const r of allRows) {
  if (r.inst.tag === 'jp' && r.pc >= START) {
    const target = r.inst.target;
    if (target < START || target >= EXTENDED_END) {
      console.log('  Tail JP at ' + hex(r.pc) + ' -> ' + hex(target) + (KNOWN_FUNCTIONS[target] ? ' (' + KNOWN_FUNCTIONS[target] + ')' : ''));
    }
  }
}

// 11. Cross-reference with known functions
console.log('\n## 10. Cross-Reference with Known Functions');
for (const [targetStr, name] of Object.entries(KNOWN_FUNCTIONS)) {
  const addr = parseInt(targetStr);
  if (callTargets.has(addr)) {
    console.log('  CALLS ' + hex(addr) + ' (' + name + ') from: ' + callTargets.get(addr).map(a => hex(a)).join(', '));
  }
  if (jpTargets.has(addr)) {
    console.log('  JPs to ' + hex(addr) + ' (' + name + ') from: ' + jpTargets.get(addr).map(a => hex(a)).join(', '));
  }
}

// 12. Find callers of 0x022331 in the ROM
console.log('\n## 11. Callers of 0x022331 in ROM');
const callers = findCallersOf(0x022331);
console.log('  Total callers: ' + callers.length);
for (const c of callers) {
  const label = KNOWN_FUNCTIONS[c.from] ? ' (' + KNOWN_FUNCTIONS[c.from] + ')' : '';
  console.log('  ' + hex(c.from) + '  ' + c.tag + (c.condition ? ' ' + c.condition : '') + label);
  // Show context around each caller
  const ctxRows = disasmRange(Math.max(0, c.from - 12), c.from + 16);
  for (const r of ctxRows) {
    const marker = (r.pc === c.from) ? ' >>> ' : '     ';
    console.log(marker + hex(r.pc) + '  ' + r.bytes.padEnd(24) + ' ' + r.dasm);
  }
}

// 13. Decode the prologues of all CALL targets (first 20 bytes each)
console.log('\n## 12. CALL Target Prologues');
for (const [target] of sortedCalls) {
  if (target < 0x400000) {
    const known = KNOWN_FUNCTIONS[target] || 'unknown';
    console.log('\n--- ' + hex(target) + ' (' + known + ') ---');
    const prologueRows = disasmRange(target, target + 24);
    for (const r of prologueRows) {
      console.log('  ' + hex(r.pc) + '  ' + r.bytes.padEnd(24) + ' ' + r.dasm);
    }
  }
}

// 14. Key code flow analysis
console.log('\n## 13. Key Code Flow Analysis');
console.log('Looking for key code register usage patterns...');
for (const r of allRows) {
  if (r.pc < START || r.pc >= EXTENDED_END) continue;
  const inst = r.inst;
  // CP instructions (comparisons — likely checking key code values)
  if (inst.tag === 'alu-imm' && inst.op === 'cp') {
    console.log('  ' + hex(r.pc) + '  ' + r.dasm + '  (comparison with ' + hexByte(inst.value) + ' = ' + inst.value + ' decimal)');
  }
  // LD A from memory (loading key code or related state)
  if (inst.tag === 'ld-reg-mem' && inst.dest === 'a') {
    console.log('  ' + hex(r.pc) + '  ' + r.dasm + '  (load A from RAM)');
  }
  // LD (mem), A (storing key code or result)
  if (inst.tag === 'ld-mem-reg' && inst.src === 'a') {
    console.log('  ' + hex(r.pc) + '  ' + r.dasm + '  (store A to RAM)');
  }
  // SUB / AND / OR on A
  if (inst.tag === 'alu-imm' && (inst.op === 'sub' || inst.op === 'and' || inst.op === 'or')) {
    console.log('  ' + hex(r.pc) + '  ' + r.dasm);
  }
}

// 15. Context before 0x022331 (check if it is part of a larger function)
console.log('\n## 14. Context Before 0x022331 (32 bytes)');
const beforeRows = disasmRange(START - 32, START);
printRows(beforeRows, 'Pre-context 0x022311 - 0x022331');

// 16. Summary statistics
console.log('\n## 15. Summary');
console.log('  Function start: ' + hex(START));
console.log('  CALL targets: ' + callTargets.size);
console.log('  JP targets: ' + jpTargets.size);
console.log('  JR/DJNZ targets: ' + jrTargets.size);
console.log('  RAM references: ' + ramRefs.size);
console.log('  IY+offset ops: ' + iyOps.length + ' (' + uniqueOffsets.size + ' unique offsets)');
console.log('  RET locations: ' + retLocations.length);
console.log('  Callers in ROM: ' + callers.length);

console.log('\nDone.');
