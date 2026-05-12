#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rom = readFileSync(path.join(__dirname, 'ROM.rom'));

function hex(v, w = 6) { return '0x' + (v >>> 0).toString(16).toUpperCase().padStart(w, '0'); }
function hex2(v) { return '0x' + (v >>> 0).toString(16).toUpperCase().padStart(2, '0'); }

function fmtInst(inst) {
  const t = inst.tag;
  if (t === 'nop') return 'NOP';
  if (t === 'ret') return 'RET';
  if (t === 'ret-conditional') return `RET ${inst.condition.toUpperCase()}`;
  if (t === 'call') return `CALL ${hex(inst.target)}`;
  if (t === 'call-conditional') return `CALL ${inst.condition.toUpperCase()}, ${hex(inst.target)}`;
  if (t === 'jp') return `JP ${hex(inst.target)}`;
  if (t === 'jp-conditional') return `JP ${inst.condition.toUpperCase()}, ${hex(inst.target)}`;
  if (t === 'jp-indirect') return `JP (${(inst.register || 'hl').toUpperCase()})`;
  if (t === 'jr') return `JR ${hex(inst.target)}`;
  if (t === 'jr-conditional') return `JR ${inst.condition.toUpperCase()}, ${hex(inst.target)}`;
  if (t === 'djnz') return `DJNZ ${hex(inst.target)}`;
  if (t === 'ld-reg-imm') return `LD ${inst.dest.toUpperCase()}, ${hex2(inst.value)}`;
  if (t === 'ld-pair-imm') return `LD ${inst.pair.toUpperCase()}, ${hex(inst.value)}`;
  if (t === 'ld-reg-reg') return `LD ${inst.dest.toUpperCase()}, ${inst.src.toUpperCase()}`;
  if (t === 'ld-reg-ind') return `LD ${inst.dest.toUpperCase()}, (${inst.src.toUpperCase()})`;
  if (t === 'ld-ind-reg') return `LD (${inst.dest.toUpperCase()}), ${inst.src.toUpperCase()}`;
  if (t === 'ld-ind-imm') return `LD (HL), ${hex2(inst.value)}`;
  if (t === 'ld-mem-reg') return `LD (${hex(inst.addr)}), ${inst.src.toUpperCase()}`;
  if (t === 'ld-reg-mem') return `LD ${inst.dest ? inst.dest.toUpperCase() : 'A'}, (${hex(inst.addr)})`;
  if (t === 'ld-pair-mem') {
    const dir = inst.direction === 'to-mem' ? 'store' : 'load';
    return `LD ${dir === 'store' ? `(${hex(inst.addr)}), ${inst.pair.toUpperCase()}` : `${inst.pair.toUpperCase()}, (${hex(inst.addr)})`}`;
  }
  if (t === 'ld-reg-ixd') return `LD ${inst.dest.toUpperCase()}, (${(inst.indexRegister||'ix').toUpperCase()}+${inst.displacement})`;
  if (t === 'ld-ixd-reg') return `LD (${(inst.indexRegister||'ix').toUpperCase()}+${inst.displacement}), ${inst.src.toUpperCase()}`;
  if (t === 'ld-ixd-imm') return `LD (${(inst.indexRegister||'ix').toUpperCase()}+${inst.displacement}), ${hex2(inst.value)}`;
  if (t === 'ld-pair-indexed') return `LD ${inst.pair.toUpperCase()}, (${(inst.indexRegister||'iy').toUpperCase()}+${inst.displacement})`;
  if (t === 'ld-indexed-pair') return `LD (${(inst.indexRegister||'iy').toUpperCase()}+${inst.displacement}), ${inst.pair.toUpperCase()}`;
  if (t === 'push') return `PUSH ${inst.pair.toUpperCase()}`;
  if (t === 'pop') return `POP ${inst.pair.toUpperCase()}`;
  if (t === 'inc-reg') return `INC ${inst.reg.toUpperCase()}`;
  if (t === 'dec-reg') return `DEC ${inst.reg.toUpperCase()}`;
  if (t === 'inc-pair') return `INC ${inst.pair.toUpperCase()}`;
  if (t === 'dec-pair') return `DEC ${inst.pair.toUpperCase()}`;
  if (t === 'add-pair') return `ADD ${inst.dest.toUpperCase()}, ${inst.src.toUpperCase()}`;
  if (t === 'alu-reg') return `${inst.op.toUpperCase()} A, ${inst.reg ? inst.reg.toUpperCase() : '?'}`;
  if (t === 'alu-imm') return `${inst.op.toUpperCase()} ${hex2(inst.value)}`;
  if (t === 'alu-ind') return `${inst.op.toUpperCase()} (HL)`;
  if (t === 'alu-indexed') return `${inst.op.toUpperCase()} (${(inst.register||'ix').toUpperCase()}+${inst.offset})`;
  if (t === 'rst') return `RST ${hex2(inst.vector)}`;
  if (t === 'ex-af') return "EX AF, AF'";
  if (t === 'exx') return 'EXX';
  if (t === 'ex-de-hl') return 'EX DE, HL';
  if (t === 'ex-sp-hl') return 'EX (SP), HL';
  if (t === 'di') return 'DI'; if (t === 'ei') return 'EI';
  if (t === 'halt') return 'HALT'; if (t === 'scf') return 'SCF';
  if (t === 'ccf') return 'CCF'; if (t === 'cpl') return 'CPL';
  if (t === 'daa') return 'DAA'; if (t === 'rla') return 'RLA';
  if (t === 'rra') return 'RRA'; if (t === 'rlca') return 'RLCA';
  if (t === 'rrca') return 'RRCA'; if (t === 'ldir') return 'LDIR';
  if (t === 'lddr') return 'LDDR'; if (t === 'ldi') return 'LDI';
  if (t === 'ldd') return 'LDD'; if (t === 'cpir') return 'CPIR';
  if (t === 'cpdr') return 'CPDR';
  if (t === 'in-reg') return `IN ${(inst.reg||'a').toUpperCase()}, (C)`;
  if (t === 'out-reg') return `OUT (C), ${(inst.reg||'a').toUpperCase()}`;
  if (t === 'in-imm') return `IN A, (${hex2(inst.port)})`;
  if (t === 'out-imm') return `OUT (${hex2(inst.port)}), A`;
  if (t === 'im') return `IM ${inst.mode}`;
  if (t === 'bit-test') return `BIT ${inst.bit}, ${inst.reg.toUpperCase()}`;
  if (t === 'bit-test-ind') return `BIT ${inst.bit}, (HL)`;
  if (t === 'bit-set') return `SET ${inst.bit}, ${inst.reg.toUpperCase()}`;
  if (t === 'bit-set-ind') return `SET ${inst.bit}, (HL)`;
  if (t === 'bit-reset') return `RES ${inst.bit}, ${inst.reg.toUpperCase()}`;
  if (t === 'bit-reset-ind') return `RES ${inst.bit}, (HL)`;
  if (t === 'rotate-reg') return `${inst.op.toUpperCase()} ${inst.reg.toUpperCase()}`;
  if (t === 'rotate-ind') return `${inst.op.toUpperCase()} (HL)`;
  if (t === 'neg') return 'NEG';
  if (t === 'reti') return 'RETI'; if (t === 'retn') return 'RETN';
  if (t === 'sbc-pair') return `SBC HL, ${inst.src.toUpperCase()}`;
  if (t === 'adc-pair') return `ADC HL, ${inst.src.toUpperCase()}`;
  if (t === 'rrd') return 'RRD'; if (t === 'rld') return 'RLD';
  if (t === 'ld-sp-hl') return 'LD SP, HL';
  if (t === 'mlt') return `MLT ${inst.pair.toUpperCase()}`;
  if (t === 'lea') return `LEA ${inst.dest.toUpperCase()}, ${(inst.register||'ix').toUpperCase()}+${inst.offset}`;
  if (t === 'pea') return `PEA ${(inst.register||'ix').toUpperCase()}+${inst.offset}`;
  if (t === 'indexed-cb-bit') return `BIT ${inst.bit}, (${(inst.indexRegister||'iy').toUpperCase()}+${inst.displacement})`;
  if (t === 'indexed-cb-set') return `SET ${inst.bit}, (${(inst.indexRegister||'iy').toUpperCase()}+${inst.displacement})`;
  if (t === 'indexed-cb-res') return `RES ${inst.bit}, (${(inst.indexRegister||'iy').toUpperCase()}+${inst.displacement})`;
  if (t === 'indexed-cb-rotate') return `${(inst.op||'?').toUpperCase()} (${(inst.indexRegister||'iy').toUpperCase()}+${inst.displacement})`;
  if (t === 'ld-pair-ind') return `LD ${inst.pair.toUpperCase()}, (${inst.src.toUpperCase()})`;
  if (t === 'ld-ind-pair') return `LD (${inst.dest.toUpperCase()}), ${inst.pair.toUpperCase()}`;
  return `[${t}] ${JSON.stringify(Object.fromEntries(Object.entries(inst).filter(([k]) => !['pc','length','nextPc','mode','modePrefix'].includes(k))))}`;
}

