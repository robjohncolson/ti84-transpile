#!/usr/bin/env node
// Phase 304: Disassemble 0x0997AE (edit-line display refresh dispatcher)
// and its two dispatch targets 0x05BF5C (LCD refresh) and 0x07F7BD (buffer validation).
// Maps IY+0x53 bit meanings and catalogs IY offsets, RAM accesses, sub-calls, and flow.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rom = readFileSync(path.join(__dirname, 'ROM.rom'));

const IY_BASE = 0xD00080;

function hex(v, w = 6) { return '0x' + (v >>> 0).toString(16).toUpperCase().padStart(w, '0'); }
function hex2(v) { return '0x' + (v >>> 0).toString(16).toUpperCase().padStart(2, '0'); }

// Format a decoded instruction into readable assembly
function fmtInst(inst) {
  const t = inst.tag;
  if (!t) return `??? (no tag)`;

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

// Disassemble a function: stop at first unconditional end
function disasmFunc(start, maxInstrs) {
  const instrs = disasm(start, maxInstrs);
  const result = [];
  for (const inst of instrs) {
    result.push(inst);
    if (isUnconditionalEnd(inst)) break;
  }
  return result;
}

// ══════════════════════════════════════════════════════════════
// Analysis engine
// ══════════════════════════════════════════════════════════════

function analyzeFunction(label, instrs) {
  const iyOps = [];       // BIT/SET/RES on IY+offset
  const iyAccesses = [];  // All IY+offset references
  const ramReads = [];    // LD r,(addr) where addr >= 0xD00000
  const ramWrites = [];   // LD (addr),r where addr >= 0xD00000
  const calls = [];
  const jumps = [];       // JP/JR conditional
  const jpsUnconditional = []; // JP unconditional (tail calls)

  for (const inst of instrs) {
    const t = inst.tag;

    // IY indexed operations
    if (inst.indexRegister === 'iy') {
      const offset = inst.displacement;
      const absAddr = IY_BASE + offset;
      iyAccesses.push({ pc: inst.pc, tag: t, offset, absAddr, asm: fmtInst(inst) });

      if (t === 'indexed-cb-bit' || t === 'indexed-cb-set' || t === 'indexed-cb-res') {
        const opName = t === 'indexed-cb-bit' ? 'BIT' : t === 'indexed-cb-set' ? 'SET' : 'RES';
        iyOps.push({ pc: inst.pc, op: opName, bit: inst.bit, offset, absAddr });
      }
    }

    // RAM reads: LD r,(addr)
    if (t === 'ld-reg-mem' || t === 'ld-pair-mem') {
      const addr = inst.addr;
      if (addr >= 0xD00000) {
        ramReads.push({ pc: inst.pc, addr, asm: fmtInst(inst) });
      }
    }

    // RAM writes: LD (addr),r
    if (t === 'ld-mem-reg' || t === 'ld-mem-pair') {
      const addr = inst.addr;
      if (addr >= 0xD00000) {
        ramWrites.push({ pc: inst.pc, addr, asm: fmtInst(inst) });
      }
    }

    // Calls
    if (t === 'call' || t === 'call-conditional') {
      calls.push({ pc: inst.pc, target: inst.target, cond: inst.condition || null, asm: fmtInst(inst) });
    }

    // Conditional jumps
    if (t === 'jp-conditional' || t === 'jr-conditional') {
      jumps.push({ pc: inst.pc, target: inst.target, cond: inst.condition, asm: fmtInst(inst) });
    }

    // Unconditional JP (tail call)
    if (t === 'jp') {
      jpsUnconditional.push({ pc: inst.pc, target: inst.target, asm: fmtInst(inst) });
    }
  }

  return { iyOps, iyAccesses, ramReads, ramWrites, calls, jumps, jpsUnconditional };
}

function printAnalysis(label, analysis) {
  console.log(`\n--- Analysis: ${label} ---`);

  if (analysis.iyOps.length) {
    console.log('\n  IY flag operations (BIT/SET/RES):');
    for (const c of analysis.iyOps) {
      console.log(`    ${hex(c.pc)}: ${c.op} ${c.bit},(IY+${hex2(c.offset)}) = ${hex(c.absAddr)}`);
    }
  } else {
    console.log('\n  IY flag operations: (none)');
  }

  if (analysis.iyAccesses.length) {
    console.log('\n  All IY offset accesses:');
    for (const a of analysis.iyAccesses) {
      console.log(`    ${hex(a.pc)}: ${a.asm}   [IY+${hex2(a.offset)} = ${hex(a.absAddr)}]`);
    }
  }

  if (analysis.ramReads.length) {
    console.log('\n  RAM reads (>= 0xD00000):');
    for (const r of analysis.ramReads) {
      console.log(`    ${hex(r.pc)}: ${r.asm}   [${hex(r.addr)}]`);
    }
  }

  if (analysis.ramWrites.length) {
    console.log('\n  RAM writes (>= 0xD00000):');
    for (const w of analysis.ramWrites) {
      console.log(`    ${hex(w.pc)}: ${w.asm}   [${hex(w.addr)}]`);
    }
  }

  if (analysis.calls.length) {
    console.log('\n  Sub-calls:');
    for (const c of analysis.calls) {
      console.log(`    ${hex(c.pc)}: ${c.asm}`);
    }
  } else {
    console.log('\n  Sub-calls: (none)');
  }

  if (analysis.jumps.length) {
    console.log('\n  Conditional jumps:');
    for (const j of analysis.jumps) {
      console.log(`    ${hex(j.pc)}: ${j.asm}`);
    }
  }

  if (analysis.jpsUnconditional.length) {
    console.log('\n  Unconditional JP (tail calls):');
    for (const j of analysis.jpsUnconditional) {
      console.log(`    ${hex(j.pc)}: ${j.asm}`);
    }
  }
}

// ══════════════════════════════════════════════════════════════
//  MAIN
// ══════════════════════════════════════════════════════════════

console.log('Phase 304: Edit-line display refresh dispatcher analysis');
console.log('========================================================');
console.log('IY base       = 0xD00080');
console.log('IY+0x53       = 0xD000D3 (edit line refresh flags)');
console.log('IY+0x49       = 0xD000C9 (toggled bit 0 during processing)');
console.log('Edit buffer 1 = 0xD005F8');
console.log('Edit buffer 2 = 0xD00603');

// ──────────────────────────────────────────────────────────────
// SECTION 1: 0x0997AE — main refresh dispatcher (~100 instr)
// ──────────────────────────────────────────────────────────────
console.log('\n' + '='.repeat(70));
console.log('SECTION 1: 0x0997AE — edit-line display refresh dispatcher');
console.log('='.repeat(70));

const mainInstrs = disasmFunc(0x0997AE, 100);
for (const inst of mainInstrs) console.log(printInstr(inst));
console.log(`\n  ${mainInstrs.length} instructions, ${hex(mainInstrs[0].pc)} - ${hex(mainInstrs[mainInstrs.length - 1].pc)}`);

const mainAnalysis = analyzeFunction('0x0997AE', mainInstrs);
printAnalysis('0x0997AE — main refresh dispatcher', mainAnalysis);

// ──────────────────────────────────────────────────────────────
// SECTION 2: 0x05BF5C — LCD refresh path (~80 instr)
// ──────────────────────────────────────────────────────────────
console.log('\n' + '='.repeat(70));
console.log('SECTION 2: 0x05BF5C — LCD refresh path');
console.log('='.repeat(70));

const lcdInstrs = disasmFunc(0x05BF5C, 80);
for (const inst of lcdInstrs) console.log(printInstr(inst));
console.log(`\n  ${lcdInstrs.length} instructions, ${hex(lcdInstrs[0].pc)} - ${hex(lcdInstrs[lcdInstrs.length - 1].pc)}`);

const lcdAnalysis = analyzeFunction('0x05BF5C', lcdInstrs);
printAnalysis('0x05BF5C — LCD refresh path', lcdAnalysis);

// ──────────────────────────────────────────────────────────────
// SECTION 3: 0x07F7BD — buffer validation path (~50 instr)
// ──────────────────────────────────────────────────────────────
console.log('\n' + '='.repeat(70));
console.log('SECTION 3: 0x07F7BD — buffer validation path');
console.log('='.repeat(70));

const bufInstrs = disasmFunc(0x07F7BD, 50);
for (const inst of bufInstrs) console.log(printInstr(inst));
console.log(`\n  ${bufInstrs.length} instructions, ${hex(bufInstrs[0].pc)} - ${hex(bufInstrs[bufInstrs.length - 1].pc)}`);

const bufAnalysis = analyzeFunction('0x07F7BD', bufInstrs);
printAnalysis('0x07F7BD — buffer validation path', bufAnalysis);

// ──────────────────────────────────────────────────────────────
// SECTION 4: Sub-call expansion (first 15 instr of each target)
// ──────────────────────────────────────────────────────────────
console.log('\n' + '='.repeat(70));
console.log('SECTION 4: Sub-call target expansion');
console.log('='.repeat(70));

const allCalls = [
  ...mainAnalysis.calls.map(c => ({ ...c, from: '0x0997AE' })),
  ...lcdAnalysis.calls.map(c => ({ ...c, from: '0x05BF5C' })),
  ...bufAnalysis.calls.map(c => ({ ...c, from: '0x07F7BD' })),
];

const seenTargets = new Set();
for (const c of allCalls) {
  if (seenTargets.has(c.target)) continue;
  seenTargets.add(c.target);
  console.log(`\n  CALL ${hex(c.target)} (from ${c.from}${c.cond ? ', cond: ' + c.cond : ''}):`);
  const subInstrs = disasm(c.target, 15);
  let count = 0;
  for (const si of subInstrs) {
    console.log('  ' + printInstr(si));
    count++;
    if (count >= 10 || isUnconditionalEnd(si)) break;
  }
  // Check for IY refs in sub-call
  const subIY = subInstrs.filter(si => si.indexRegister === 'iy');
  if (subIY.length) {
    console.log('    IY refs in this sub-call:');
    for (const si of subIY) {
      const offset = si.displacement;
      console.log(`      IY+${hex2(offset)} = ${hex(IY_BASE + offset)}: ${fmtInst(si)}`);
    }
  }
}

// Also expand unconditional JP targets from main function
const allJPs = [
  ...mainAnalysis.jpsUnconditional.map(j => ({ ...j, from: '0x0997AE' })),
  ...lcdAnalysis.jpsUnconditional.map(j => ({ ...j, from: '0x05BF5C' })),
  ...bufAnalysis.jpsUnconditional.map(j => ({ ...j, from: '0x07F7BD' })),
];

for (const j of allJPs) {
  if (seenTargets.has(j.target)) continue;
  seenTargets.add(j.target);
  console.log(`\n  JP ${hex(j.target)} (tail call from ${j.from}):`);
  const subInstrs = disasm(j.target, 15);
  let count = 0;
  for (const si of subInstrs) {
    console.log('  ' + printInstr(si));
    count++;
    if (count >= 10 || isUnconditionalEnd(si)) break;
  }
}

// ──────────────────────────────────────────────────────────────
// SECTION 5: IY+0x53 bit meanings summary
// ──────────────────────────────────────────────────────────────
console.log('\n' + '='.repeat(70));
console.log('SECTION 5: IY+0x53 bit meanings');
console.log('='.repeat(70));

// Collect from all three functions + their sub-calls
const allIYOps53 = [];
for (const analysis of [mainAnalysis, lcdAnalysis, bufAnalysis]) {
  for (const op of analysis.iyOps) {
    if (op.offset === 0x53) {
      allIYOps53.push(op);
    }
  }
}

// Also scan sub-calls for IY+0x53 operations
for (const c of allCalls) {
  const subInstrs = disasmFunc(c.target, 30);
  for (const si of subInstrs) {
    if (si.indexRegister === 'iy' && si.displacement === 0x53) {
      const t = si.tag;
      if (t === 'indexed-cb-bit' || t === 'indexed-cb-set' || t === 'indexed-cb-res') {
        const opName = t === 'indexed-cb-bit' ? 'BIT' : t === 'indexed-cb-set' ? 'SET' : 'RES';
        allIYOps53.push({ pc: si.pc, op: opName, bit: si.bit, offset: 0x53, absAddr: IY_BASE + 0x53, subCall: hex(c.target) });
      }
    }
  }
}

if (allIYOps53.length) {
  // Group by bit
  const byBit = {};
  for (const op of allIYOps53) {
    if (!byBit[op.bit]) byBit[op.bit] = [];
    byBit[op.bit].push(op);
  }
  for (const bit of Object.keys(byBit).sort()) {
    console.log(`\n  Bit ${bit}:`);
    for (const op of byBit[bit]) {
      const sub = op.subCall ? ` (in subcall ${op.subCall})` : '';
      console.log(`    ${hex(op.pc)}: ${op.op}${sub}`);
    }
  }
} else {
  console.log('  No direct IY+0x53 BIT/SET/RES found in these functions.');
  console.log('  (IY+0x53 checks may be in the caller 0x0997ED or 0x058ED0)');
}

// ──────────────────────────────────────────────────────────────
// SECTION 6: All IY offsets summary
// ──────────────────────────────────────────────────────────────
console.log('\n' + '='.repeat(70));
console.log('SECTION 6: All unique IY offsets across all three functions');
console.log('='.repeat(70));

const allIYOffsets = new Map();
for (const [name, analysis] of [['0x0997AE', mainAnalysis], ['0x05BF5C', lcdAnalysis], ['0x07F7BD', bufAnalysis]]) {
  for (const a of analysis.iyAccesses) {
    const key = a.offset;
    if (!allIYOffsets.has(key)) allIYOffsets.set(key, []);
    allIYOffsets.get(key).push({ fn: name, ...a });
  }
}

for (const [offset, accesses] of [...allIYOffsets.entries()].sort((a, b) => a[0] - b[0])) {
  const fns = [...new Set(accesses.map(a => a.fn))].join(', ');
  const ops = accesses.map(a => a.asm).join(' | ');
  console.log(`  IY+${hex2(offset)} = ${hex(IY_BASE + offset)}: [${fns}] ${ops}`);
}

// ──────────────────────────────────────────────────────────────
// SECTION 7: RAM address summary
// ──────────────────────────────────────────────────────────────
console.log('\n' + '='.repeat(70));
console.log('SECTION 7: All RAM addresses accessed');
console.log('='.repeat(70));

const allRAM = new Map();
for (const [name, analysis] of [['0x0997AE', mainAnalysis], ['0x05BF5C', lcdAnalysis], ['0x07F7BD', bufAnalysis]]) {
  for (const r of analysis.ramReads) {
    if (!allRAM.has(r.addr)) allRAM.set(r.addr, []);
    allRAM.get(r.addr).push({ fn: name, type: 'READ', asm: r.asm });
  }
  for (const w of analysis.ramWrites) {
    if (!allRAM.has(w.addr)) allRAM.set(w.addr, []);
    allRAM.get(w.addr).push({ fn: name, type: 'WRITE', asm: w.asm });
  }
}

for (const [addr, accesses] of [...allRAM.entries()].sort((a, b) => a[0] - b[0])) {
  const details = accesses.map(a => `${a.type} in ${a.fn}`).join(', ');
  const knownLabel =
    addr === 0xD005F8 ? ' (primary edit buffer)' :
    addr === 0xD00603 ? ' (secondary edit buffer)' :
    '';
  console.log(`  ${hex(addr)}${knownLabel}: ${details}`);
}

// ──────────────────────────────────────────────────────────────
// SECTION 8: Logical flow summary
// ──────────────────────────────────────────────────────────────
console.log('\n' + '='.repeat(70));
console.log('SECTION 8: Logical flow summary');
console.log('='.repeat(70));

console.log('\n  0x0997AE (main refresh dispatcher):');
console.log(`    ${mainInstrs.length} instructions`);
console.log(`    Calls: ${mainAnalysis.calls.map(c => hex(c.target) + (c.cond ? '(' + c.cond + ')' : '')).join(', ') || 'none'}`);
console.log(`    Conditional branches: ${mainAnalysis.jumps.length}`);
console.log(`    IY offsets touched: ${[...new Set(mainAnalysis.iyAccesses.map(a => 'IY+' + hex2(a.offset)))].join(', ') || 'none'}`);
console.log(`    RAM addrs: ${[...new Set([...mainAnalysis.ramReads.map(r => hex(r.addr)), ...mainAnalysis.ramWrites.map(w => hex(w.addr))])].join(', ') || 'none'}`);

console.log('\n  0x05BF5C (LCD refresh path):');
console.log(`    ${lcdInstrs.length} instructions`);
console.log(`    Calls: ${lcdAnalysis.calls.map(c => hex(c.target) + (c.cond ? '(' + c.cond + ')' : '')).join(', ') || 'none'}`);
console.log(`    Conditional branches: ${lcdAnalysis.jumps.length}`);
console.log(`    IY offsets touched: ${[...new Set(lcdAnalysis.iyAccesses.map(a => 'IY+' + hex2(a.offset)))].join(', ') || 'none'}`);
console.log(`    RAM addrs: ${[...new Set([...lcdAnalysis.ramReads.map(r => hex(r.addr)), ...lcdAnalysis.ramWrites.map(w => hex(w.addr))])].join(', ') || 'none'}`);

console.log('\n  0x07F7BD (buffer validation path):');
console.log(`    ${bufInstrs.length} instructions`);
console.log(`    Calls: ${bufAnalysis.calls.map(c => hex(c.target) + (c.cond ? '(' + c.cond + ')' : '')).join(', ') || 'none'}`);
console.log(`    Conditional branches: ${bufAnalysis.jumps.length}`);
console.log(`    IY offsets touched: ${[...new Set(bufAnalysis.iyAccesses.map(a => 'IY+' + hex2(a.offset)))].join(', ') || 'none'}`);
console.log(`    RAM addrs: ${[...new Set([...bufAnalysis.ramReads.map(r => hex(r.addr)), ...bufAnalysis.ramWrites.map(w => hex(w.addr))])].join(', ') || 'none'}`);

console.log('\nDone.');
