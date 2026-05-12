#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rom = readFileSync(path.join(__dirname, 'ROM.rom'));

function hex(v, w = 6) { return '0x' + (v >>> 0).toString(16).toUpperCase().padStart(w, '0'); }
function hex2(v) { return '0x' + (v >>> 0).toString(16).toUpperCase().padStart(2, '0'); }

// Pretty-print a decoded instruction (copied from sibling probes)
function fmtInst(inst) {
  const t = inst.tag;
  if (t === 'nop') return 'NOP';
  if (t === 'ret') return 'RET';
  if (t === 'ret-conditional') return `RET ${inst.condition.toUpperCase()}`;
  if (t === 'call') return `CALL ${hex(inst.target)}`;
  if (t === 'call-conditional') return `CALL ${inst.condition.toUpperCase()}, ${hex(inst.target)}`;
  if (t === 'jp') return `JP ${hex(inst.target)}`;
  if (t === 'jp-conditional') return `JP ${inst.condition.toUpperCase()}, ${hex(inst.target)}`;
  if (t === 'jp-indirect') return `JP (${(inst.register || inst.indirectRegister || 'hl').toUpperCase()})`;
  if (t === 'jr') return `JR ${hex(inst.target)}`;
  if (t === 'jr-conditional') return `JR ${inst.condition.toUpperCase()}, ${hex(inst.target)}`;
  if (t === 'djnz') return `DJNZ ${hex(inst.target)}`;
  if (t === 'ld-reg-imm') return `LD ${inst.dest.toUpperCase()}, ${hex2(inst.value)}`;
  if (t === 'ld-pair-imm') return `LD ${inst.pair.toUpperCase()}, ${hex(inst.value)}`;
  if (t === 'ld-reg-reg') return `LD ${inst.dest.toUpperCase()}, ${inst.src.toUpperCase()}`;
  if (t === 'ld-reg-ind') return `LD ${inst.dest.toUpperCase()}, (${(inst.src||'hl').toUpperCase()})`;
  if (t === 'ld-ind-reg') return `LD (${(inst.dest||'hl').toUpperCase()}), ${inst.src.toUpperCase()}`;
  if (t === 'ld-ind-imm') return `LD (HL), ${hex2(inst.value)}`;
  if (t === 'ld-mem-reg') return `LD (${hex(inst.addr)}), ${(inst.src||'a').toUpperCase()}`;
  if (t === 'ld-reg-mem') return `LD ${inst.dest ? inst.dest.toUpperCase() : 'A'}, (${hex(inst.addr)})`;
  if (t === 'ld-mem-pair') return `LD (${hex(inst.addr)}), ${inst.pair.toUpperCase()}` + (inst.direction === 'to-mem' ? ' [store]' : ' [load]');
  if (t === 'ld-pair-mem') return `LD ${inst.pair.toUpperCase()}, (${hex(inst.addr)})` + (inst.direction === 'to-mem' ? ' [store]' : ' [load]');
  if (t === 'ld-indexed') return `LD ${(inst.dest||'?').toUpperCase()}, (${(inst.register||inst.indexRegister||'ix').toUpperCase()}+${inst.offset||inst.displacement||0})`;
  if (t === 'ld-to-indexed') return `LD (${(inst.register||inst.indexRegister||'ix').toUpperCase()}+${inst.offset||inst.displacement||0}), ${(inst.src||'?').toUpperCase()}`;
  if (t === 'ld-indexed-imm') return `LD (${(inst.register||inst.indexRegister||'ix').toUpperCase()}+${inst.offset||inst.displacement||0}), ${hex2(inst.value)}`;
  if (t === 'ld-indexed-pair') return `LD (${(inst.register||inst.indexRegister||'ix').toUpperCase()}+${inst.offset||inst.displacement||0}), ${inst.pair.toUpperCase()}`;
  if (t === 'ld-pair-indexed') return `LD ${inst.pair.toUpperCase()}, (${(inst.register||inst.indexRegister||'ix').toUpperCase()}+${inst.offset||inst.displacement||0})`;
  if (t === 'ld-sp-hl') return 'LD SP, HL';
  if (t === 'ld-ind-pair') return `LD (${(inst.dest||'hl').toUpperCase()}), ${inst.pair.toUpperCase()}`;
  if (t === 'push') return `PUSH ${inst.pair.toUpperCase()}`;
  if (t === 'pop') return `POP ${inst.pair.toUpperCase()}`;
  if (t === 'inc-reg') return `INC ${inst.reg.toUpperCase()}`;
  if (t === 'dec-reg') return `DEC ${inst.reg.toUpperCase()}`;
  if (t === 'inc-pair') return `INC ${inst.pair.toUpperCase()}`;
  if (t === 'dec-pair') return `DEC ${inst.pair.toUpperCase()}`;
  if (t === 'add-pair') return `ADD ${inst.dest.toUpperCase()}, ${inst.src.toUpperCase()}`;
  if (t === 'alu-reg') return `${inst.op.toUpperCase()} ${(inst.reg||inst.src||'?').toUpperCase()}`;
  if (t === 'alu-imm') return `${inst.op.toUpperCase()} ${hex2(inst.value)}`;
  if (t === 'alu-ind') return `${inst.op.toUpperCase()} (HL)`;
  if (t === 'alu-indexed' || t === 'alu-ixd') return `${inst.op.toUpperCase()} (${(inst.register||inst.indexRegister||'ix').toUpperCase()}+${inst.offset||inst.displacement||0})`;
  if (t === 'rst') return `RST ${hex2(inst.vector)}`;
  if (t === 'ex-af') return "EX AF, AF'";
  if (t === 'exx') return 'EXX';
  if (t === 'ex-de-hl') return 'EX DE, HL';
  if (t === 'ex-sp-hl') return 'EX (SP), HL';
  if (t === 'ex-sp-ix') return `EX (SP), ${(inst.register||'ix').toUpperCase()}`;
  if (t === 'di') return 'DI';
  if (t === 'ei') return 'EI';
  if (t === 'halt') return 'HALT';
  if (t === 'scf') return 'SCF';
  if (t === 'ccf') return 'CCF';
  if (t === 'cpl') return 'CPL';
  if (t === 'daa') return 'DAA';
  if (t === 'rla') return 'RLA';
  if (t === 'rra') return 'RRA';
  if (t === 'rlca') return 'RLCA';
  if (t === 'rrca') return 'RRCA';
  if (t === 'ldir') return 'LDIR';
  if (t === 'lddr') return 'LDDR';
  if (t === 'ldi') return 'LDI';
  if (t === 'ldd') return 'LDD';
  if (t === 'cpir') return 'CPIR';
  if (t === 'cpdr') return 'CPDR';
  if (t === 'cpi') return 'CPI';
  if (t === 'cpd') return 'CPD';
  if (t === 'outi') return 'OUTI';
  if (t === 'outd') return 'OUTD';
  if (t === 'otir') return 'OTIR';
  if (t === 'otdr') return 'OTDR';
  if (t === 'ini') return 'INI';
  if (t === 'ind') return 'IND';
  if (t === 'inir') return 'INIR';
  if (t === 'indr') return 'INDR';
  if (t === 'in-reg') return `IN ${(inst.reg||'a').toUpperCase()}, (C)`;
  if (t === 'out-reg') return `OUT (C), ${(inst.reg||'a').toUpperCase()}`;
  if (t === 'in-imm') return `IN A, (${hex2(inst.port)})`;
  if (t === 'out-imm') return `OUT (${hex2(inst.port)}), A`;
  if (t === 'im') return `IM ${inst.mode}`;
  if (t === 'bit-test') return `BIT ${inst.bit}, ${inst.reg.toUpperCase()}`;
  if (t === 'bit-test-ind') return `BIT ${inst.bit}, (${(inst.indirectRegister||'hl').toUpperCase()})`;
  if (t === 'bit-set') return `SET ${inst.bit}, ${inst.reg.toUpperCase()}`;
  if (t === 'bit-set-ind') return `SET ${inst.bit}, (${(inst.indirectRegister||'hl').toUpperCase()})`;
  if (t === 'bit-res') return `RES ${inst.bit}, ${inst.reg.toUpperCase()}`;
  if (t === 'bit-res-ind') return `RES ${inst.bit}, (${(inst.indirectRegister||'hl').toUpperCase()})`;
  if (t === 'bit-test-indexed') return `BIT ${inst.bit}, (${(inst.register||inst.indexRegister||'ix').toUpperCase()}+${inst.offset||inst.displacement||0})`;
  if (t === 'bit-set-indexed') return `SET ${inst.bit}, (${(inst.register||inst.indexRegister||'ix').toUpperCase()}+${inst.offset||inst.displacement||0})`;
  if (t === 'bit-res-indexed') return `RES ${inst.bit}, (${(inst.register||inst.indexRegister||'ix').toUpperCase()}+${inst.offset||inst.displacement||0})`;
  if (t === 'rotate-reg') return `${inst.op.toUpperCase()} ${inst.reg.toUpperCase()}`;
  if (t === 'rotate-ind') return `${inst.op.toUpperCase()} (${(inst.indirectRegister||'hl').toUpperCase()})`;
  if (t === 'neg') return 'NEG';
  if (t === 'reti') return 'RETI';
  if (t === 'retn') return 'RETN';
  if (t === 'sbc-pair') return `SBC HL, ${inst.src.toUpperCase()}`;
  if (t === 'adc-pair') return `ADC HL, ${inst.src.toUpperCase()}`;
  if (t === 'rrd') return 'RRD';
  if (t === 'rld') return 'RLD';
  if (t === 'tst-imm') return `TST ${hex2(inst.value)}`;
  if (t === 'tstio') return `TSTIO ${hex2(inst.value)}`;
  if (t === 'mlt') return `MLT ${inst.pair.toUpperCase()}`;
  if (t === 'slp') return 'SLP';
  if (t === 'stmix') return 'STMIX';
  if (t === 'rsmix') return 'RSMIX';
  if (t === 'lea') return `LEA ${inst.dest.toUpperCase()}, ${(inst.register||'ix').toUpperCase()}+${inst.offset}`;
  if (t === 'pea') return `PEA ${(inst.register||'ix').toUpperCase()}+${inst.offset}`;
  return `[${t}] ${JSON.stringify(inst)}`;
}

