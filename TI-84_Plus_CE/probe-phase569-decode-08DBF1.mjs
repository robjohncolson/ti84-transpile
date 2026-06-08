/**
 * probe-phase569-decode-08DBF1.mjs
 * Decode 0x08DBF1 - Token Forward Scanner with Loop
 * Also decode 0x08DC1A - called by the forward scanner
 *
 * Uses decodeInstruction(rom, pc, 'adl') which returns {tag, ...fields, length, pc}
 * We format using a comprehensive tag-to-mnemonic mapper.
 */

import { readFileSync } from 'fs';
import { decodeInstruction } from './ez80-decoder.js';

var rom = readFileSync(new URL('./ROM.rom', import.meta.url));

function hex(v, w) { return '0x' + v.toString(16).toUpperCase().padStart(w || 6, '0'); }
function byteHex(v) { return v.toString(16).toUpperCase().padStart(2, '0'); }
function bytesAt(addr, len) {
  var out = [];
  for (var i = 0; i < len; i++) out.push(byteHex(rom[addr + i]));
  return out.join(' ');
}
function signed8(v) { return v < 0x80 ? v : v - 0x100; }
function rom24(addr) { return rom[addr] | (rom[addr+1] << 8) | (rom[addr+2] << 16); }

// Format a decoded instruction into a human-readable string
function fmt(inst) {
  var t = inst.tag || '???';
  // Build a mnemonic string from tag + fields
  switch (t) {
    // Basic loads
    case 'ld-reg-reg': return 'LD ' + inst.dest + ', ' + inst.src;
    case 'ld-reg-imm': return 'LD ' + inst.dest + ', ' + hex(inst.value, 2);
    case 'ld-reg-ind': return 'LD ' + inst.dest + ', (' + inst.src + ')';
    case 'ld-ind-reg': return 'LD (' + inst.dest + '), ' + inst.src;
    case 'ld-pair-imm': return 'LD ' + inst.pair + ', ' + hex(inst.value);
    case 'ld-pair-mem': return 'LD ' + inst.pair + ', (' + hex(inst.addr) + ')';
    case 'ld-mem-pair': return 'LD (' + hex(inst.addr) + '), ' + inst.pair;
    case 'ld-mem-a': return 'LD (' + hex(inst.addr) + '), A';
    case 'ld-a-mem': return 'LD A, (' + hex(inst.addr) + ')';
    case 'ld-ind-imm': return 'LD (' + inst.dest + '), ' + hex(inst.value, 2);
    case 'ld-sp-hl': return 'LD SP, HL';
    case 'ld-sp-index': return 'LD SP, ' + inst.indexRegister;
    // Indexed loads
    case 'ld-indexed-reg': return 'LD (' + inst.indexRegister + '+' + hex(inst.displacement, 2) + '), ' + inst.src;
    case 'ld-reg-indexed': return 'LD ' + inst.dest + ', (' + inst.indexRegister + '+' + hex(inst.displacement, 2) + ')';
    case 'ld-indexed-imm': return 'LD (' + inst.indexRegister + '+' + hex(inst.displacement, 2) + '), ' + hex(inst.value, 2);
    // Arithmetic
    case 'alu-reg': return inst.op.toUpperCase() + ' A, ' + inst.src;
    case 'alu-imm': return inst.op.toUpperCase() + ' A, ' + hex(inst.value, 2);
    case 'alu-ind': return inst.op.toUpperCase() + ' A, (HL)';
    case 'alu-indexed': return inst.op.toUpperCase() + ' A, (' + inst.indexRegister + '+' + hex(inst.displacement, 2) + ')';
    case 'inc-reg': return 'INC ' + inst.reg;
    case 'dec-reg': return 'DEC ' + inst.reg;
    case 'inc-pair': return 'INC ' + inst.pair;
    case 'dec-pair': return 'DEC ' + inst.pair;
    case 'inc-ind': return 'INC (HL)';
    case 'dec-ind': return 'DEC (HL)';
    case 'inc-indexed': return 'INC (' + inst.indexRegister + '+' + hex(inst.displacement, 2) + ')';
    case 'dec-indexed': return 'DEC (' + inst.indexRegister + '+' + hex(inst.displacement, 2) + ')';
    case 'add-hl-pair': return 'ADD HL, ' + inst.pair;
    case 'adc-hl-pair': return 'ADC HL, ' + inst.pair;
    case 'sbc-hl-pair': return 'SBC HL, ' + inst.pair;
    case 'add-index-pair': return 'ADD ' + inst.indexRegister + ', ' + inst.pair;
    // Jumps
    case 'jp': return 'JP ' + hex(inst.target);
    case 'jp-conditional': return 'JP ' + inst.condition + ', ' + hex(inst.target);
    case 'jp-hl': return 'JP (HL)';
    case 'jp-index': return 'JP (' + inst.indexRegister + ')';
    case 'jr': return 'JR ' + hex(inst.target);
    case 'jr-conditional': return 'JR ' + inst.condition + ', ' + hex(inst.target);
    case 'djnz': return 'DJNZ ' + hex(inst.target);
    // Calls/returns
    case 'call': return 'CALL ' + hex(inst.target);
    case 'call-conditional': return 'CALL ' + inst.condition + ', ' + hex(inst.target);
    case 'ret': return 'RET';
    case 'ret-conditional': return 'RET ' + inst.condition;
    case 'reti': return 'RETI';
    case 'retn': return 'RETN';
    case 'rst': return 'RST ' + hex(inst.vector, 2);
    // Stack
    case 'push': return 'PUSH ' + inst.pair;
    case 'pop': return 'POP ' + inst.pair;
    // Exchange
    case 'ex-de-hl': return 'EX DE, HL';
    case 'ex-af': return "EX AF, AF'";
    case 'exx': return 'EXX';
    case 'ex-sp-hl': return 'EX (SP), HL';
    case 'ex-sp-index': return 'EX (SP), ' + inst.indexRegister;
    // Bit operations
    case 'bit-reg': return 'BIT ' + inst.bit + ', ' + inst.reg;
    case 'bit-ind': return 'BIT ' + inst.bit + ', (HL)';
    case 'set-reg': return 'SET ' + inst.bit + ', ' + inst.reg;
    case 'set-ind': return 'SET ' + inst.bit + ', (HL)';
    case 'res-reg': return 'RES ' + inst.bit + ', ' + inst.reg;
    case 'res-ind': return 'RES ' + inst.bit + ', (HL)';
    case 'indexed-cb-bit': return 'BIT ' + inst.bit + ', (' + inst.indexRegister + '+' + hex(inst.displacement, 2) + ')';
    case 'indexed-cb-set': return 'SET ' + inst.bit + ', (' + inst.indexRegister + '+' + hex(inst.displacement, 2) + ')';
    case 'indexed-cb-res': return 'RES ' + inst.bit + ', (' + inst.indexRegister + '+' + hex(inst.displacement, 2) + ')';
    case 'indexed-cb-rotate': return inst.op.toUpperCase() + ' (' + inst.indexRegister + '+' + hex(inst.displacement, 2) + ')';
    // Rotate/shift
    case 'rotate-reg': return inst.op.toUpperCase() + ' ' + inst.reg;
    case 'rotate-ind': return inst.op.toUpperCase() + ' (' + (inst.indirectRegister || 'HL') + ')';
    case 'rlca': return 'RLCA';
    case 'rrca': return 'RRCA';
    case 'rla': return 'RLA';
    case 'rra': return 'RRA';
    case 'rld': return 'RLD';
    case 'rrd': return 'RRD';
    // Block operations
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
    // IO
    case 'in-reg': return 'IN ' + inst.reg + ', (C)';
    case 'out-reg': return 'OUT (C), ' + inst.reg;
    case 'in-a-imm': return 'IN A, (' + hex(inst.port, 2) + ')';
    case 'out-imm-a': return 'OUT (' + hex(inst.port, 2) + '), A';
    // Misc
    case 'nop': return 'NOP';
    case 'halt': return 'HALT';
    case 'di': return 'DI';
    case 'ei': return 'EI';
    case 'im': return 'IM ' + inst.mode;
    case 'scf': return 'SCF';
    case 'ccf': return 'CCF';
    case 'cpl': return 'CPL';
    case 'neg': return 'NEG';
    case 'daa': return 'DAA';
    case 'ld-i-a': return 'LD I, A';
    case 'ld-a-i': return 'LD A, I';
    case 'ld-r-a': return 'LD R, A';
    case 'ld-a-r': return 'LD A, R';
    case 'ld-mb-a': return 'LD MB, A';
    case 'ld-a-mb': return 'LD A, MB';
    case 'stmix': return 'STMIX';
    case 'rsmix': return 'RSMIX';
    case 'slp': return 'SLP';
    case 'tst-a-reg': return 'TST A, ' + inst.src;
    case 'tst-a-imm': return 'TST A, ' + hex(inst.value, 2);
    case 'ld-pair-ind-index':
      return 'LD ' + inst.pair + ', (' + inst.indexRegister + '+' + hex(inst.displacement, 2) + ')';
    case 'ld-ind-index-pair':
      return 'LD (' + inst.indexRegister + '+' + hex(inst.displacement, 2) + '), ' + inst.pair;
    case 'inc-index': return 'INC ' + inst.indexRegister;
    case 'dec-index': return 'DEC ' + inst.indexRegister;
    case 'ld-index-imm': return 'LD ' + inst.indexRegister + ', ' + hex(inst.value);
    case 'ld-index-mem': return 'LD ' + inst.indexRegister + ', (' + hex(inst.addr) + ')';
    case 'ld-mem-index': return 'LD (' + hex(inst.addr) + '), ' + inst.indexRegister;
    case 'push-index': return 'PUSH ' + inst.indexRegister;
    case 'pop-index': return 'POP ' + inst.indexRegister;
    // Catch-all for known tag patterns
    default:
      // Try to be helpful with unknown tags
      var parts = [t.toUpperCase()];
      if (inst.target !== undefined) parts.push(hex(inst.target));
      if (inst.pair) parts.push(inst.pair);
      if (inst.reg) parts.push(inst.reg);
      if (inst.value !== undefined) parts.push(hex(inst.value, 2));
      return parts.join(' ');
  }
}