function disasm(startAddr, count, stopOnRet = true) {
  let pc = startAddr;
  const results = [];
  for (let i = 0; i < count; i++) {
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
    if (inst.tag === 'ret' && stopOnRet) break;
  }
  return results;
}

function printDisasm(lines) {
  for (const l of lines) {
    const rawStr = (l.raw || '??').padEnd(26);
    console.log(`  ${hex(l.pc)}: ${rawStr} ${l.text}`);
  }
}

// ============================================================
// Section 1: 0x058D54 — key class lookup (ADL mode)
// ============================================================
console.log('='.repeat(72));
console.log('SECTION 1: 0x058D54 key class lookup — ADL mode');
console.log('='.repeat(72));
console.log();
const sec1 = disasm(0x058D54, 50);
printDisasm(sec1);

// ============================================================
// Section 2: 0x0800A8 — the REAL call target (confirmed in ADL mode)
// ============================================================
console.log('\n' + '='.repeat(72));
console.log('SECTION 2: 0x0800A8 — scan code filter/gate');
console.log('='.repeat(72));
console.log();
const sec2 = disasm(0x0800A8, 20);
printDisasm(sec2);

console.log('\n  ANALYSIS:');
console.log('  0x0800A8 is a GATE/FILTER, not a converter:');
console.log('  1. BIT 7,(IY+9) — if set, return with Z (no key, "on-key" lockout?)');
console.log('  2. CALL 0x080259 — THIS is the actual scan code retrieval');
console.log('  3. RET Z if 0x080259 returned 0');
console.log('  4. BIT 5,(IY+69) — additional filter (edit mode?)');
console.log('  5. BIT 5,(IY+68) — additional filter');