// Disassemble a range, returning array of { pc, text, inst, len, raw }
function disasm(startAddr, maxInstrs) {
  let pc = startAddr;
  const results = [];
  for (let i = 0; i < maxInstrs; i++) {
    if (pc >= rom.length) break;
    let inst;
    try { inst = decodeInstruction(rom, pc, 'adl'); } catch(e) { inst = null; }
    if (!inst) {
      results.push({ pc, text: `DB ${hex2(rom[pc])}`, inst: null, len: 1 });
      pc++;
      continue;
    }
    const rawBytes = [];
    for (let b = 0; b < inst.length; b++) rawBytes.push(hex2(rom[pc + b]));
    const text = fmtInst(inst);
    results.push({ pc, text, inst, len: inst.length, raw: rawBytes.join(' ') });
    pc = inst.nextPc || (pc + inst.length);
  }
  return results;
}

// Disassemble until RET/JP or maxInstrs
function disasmFunc(startAddr, maxInstrs = 200) {
  let pc = startAddr;
  const results = [];
  for (let i = 0; i < maxInstrs; i++) {
    if (pc >= rom.length) break;
    let inst;
    try { inst = decodeInstruction(rom, pc, 'adl'); } catch(e) { inst = null; }
    if (!inst) {
      results.push({ pc, text: `DB ${hex2(rom[pc])}`, inst: null, len: 1 });
      pc++;
      continue;
    }
    const rawBytes = [];
    for (let b = 0; b < inst.length; b++) rawBytes.push(hex2(rom[pc + b]));
    const text = fmtInst(inst);
    results.push({ pc, text, inst, len: inst.length, raw: rawBytes.join(' ') });
    pc = inst.nextPc || (pc + inst.length);
  }
  return results;
}