// Check if instruction is an unconditional RET
function isRet(inst) {
  return inst.tag === 'ret';
}

// Check if instruction is unconditional JP (not JP (HL))
function isUncondJP(inst) {
  return inst.tag === 'jp';
}

// Disassemble until unconditional RET/JP or maxInstructions
function disasmFunction(startAddr, label, maxInstructions) {
  maxInstructions = maxInstructions || 120;
  console.log('');
  console.log('======================================================================');
  console.log(label + ': ' + hex(startAddr));
  console.log('======================================================================');

  var instructions = [];
  var addr = startAddr;

  for (var i = 0; i < maxInstructions; i++) {
    var inst = decodeInstruction(rom, addr, 'adl');
    var len = inst.length || 1;
    var bytes = bytesAt(addr, len);
    var offset = addr - startAddr;
    var text = fmt(inst);

    // Add branch target annotations for JR/DJNZ
    var extra = '';
    if (inst.tag === 'jr' || inst.tag === 'jr-conditional' || inst.tag === 'djnz') {
      if (inst.target < startAddr) extra = ' (before fn)';
      else if (inst.target < addr) extra = ' (LOOP BACK)';
    }

    console.log('  +' + hex(offset, 3) + '  [' + hex(addr) + ']  ' + bytes.padEnd(20) + text + extra);
    instructions.push({
      addr: addr,
      offset: offset,
      length: len,
      tag: inst.tag,
      text: text,
      bytes: bytes,
      inst: inst
    });
    addr += len;

    // Stop on unconditional RET
    if (isRet(inst)) {
      console.log('  --- unconditional RET at +' + hex(offset, 3) + ' (' + (offset + len) + 'B total) ---');
      break;
    }
    // Stop on unconditional JP to far address (tail call)
    if (isUncondJP(inst)) {
      var jpTarget = inst.target;
      if (jpTarget < startAddr - 0x100 || jpTarget > startAddr + 0x300) {
        console.log('  --- unconditional JP (tail call) at +' + hex(offset, 3) + ' (' + (offset + len) + 'B total) ---');
        break;
      }
    }
  }

  return instructions;
}