// ============================================================
// Section 3: 0x080259 — the ACTUAL GetCSC implementation
// ============================================================
console.log('\n' + '='.repeat(72));
console.log('SECTION 3: 0x080259 — actual scan code retrieval');
console.log('='.repeat(72));
console.log();
const sec3 = disasm(0x080259, 80);
printDisasm(sec3);

// Look for sub-calls
console.log('\n  Sub-calls from 0x080259:');
for (const l of sec3) {
  if (l.inst && (l.inst.tag === 'call' || l.inst.tag === 'call-conditional')) {
    console.log(`    ${hex(l.pc)}: ${l.text}`);
  }
}

// ============================================================
// Section 4: SDK _GetCSC -> 0x03FA09
// ============================================================
console.log('\n' + '='.repeat(72));
console.log('SECTION 4: SDK _GetCSC (0x02014C -> 0x03FA09)');
console.log('='.repeat(72));
console.log();
const sec4 = disasm(0x03FA09, 60);
printDisasm(sec4);

console.log('\n  Sub-calls from 0x03FA09:');
for (const l of sec4) {
  if (l.inst && (l.inst.tag === 'call' || l.inst.tag === 'call-conditional')) {
    console.log(`    ${hex(l.pc)}: ${l.text}`);
  }
}

// ============================================================
// Section 5: Search for callers of 0x0800A8
//   CALL 0x0800A8 in ADL = CD A8 00 08
// ============================================================
console.log('\n' + '='.repeat(72));
console.log('SECTION 5: All callers of 0x0800A8 (CD A8 00 08)');
console.log('='.repeat(72));
console.log();

const callers = [];
for (let i = 0; i < rom.length - 3; i++) {
  if (rom[i] === 0xCD && rom[i+1] === 0xA8 && rom[i+2] === 0x00 && rom[i+3] === 0x08) {
    callers.push(i);
  }
}
console.log(`  Found ${callers.length} callers:`);
for (const addr of callers) {
  const ctx = disasm(addr - 8, 6, false);
  const callLine = ctx.find(l => l.pc === addr);
  // Show 2 before + call + 2 after
  const before = ctx.filter(l => l.pc < addr).slice(-2);
  const after = disasm(addr, 4, false).slice(1, 3);
  for (const l of before) {
    console.log(`    ${hex(l.pc)}: ${l.text}`);
  }
  console.log(`  > ${hex(addr)}: ${callLine ? callLine.text : '???'}`);
  for (const l of after) {
    console.log(`    ${hex(l.pc)}: ${l.text}`);
  }
  console.log();
}