function printDisasm(lines, annotations = {}) {
  for (const l of lines) {
    const rawStr = (l.raw || '').padEnd(22);
    const ann = annotations[l.pc] || '';
    console.log(`  ${hex(l.pc)}: ${rawStr} ${l.text}${ann}`);
  }
}

// ============================================================
// Section 1: Find function boundary by scanning backwards
// ============================================================
console.log('='.repeat(70));
console.log('SECTION 1: Scanning for function boundary before 0x028C2D');
console.log('='.repeat(70));

// Disassemble from several candidate starts, look for RET/JP boundary
const candidates = [0x028B50, 0x028B60, 0x028B7B, 0x028B9E];
let bestFuncStart = 0x028B9E;

for (const start of candidates) {
  const lines = disasm(start, 100);
  let lastBound = null;
  for (const l of lines) {
    if (l.pc >= 0x028C2D) break;
    if (!l.inst) continue;
    const isEnd = l.inst.tag === 'ret' ||
      (l.inst.tag === 'jp' && !l.inst.condition) ||
      l.inst.tag === 'reti' || l.inst.tag === 'retn';
    if (isEnd) {
      lastBound = l.pc + l.len;
    }
  }
  if (lastBound && lastBound <= 0x028C2D) {
    console.log(`  From ${hex(start)}: last boundary before 0x028C2D at ${hex(lastBound - 1)} => func starts ${hex(lastBound)}`);
    if (lastBound > bestFuncStart || bestFuncStart === 0x028B9E) {
      bestFuncStart = lastBound;
    }
  }
}

