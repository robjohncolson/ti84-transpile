#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rom = readFileSync(path.join(__dirname, 'ROM.rom'));

function hex(v, w = 6) { return '0x' + (v >>> 0).toString(16).toUpperCase().padStart(w, '0'); }
function hex2(v) { return '0x' + (v >>> 0).toString(16).toUpperCase().padStart(2, '0'); }

// Format a decoded instruction into readable assembly
function fmtInst(inst) {
  const t = inst.tag;
  if (!t) return `??? (no tag)`;

  // Simple single-word tags
  const simple = ['nop','ret','halt','di','ei','exx','rlca','rrca','rla','rra',
    'daa','cpl','scf','ccf','neg','reti','retn','ldi','ldir','ldd','lddr',
    'cpi','cpir','cpd','cpdr','ini','outi','ind','outd','inir','otir','indr',
    'otdr','rrd','rld','slp','stmix','rsmix','otimr','ex-af','ex-de-hl'];
  if (simple.includes(t)) return t.replace(/-/g, ' ').toUpperCase();

  switch (t) {
    case 'ld-reg-reg': return `LD ${inst.dest}, ${inst.src}`.toUpperCase();
    case 'ld-reg-imm': return `LD ${inst.dest}, ${hex2(inst.value)}`.toUpperCase();
    case 'ld-reg-ind': return `LD ${inst.dest}, (${inst.src})`.toUpperCase();
    case 'ld-ind-reg': return `LD (${inst.dest}), ${inst.src}`.toUpperCase();
    case 'ld-ind-imm': return `LD (HL), ${hex2(inst.value)}`;
    case 'ld-pair-imm': return `LD ${inst.pair}, ${hex(inst.value)}`.toUpperCase();
    case 'ld-pair-mem': return `LD ${inst.pair}, (${hex(inst.addr)})`.toUpperCase();
    case 'ld-mem-pair': return `LD (${hex(inst.addr)}), ${inst.pair}`.toUpperCase();
    case 'ld-mem-reg': return `LD (${hex(inst.addr)}), ${inst.src || 'A'}`.toUpperCase();
    case 'ld-reg-mem': return `LD ${inst.dest || 'A'}, (${hex(inst.addr)})`.toUpperCase();
    case 'ld-pair-ind': return `LD ${inst.pair}, (${inst.src})`.toUpperCase();
    case 'ld-ind-pair': return `LD (${inst.dest}), ${inst.pair}`.toUpperCase();
    case 'ld-sp-hl': return 'LD SP, HL';
    case 'ld-sp-pair': return `LD SP, ${inst.pair}`.toUpperCase();
    case 'ld-special': return `LD ${inst.dest}, ${inst.src}`.toUpperCase();
    case 'ld-mb-a': return 'LD MB, A';
    case 'ld-a-mb': return 'LD A, MB';
    case 'ld-reg-ixd': return `LD ${inst.dest}, (${inst.indexRegister}${inst.displacement >= 0 ? '+' : ''}${inst.displacement})`.toUpperCase();
    case 'ld-ixd-reg': return `LD (${inst.indexRegister}${inst.displacement >= 0 ? '+' : ''}${inst.displacement}), ${inst.src}`.toUpperCase();
    case 'ld-ixd-imm': return `LD (${inst.indexRegister}${inst.displacement >= 0 ? '+' : ''}${inst.displacement}), ${hex2(inst.value)}`.toUpperCase();
    case 'ld-pair-indexed': return `LD ${inst.pair}, (${inst.indexRegister}${inst.displacement >= 0 ? '+' : ''}${inst.displacement})`.toUpperCase();
    case 'ld-indexed-pair': return `LD (${inst.indexRegister}${inst.displacement >= 0 ? '+' : ''}${inst.displacement}), ${inst.pair}`.toUpperCase();
    case 'ld-ixiy-indexed': return `LD ${inst.dest}, (${inst.indexRegister}${inst.displacement >= 0 ? '+' : ''}${inst.displacement})`.toUpperCase();
    case 'ld-indexed-ixiy': return `LD (${inst.indexRegister}${inst.displacement >= 0 ? '+' : ''}${inst.displacement}), ${inst.src}`.toUpperCase();
    case 'inc-reg': return `INC ${inst.reg}`.toUpperCase();
    case 'dec-reg': return `DEC ${inst.reg}`.toUpperCase();
    case 'inc-pair': return `INC ${inst.pair}`.toUpperCase();
    case 'dec-pair': return `DEC ${inst.pair}`.toUpperCase();
    case 'inc-ixd': return `INC (${inst.indexRegister}${inst.displacement >= 0 ? '+' : ''}${inst.displacement})`.toUpperCase();
    case 'dec-ixd': return `DEC (${inst.indexRegister}${inst.displacement >= 0 ? '+' : ''}${inst.displacement})`.toUpperCase();
    case 'add-pair': return `ADD ${inst.dest}, ${inst.src}`.toUpperCase();
    case 'adc-pair': return `ADC HL, ${inst.src}`.toUpperCase();
    case 'sbc-pair': return `SBC HL, ${inst.src}`.toUpperCase();
    case 'alu-reg': return `${inst.op} A, ${inst.src}`.toUpperCase();
    case 'alu-imm': return `${inst.op} A, ${hex2(inst.value)}`.toUpperCase();
    case 'alu-ixd': return `${inst.op} A, (${inst.indexRegister}${inst.displacement >= 0 ? '+' : ''}${inst.displacement})`.toUpperCase();
    case 'push': return `PUSH ${inst.pair}`.toUpperCase();
    case 'pop': return `POP ${inst.pair}`.toUpperCase();
    case 'call': return `CALL ${hex(inst.target)}`;
    case 'call-conditional': return `CALL ${inst.condition.toUpperCase()}, ${hex(inst.target)}`;
    case 'jp': return `JP ${hex(inst.target)}`;
    case 'jp-conditional': return `JP ${inst.condition.toUpperCase()}, ${hex(inst.target)}`;
    case 'jp-indirect': return `JP (${(inst.indirectRegister || 'HL').toUpperCase()})`;
    case 'jr': return `JR ${hex(inst.target)}`;
    case 'jr-conditional': return `JR ${inst.condition.toUpperCase()}, ${hex(inst.target)}`;
    case 'djnz': return `DJNZ ${hex(inst.target)}`;
    case 'ret-conditional': return `RET ${inst.condition.toUpperCase()}`;
    case 'rst': return `RST ${hex2(inst.vector)}`;
    case 'bit-test': return `BIT ${inst.bit}, ${inst.reg}`.toUpperCase();
    case 'bit-res': return `RES ${inst.bit}, ${inst.reg}`.toUpperCase();
    case 'bit-set': return `SET ${inst.bit}, ${inst.reg}`.toUpperCase();
    case 'bit-test-ind': return `BIT ${inst.bit}, (HL)`;
    case 'bit-res-ind': return `RES ${inst.bit}, (HL)`;
    case 'bit-set-ind': return `SET ${inst.bit}, (HL)`;
    case 'indexed-cb-bit': return `BIT ${inst.bit}, (${inst.indexRegister}${inst.displacement >= 0 ? '+' : ''}${inst.displacement})`.toUpperCase();
    case 'indexed-cb-res': return `RES ${inst.bit}, (${inst.indexRegister}${inst.displacement >= 0 ? '+' : ''}${inst.displacement})`.toUpperCase();
    case 'indexed-cb-set': return `SET ${inst.bit}, (${inst.indexRegister}${inst.displacement >= 0 ? '+' : ''}${inst.displacement})`.toUpperCase();
    case 'indexed-cb-rotate': return `${inst.operation} (${inst.indexRegister}${inst.displacement >= 0 ? '+' : ''}${inst.displacement})`.toUpperCase();
    case 'rotate-reg': return `${inst.operation} ${inst.reg}`.toUpperCase();
    case 'rotate-ind': return `${inst.operation} (HL)`.toUpperCase();
    case 'in-imm': return `IN A, (${hex2(inst.port)})`;
    case 'out-imm': return `OUT (${hex2(inst.port)}), A`;
    case 'in-reg': return `IN ${inst.reg}, (C)`.toUpperCase();
    case 'out-reg': return `OUT (C), ${inst.reg}`.toUpperCase();
    case 'in0': return `IN0 ${inst.reg}, (${hex2(inst.port)})`.toUpperCase();
    case 'out0': return `OUT0 (${hex2(inst.port)}), ${inst.reg}`.toUpperCase();
    case 'im': return `IM ${inst.value}`;
    case 'ex-sp-hl': return 'EX (SP), HL';
    case 'ex-sp-pair': return `EX (SP), ${inst.pair}`.toUpperCase();
    case 'lea': return `LEA ${inst.dest}, ${inst.base}${inst.displacement >= 0 ? '+' : ''}${inst.displacement}`.toUpperCase();
    case 'mlt': return `MLT ${inst.reg}`.toUpperCase();
    case 'tst-reg': return `TST A, ${inst.reg}`.toUpperCase();
    case 'tst-ind': return 'TST A, (HL)';
    case 'tst-imm': return `TST A, ${hex2(inst.value)}`;
    case 'tstio': return `TSTIO ${hex2(inst.value)}`;
    default: return `${t} ${JSON.stringify(inst)}`;
  }
}