// ============================================================
// Section 6: Search for callers of 0x080259
//   CALL 0x080259 in ADL = CD 59 02 08
// ============================================================
console.log('='.repeat(72));
console.log('SECTION 6: All callers of 0x080259 (CD 59 02 08)');
console.log('='.repeat(72));
console.log();

const callers2 = [];
for (let i = 0; i < rom.length - 3; i++) {
  if (rom[i] === 0xCD && rom[i+1] === 0x59 && rom[i+2] === 0x02 && rom[i+3] === 0x08) {
    callers2.push(i);
  }
}
console.log(`  Found ${callers2.length} callers:`);
for (const addr of callers2) {
  const ctx = disasm(addr, 3, false);
  console.log(`    ${hex(addr)}: ${ctx[0]?.text || '???'}`);
}

// ============================================================
// Section 7: Trace deeper into 0x080259's sub-calls
// ============================================================
console.log('\n' + '='.repeat(72));
console.log('SECTION 7: Sub-calls from 0x080259 — deeper trace');
console.log('='.repeat(72));

const subCalls3 = [];
for (const l of sec3) {
  if (l.inst && (l.inst.tag === 'call' || l.inst.tag === 'call-conditional')) {
    subCalls3.push(l.inst.target);
  }
}

const traced = new Set([0x080259]);
for (const target of subCalls3) {
  if (traced.has(target)) continue;
  traced.add(target);
  console.log(`\n  --- ${hex(target)} ---`);
  const sub = disasm(target, 50);
  printDisasm(sub);
}

// ============================================================
// Section 8: 0x058C65 — the last call from 0x058D54
// ============================================================
console.log('\n' + '='.repeat(72));
console.log('SECTION 8: 0x058C65 — called after key processing');
console.log('='.repeat(72));
console.log();
const sec8 = disasm(0x058C65, 30);
printDisasm(sec8);

// ============================================================
// Section 9: Summary
// ============================================================
console.log('\n' + '='.repeat(72));
console.log('SECTION 9: FULL SUMMARY');
console.log('='.repeat(72));
console.log();
console.log('  CALL CHAIN for key class lookup (0x058D54):');
console.log('  1. CALL 0x058EC6 — clear flags (IY+83 bits 5,7), optionally call 0x0997ED');
console.log('  2. RES 7,(IY+69) — clear another flag');
console.log('  3. CALL 0x0800A8 — SCAN CODE GATE:');
console.log('     a. BIT 7,(IY+9) — if set, return Z (suppress key)');
console.log('     b. CALL 0x080259 — GET SCAN CODE from key buffer');
console.log('     c. RET Z if no key');
console.log('     d. BIT 5,(IY+69) — filter check');
console.log('     e. BIT 5,(IY+68) — filter check');
console.log('  4. JR Z, skip — if no key, jump to cleanup');
console.log('  5. PUSH AF — save scan code');
console.log('  6. LD A,0x0A; LD (0xD02505),A — reset APD counter');
console.log('  7. LD DE,(0x001153); LD D,0x00 — load key processing params');
console.log('  8. CALL 0x0BD341 — cursor/edit position update?');
console.log('  9. LD A,(0xD02685); LD (0xD02687),A — copy state');
console.log('  10. CALL 0x069A8D — key class handler dispatch');
console.log('  11. RES 4,(IY+12) — clear flag');
console.log('  12. CALL 0x058C65 — calls 0x0800A8 AGAIN + post-processing');
console.log('  13. POP AF — restore scan code');
console.log('  14. RES 3,(IY+1) — clear pending-key flag');
console.log();
console.log('  KEY FINDING: 0x0800A8 is NOT a scan-code-to-class CONVERTER.');
console.log('  It is a SCAN CODE GATE — it retrieves the raw scan code via 0x080259');
console.log('  and filters it through flag checks. The class DISPATCH happens at');
console.log('  0x069A8D (called at 0x058D7C), not at 0x0800A8.');
console.log();
console.log('  The actual scan-code-to-class conversion likely lives inside 0x069A8D');
console.log('  or its sub-calls (0x08CA64, 0x0562DE, 0x09747C).');
console.log();
console.log('  0x080259 is the core _GetCSC equivalent — retrieves scan code from');
console.log('  the keyboard buffer. 0x0800A8 wraps it with flag-based gating.');

console.log('\n' + '='.repeat(72));
console.log('DONE');
console.log('='.repeat(72));