// Also show the context around the boundary
console.log(`\n  Context around detected boundary:`);
const ctxLines = disasm(bestFuncStart - 10, 20);
printDisasm(ctxLines);
console.log(`\n  => Function start: ${hex(bestFuncStart)}`);

// ============================================================
// Section 2: Full disassembly of the containing function
// ============================================================
console.log('\n' + '='.repeat(70));
console.log(`SECTION 2: Disassembly from ${hex(bestFuncStart)} through ~0x028CC0`);
console.log('='.repeat(70));

const funcLines = disasmFunc(bestFuncStart, 250);
// Stop at a reasonable end (after 0x028C80 and after encountering RET/JP)
let funcEnd = funcLines[funcLines.length - 1]?.pc || 0;
let foundEndAfterTarget = false;

// Build annotations for interesting addresses
const annotations = {};
const interestingAddrs = [0xD00587, 0xD0058E, 0xD007E0, 0xD00826];
const callTargets = [];

for (const l of funcLines) {
  if (l.pc === 0x028C2D) {
    annotations[l.pc] = (annotations[l.pc] || '') + '  <<<< TARGET';
  }
  if (!l.inst) continue;

  // Check for writes to interesting addresses
  const i = l.inst;
  if (i.addr !== undefined) {
    for (const a of interestingAddrs) {
      if (i.addr === a) {
        annotations[l.pc] = (annotations[l.pc] || '') + `  <<<< REF ${hex(a)}`;
      }
    }
  }

  // Check for IY+offset (flag bits)
  if (i.tag && i.tag.includes('indexed') && (i.register === 'iy' || i.indexRegister === 'iy')) {
    const off = i.offset || i.displacement || 0;
    annotations[l.pc] = (annotations[l.pc] || '') + `  <<<< IY+${off}`;
  }
  if (i.tag && (i.tag.startsWith('bit-') || i.tag.startsWith('rotate-')) && i.tag.includes('indexed')) {
    annotations[l.pc] = (annotations[l.pc] || '') + `  <<<< BIT-OP INDEXED`;
  }
  // FD CB xx xx patterns (IY bit ops)
  if (l.raw && l.raw.startsWith('0xFD 0xCB')) {
    const off = rom[l.pc + 2];
    const opByte = rom[l.pc + 3];
    const bit = (opByte >> 3) & 7;
    const group = (opByte >> 6) & 3;
    const opName = group === 1 ? 'BIT' : group === 2 ? 'RES' : group === 3 ? 'SET' : '?';
    annotations[l.pc] = (annotations[l.pc] || '') + `  <<<< ${opName} ${bit}, (IY+${off})`;
  }

  // Collect CALL/JP targets
  if (i.tag === 'call' || i.tag === 'call-conditional' || i.tag === 'jp' || i.tag === 'jp-conditional') {
    if (i.target !== undefined && i.target < 0x400000) {
      callTargets.push({
        from: l.pc,
        target: i.target,
        type: i.tag,
        condition: i.condition || null
      });
    }
  }
}

// Print up to ~0x028CC0
const trimmed = funcLines.filter(l => l.pc < 0x028CC0);
printDisasm(trimmed, annotations);
console.log(`\n  (${trimmed.length} instructions shown)`);

// ============================================================
// Section 3: Cross-references to function start and 0x028C2D
// ============================================================
console.log('\n' + '='.repeat(70));
console.log('SECTION 3: Cross-references (callers) to key addresses');
console.log('='.repeat(70));

const searchTargets = [...new Set([bestFuncStart, 0x028C2D])];

for (const target of searchTargets) {
  console.log(`\n--- References to ${hex(target)} ---`);
  const lo = target & 0xFF;
  const mid = (target >> 8) & 0xFF;
  const hi = (target >> 16) & 0xFF;
  let found = 0;

  for (let i = 0; i < rom.length - 4; i++) {
    if (rom[i + 1] === lo && rom[i + 2] === mid && rom[i + 3] === hi) {
      const opcode = rom[i];
      const isCall = opcode === 0xCD || (opcode & 0xC7) === 0xC4;
      const isJp = opcode === 0xC3 || (opcode & 0xC7) === 0xC2;
      if (isCall || isJp) {
        const type = isCall ? 'CALL' : 'JP';
        let cond = '';
        if (opcode !== 0xCD && opcode !== 0xC3) {
          const condIdx = (opcode >> 3) & 7;
          cond = ' ' + ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'][condIdx] + ',';
        }
        console.log(`  ${hex(i)}: ${type}${cond} ${hex(target)}`);
        found++;
      }
    }
  }
  if (found === 0) console.log('  (none found)');
  console.log(`  Total: ${found} references`);
}