// ============================================================
console.log('Phase 569 probe: decode 0x08DBF1 token forward scanner + 0x08DC1A');
console.log('ROM size: ' + rom.length + ' bytes');

var fn1 = disasmFunction(0x08DBF1, 'FUNCTION 1: Token Forward Scanner (0x08DBF1)', 40);
var fn2 = disasmFunction(0x08DC1A, 'FUNCTION 2: Called by Forward Scanner (0x08DC1A)', 20);

// Also disasm subroutines called by fn2: 0x08DC0E and 0x08DC26
var fn3 = disasmFunction(0x08DC0E, 'SUB-FUNCTION: 0x08DC0E (called by 0x08DC1A)', 20);
var fn4 = disasmFunction(0x08DC26, 'SUB-FUNCTION: 0x08DC26 (token classifier called by 0x08DC1A)', 60);
// The JR at 0x08DC2E skips to 0x08DC32 which has OR 0x01; RET — so 0x08DC26 has two exit paths
// Let's also get the continuation at 0x08DC32 and 0x08DD49
var fn5 = disasmFunction(0x08DC32, 'CONTINUATION: 0x08DC32 (jumped to from 0x08DC26)', 10);
var fn6 = disasmFunction(0x08DD49, 'SUB-FUNCTION: 0x08DD49 (called by 0x08DC0E, likely token advance)', 30);

// ============================================================
console.log('');
console.log('======================================================================');
console.log('LOOP & BRANCH ANALYSIS');
console.log('======================================================================');

var allFns = [
  ['0x08DBF1', fn1],
  ['0x08DC1A', fn2],
  ['0x08DC0E', fn3],
  ['0x08DC26', fn4],
  ['0x08DC32', fn5],
  ['0x08DD49', fn6]
];