function disasm(start, maxInstrs) {
  const instrs = [];
  let pc = start;
  for (let i = 0; i < maxInstrs; i++) {
    if (pc >= rom.length) break;
    const inst = decodeInstruction(rom, pc, 'adl');
    if (!inst || inst.length === 0) {
      instrs.push({ pc, tag: 'db', length: 1, raw: rom[pc] });
      pc++;
    } else {
      instrs.push(inst);
      pc = inst.pc + inst.length;
    }
  }
  return instrs;
}

function printInstr(inst) {
  const rawBytes = [];
  for (let b = 0; b < inst.length; b++) rawBytes.push(hex2(rom[inst.pc + b]));
  const asm = inst.tag === 'db' ? `DB ${hex2(inst.raw)}` : fmtInst(inst);
  return `  ${hex(inst.pc)}: ${rawBytes.join(' ').padEnd(20)} ${asm}`;
}

function isUnconditionalEnd(inst) {
  if (!inst.tag) return false;
  if (inst.tag === 'ret') return true;
  if (inst.tag === 'jp' || inst.tag === 'jp-indirect') return true;
  if (inst.tag === 'reti' || inst.tag === 'retn') return true;
  return false;
}

// Helper to detect IY references in an instruction
function getIYRef(inst) {
  const str = JSON.stringify(inst);
  // Check for indexRegister: 'iy' or base: 'iy'
  if (str.includes('"iy"') || str.includes('"IY"')) {
    return inst;
  }
  return null;
}