// ============================================================
// Section 4: State cleared/modified in this function
// ============================================================
console.log('\n' + '='.repeat(70));
console.log('SECTION 4: Memory writes / state modifications in function');
console.log('='.repeat(70));

for (const l of trimmed) {
  if (!l.inst) continue;
  const i = l.inst;
  const t = i.tag;

  // Direct memory writes
  if (t === 'ld-mem-reg' || t === 'ld-mem-pair') {
    console.log(`  STORE     ${hex(l.pc)}: ${l.text}  (writes to ${hex(i.addr)})`);
  }
  // Indirect writes
  if (t === 'ld-ind-reg' || t === 'ld-ind-imm' || t === 'ld-ind-pair') {
    console.log(`  IND-STORE ${hex(l.pc)}: ${l.text}`);
  }
  // Indexed writes
  if (t === 'ld-to-indexed' || t === 'ld-indexed-imm') {
    console.log(`  IDX-STORE ${hex(l.pc)}: ${l.text}`);
  }
  // Bit operations on indexed (IY flags)
  if (t && t.startsWith('bit-') && t.includes('indexed')) {
    console.log(`  BIT-OP    ${hex(l.pc)}: ${l.text}`);
  }
  // FD CB patterns
  if (l.raw && l.raw.startsWith('0xFD 0xCB')) {
    const off = rom[l.pc + 2];
    const opByte = rom[l.pc + 3];
    const bit = (opByte >> 3) & 7;
    const group = (opByte >> 6) & 3;
    const opName = group === 1 ? 'BIT' : group === 2 ? 'RES' : group === 3 ? 'SET' : '?';
    console.log(`  IY-BIT    ${hex(l.pc)}: ${opName} ${bit}, (IY+${off})`);
  }
  // XOR A pattern (clearing A before store)
  if (t === 'alu-reg' && i.op === 'xor' && (i.reg === 'a' || i.src === 'a')) {
    console.log(`  CLEAR-A   ${hex(l.pc)}: ${l.text}  (A = 0)`);
  }
}

// ============================================================
// Section 5: Trace CALL/JP targets (first ~10 instructions of each)
// ============================================================
console.log('\n' + '='.repeat(70));
console.log('SECTION 5: Subroutine previews (CALL/JP targets from function)');
console.log('='.repeat(70));

const uniqueTargets = [...new Set(callTargets.map(c => c.target))].sort((a, b) => a - b);
for (const target of uniqueTargets) {
  const callers = callTargets.filter(c => c.target === target);
  const callerStr = callers.map(c => `${c.type}${c.condition ? ' ' + c.condition + ',' : ''} from ${hex(c.from)}`).join('; ');
  console.log(`\n  --- ${hex(target)} (called by: ${callerStr}) ---`);

  const preview = disasm(target, 10);
  for (const l of preview) {
    const rawStr = (l.raw || '').padEnd(22);
    console.log(`    ${hex(l.pc)}: ${rawStr} ${l.text}`);
  }
}

// ============================================================
// Section 6: Summary
// ============================================================
console.log('\n' + '='.repeat(70));
console.log('SECTION 6: Summary');
console.log('='.repeat(70));
console.log(`  Function start:       ${hex(bestFuncStart)}`);
console.log(`  Target address:       ${hex(0x028C2D)}`);
console.log(`  Function extent:      ${hex(bestFuncStart)} to ~${hex(trimmed[trimmed.length-1]?.pc || 0)}`);
console.log(`  Total instructions:   ${trimmed.length}`);
console.log(`  CALL/JP targets:      ${uniqueTargets.map(t => hex(t)).join(', ')}`);
console.log(`  Cross-ref count:      see Section 3`);
console.log(`  Known state addresses: 0xD00587 (scan code buf), 0xD0058E, 0xD007E0, 0xD00826`);
console.log(`\n  Key questions answered:`);
console.log(`  - What triggers this function?  -> See Section 3 (callers)`);
console.log(`  - What state does it clear/reset? -> See Section 4 (stores/bit-ops)`);
console.log(`  - What subroutines does it invoke? -> See Section 5 (previews)`);