for (var fi = 0; fi < allFns.length; fi++) {
  var label = allFns[fi][0];
  var instrs = allFns[fi][1];
  console.log('');
  console.log(label + ':');
  for (var ii = 0; ii < instrs.length; ii++) {
    var ins = instrs[ii];
    var tag = ins.tag;
    if (tag === 'jr' || tag === 'jr-conditional' || tag === 'djnz') {
      var tgt = ins.inst.target;
      var dir = tgt <= ins.addr ? 'BACK (loop)' : 'FORWARD (skip)';
      console.log('  +' + hex(ins.offset, 3) + ': ' + ins.text + ' [' + dir + ']');
    }
    if (tag === 'call' || tag === 'call-conditional') {
      console.log('  +' + hex(ins.offset, 3) + ': ' + ins.text);
    }
    if (tag === 'jp' || tag === 'jp-conditional') {
      console.log('  +' + hex(ins.offset, 3) + ': ' + ins.text);
    }
  }
}

// ============================================================
console.log('');
console.log('======================================================================');
console.log('ROM REFERENCE SCAN');
console.log('======================================================================');

function findReferences(targetAddr) {
  var refs = [];
  var t0 = targetAddr & 0xFF;
  var t1 = (targetAddr >> 8) & 0xFF;
  var t2 = (targetAddr >> 16) & 0xFF;

  for (var i = 0; i < 0x400000 - 2; i++) {
    if (rom[i] === t0 && rom[i + 1] === t1 && rom[i + 2] === t2) {
      var prev = i > 0 ? rom[i - 1] : 0;
      var type = 'data/ptr';
      if (prev === 0xCD) type = 'CALL';
      else if (prev === 0xC3) type = 'JP';
      else if (prev === 0xCC) type = 'CALL Z,';
      else if (prev === 0xC4) type = 'CALL NZ,';
      else if (prev === 0xDC) type = 'CALL C,';
      else if (prev === 0xD4) type = 'CALL NC,';
      else if (prev === 0xCA) type = 'JP Z,';
      else if (prev === 0xC2) type = 'JP NZ,';
      else if (prev === 0xDA) type = 'JP C,';
      else if (prev === 0xD2) type = 'JP NC,';
      refs.push({ addr: i - (type !== 'data/ptr' ? 1 : 0), type: type });
    }
  }
  return refs;
}

var scanTargets = [0x08DBF1, 0x08DC1A, 0x08DC0E, 0x08DC26, 0x08DD49];
for (var si = 0; si < scanTargets.length; si++) {
  var t = scanTargets[si];
  var refs = findReferences(t);
  console.log('');
  console.log('References to ' + hex(t) + ': ' + refs.length + ' found');
  for (var rr = 0; rr < refs.length; rr++) {
    console.log('  ' + hex(refs[rr].addr) + ': ' + refs[rr].type);
  }
}

// ============================================================
console.log('');
console.log('======================================================================');
console.log('CALL TARGETS & COMPARES SUMMARY');
console.log('======================================================================');

for (var ci = 0; ci < allFns.length; ci++) {
  var clabel = allFns[ci][0];
  var cinstrs = allFns[ci][1];
  console.log('');
  console.log(clabel + ':');
  console.log('  CALL targets:');
  for (var cj = 0; cj < cinstrs.length; cj++) {
    var ctag = cinstrs[cj].tag;
    if (ctag === 'call' || ctag === 'call-conditional') {
      console.log('    ' + cinstrs[cj].text + ' (at ' + hex(cinstrs[cj].addr) + ')');
    }
  }
  console.log('  Compares/ALU tests:');
  for (var ck = 0; ck < cinstrs.length; ck++) {
    var cinst = cinstrs[ck].inst;
    if (cinst.op === 'cp' || cinst.tag === 'alu-imm' && cinst.op === 'cp' ||
        cinst.tag === 'alu-reg' && cinst.op === 'cp') {
      console.log('    ' + cinstrs[ck].text + ' (at ' + hex(cinstrs[ck].addr) + ')');
    }
    // Also catch OR A style zero-tests
    if ((cinst.op === 'or' || cinst.op === 'and') && cinst.tag === 'alu-reg') {
      console.log('    ' + cinstrs[ck].text + ' (at ' + hex(cinstrs[ck].addr) + ')');
    }
  }
}

console.log('');
console.log('Known nearby addresses:');
console.log('  0x08DB93 - Token-type guard (session 568)');
console.log('  0x08DD45 - Token classifier (called by guard)');
console.log('  0x08DBF1 - THIS: Token forward scanner');
console.log('  0x08DC1A - THIS: Called by forward scanner');
console.log('  D0231A   - Token cursor (from session 568)');

console.log('');
console.log('--- probe complete ---');
process.exit(0);