// ══════════════════════════════════════════════════════════════
// 1. Disassemble 0x0997ED
// ══════════════════════════════════════════════════════════════
console.log('='.repeat(70));
console.log('SECTION 1: Disassemble 0x0997ED (handler called from 0x058EC6)');
console.log('='.repeat(70));

const mainInstrs = disasm(0x0997ED, 200);

// Find function end: stop at first unconditional RET/JP after start
let funcEndIdx = mainInstrs.length;
for (let i = 0; i < mainInstrs.length; i++) {
  console.log(printInstr(mainInstrs[i]));
  if (isUnconditionalEnd(mainInstrs[i])) {
    funcEndIdx = i + 1;
    break;
  }
}

const funcInstrs = mainInstrs.slice(0, funcEndIdx);
console.log(`\n  Function: ${hex(funcInstrs[0].pc)} - ${hex(funcInstrs[funcEndIdx - 1].pc)} (${funcEndIdx} instructions)`);

// ══════════════════════════════════════════════════════════════
// 2. Trace CALL targets
// ══════════════════════════════════════════════════════════════
console.log('\n' + '='.repeat(70));
console.log('SECTION 2: CALL targets within 0x0997ED');
console.log('='.repeat(70));

const callTargets = [];
for (const inst of funcInstrs) {
  if (inst.tag === 'call' || inst.tag === 'call-conditional') {
    callTargets.push({ from: inst.pc, target: inst.target, tag: inst.tag, cond: inst.condition });
  }
}

if (callTargets.length === 0) {
  console.log('  No CALL instructions found in function body.');
} else {
  for (const ct of callTargets) {
    const condStr = ct.cond ? ` (${ct.cond.toUpperCase()})` : '';
    console.log(`\n  CALL ${hex(ct.target)}${condStr} from ${hex(ct.from)}`);
    console.log('  First ~10 instructions of target:');
    const subInstrs = disasm(ct.target, 15);
    let count = 0;
    for (const si of subInstrs) {
      console.log('  ' + printInstr(si));
      count++;
      if (count >= 10 || isUnconditionalEnd(si)) break;
    }
  }
}

// ══════════════════════════════════════════════════════════════
// 3. IY flag dependencies
// ══════════════════════════════════════════════════════════════
console.log('\n' + '='.repeat(70));
console.log('SECTION 3: IY flag dependencies');
console.log('='.repeat(70));

const iyRefs = [];
for (const inst of funcInstrs) {
  if (getIYRef(inst)) {
    iyRefs.push(inst);
  }
}

if (iyRefs.length === 0) {
  console.log('  No direct IY references in function body.');
} else {
  console.log('  Direct IY references:');
  for (const inst of iyRefs) {
    console.log('  ' + printInstr(inst));
  }
}

// Check subcalls too
console.log('\n  IY references in subcalls:');
let foundSubIY = false;
for (const ct of callTargets) {
  const subInstrs = disasm(ct.target, 30);
  for (const si of subInstrs) {
    if (getIYRef(si)) {
      foundSubIY = true;
      console.log(`    in ${hex(ct.target)}: ` + printInstr(si));
    }
    if (isUnconditionalEnd(si)) break;
  }
}
if (!foundSubIY) console.log('    (none found)');

// ══════════════════════════════════════════════════════════════
// 4. Search ROM for all callers of 0x0997ED
// ══════════════════════════════════════════════════════════════
console.log('\n' + '='.repeat(70));
console.log('SECTION 4: ROM-wide callers of 0x0997ED (pattern: CD ED 97 09)');
console.log('='.repeat(70));

const callers = [];
for (let i = 0; i < rom.length - 3; i++) {
  if (rom[i] === 0xCD && rom[i + 1] === 0xED && rom[i + 2] === 0x97 && rom[i + 3] === 0x09) {
    callers.push(i);
  }
}
console.log(`  Found ${callers.length} caller(s):`);

for (const addr of callers) {
  console.log(`\n  Caller at ${hex(addr)}:`);
  // Show surrounding context
  const contextBefore = disasm(Math.max(0, addr - 15), 20);
  for (const ci of contextBefore) {
    if (ci.pc > addr + 10) break;
    const marker = ci.pc === addr ? '  <<< CALL 0x0997ED' : '';
    console.log('    ' + printInstr(ci) + marker);
  }
}

// Also search for JP to 0x0997ED (C3 ED 97 09)
const jpCallers = [];
for (let i = 0; i < rom.length - 3; i++) {
  if (rom[i] === 0xC3 && rom[i + 1] === 0xED && rom[i + 2] === 0x97 && rom[i + 3] === 0x09) {
    jpCallers.push(i);
  }
}
if (jpCallers.length > 0) {
  console.log(`\n  Also found ${jpCallers.length} JP reference(s):`);
  for (const addr of jpCallers) {
    console.log(`    JP at ${hex(addr)}`);
  }
}

// ══════════════════════════════════════════════════════════════
// 5. Summary / characterization
// ══════════════════════════════════════════════════════════════
console.log('\n' + '='.repeat(70));
console.log('SECTION 5: Summary and characterization');
console.log('='.repeat(70));

console.log(`\nFunction at 0x0997ED:`);
console.log(`  Instructions: ${funcInstrs.length}`);
console.log(`  CALL targets: ${callTargets.length}`);
console.log(`  IY refs in body: ${iyRefs.length}`);
console.log(`  External CALL callers: ${callers.length}`);
console.log(`  External JP callers: ${jpCallers.length}`);

// Analyze what the function does
const allTags = funcInstrs.map(i => i.tag);
const hasPortIO = allTags.some(t => ['in-reg', 'out-reg', 'in-imm', 'out-imm', 'in0', 'out0'].includes(t));
const hasBlockXfer = allTags.some(t => ['ldi', 'ldir', 'ldd', 'lddr'].includes(t));
const hasRST = allTags.some(t => t === 'rst');

// Check for memory addresses in range D00000-D0FFFF (OS RAM), E00000-E0FFFF (LCD), F50000 (keyboard)
const memAddrs = [];
for (const inst of funcInstrs) {
  if (inst.addr !== undefined) memAddrs.push(inst.addr);
  if (inst.value !== undefined && inst.value > 0x10000) memAddrs.push(inst.value);
  if (inst.target !== undefined && (inst.tag === 'call' || inst.tag === 'call-conditional')) memAddrs.push(inst.target);
}

const lcdRefs = memAddrs.filter(a => a >= 0xE00000 && a <= 0xE0FFFF);
const kbdRefs = memAddrs.filter(a => a >= 0xF50000 && a <= 0xF5FFFF);
const osRamRefs = memAddrs.filter(a => a >= 0xD00000 && a <= 0xD0FFFF);

console.log(`\n  Port I/O: ${hasPortIO}`);
console.log(`  Block transfers: ${hasBlockXfer}`);
console.log(`  RST calls: ${hasRST}`);
console.log(`  LCD MMIO refs: ${lcdRefs.length > 0 ? lcdRefs.map(hex).join(', ') : 'none'}`);
console.log(`  Keyboard MMIO refs: ${kbdRefs.length > 0 ? kbdRefs.map(hex).join(', ') : 'none'}`);
console.log(`  OS RAM refs: ${osRamRefs.length > 0 ? osRamRefs.map(hex).join(', ') : 'none'}`);

// Classify
console.log('\n  Classification clues:');
console.log(`    Called from 0x058EC6 which checks IY+0x53 bit 7`);
console.log(`    IY+0x53 = 0xD000D3 (OS flags area)`);
console.log(`    0x058EC6 clears bit 5 of (IY+0x53), then checks bit 7`);
console.log(`    If bit 7 set, calls this handler, then clears bit 7`);
console.log(`    Pattern: "if flag set, call handler, clear flag" = deferred/pending action dispatch`);

// List all unique call targets for cross-referencing
if (callTargets.length > 0) {
  console.log('\n  All call targets for cross-reference:');
  for (const ct of callTargets) {
    console.log(`    ${hex(ct.target)}${ct.cond ? ' (conditional: ' + ct.cond + ')' : ''}`);
  }
}
