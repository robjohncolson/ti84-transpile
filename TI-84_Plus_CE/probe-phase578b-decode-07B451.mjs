/**
 * probe-phase578b-decode-07B451.mjs
 *
 * 0x070372 is a thin wrapper (20B) around CALL 0x07B451. The real glyph
 * work lives in 0x07B451. Decode it to understand the full pipeline.
 *
 * Also decode a window around caller 0x070267 (inside 0x070241 font engine
 * core) to understand context.
 */

import { readFileSync } from 'fs';
import { decodeInstruction } from './ez80-decoder.js';

const rom = readFileSync(new URL('./ROM.rom', import.meta.url));

const MAX_INSN = 300;

// -- helpers --

function hex(v, w = 6) {
  return '0x' + v.toString(16).toUpperCase().padStart(w, '0');
}

function bytesHex(start, len) {
  const out = [];
  for (let i = 0; i < len; i++) out.push(rom[start + i].toString(16).toUpperCase().padStart(2, '0'));
  return out.join(' ');
}

function formatInsn(r) {
  if (r.tag === 'indexed-cb-set') return 'SET ' + r.bit + ',(IY+' + hex(r.displacement, 2) + ')';
  if (r.tag === 'indexed-cb-res') return 'RES ' + r.bit + ',(IY+' + hex(r.displacement, 2) + ')';
  if (r.tag === 'indexed-cb-bit') return 'BIT ' + r.bit + ',(IY+' + hex(r.displacement, 2) + ')';
  if (r.tag === 'ret') return 'RET';
  if (r.tag === 'ret-conditional') return 'RET ' + r.condition.toUpperCase();
  if (r.tag === 'call') return 'CALL ' + hex(r.target);
  if (r.tag === 'call-conditional') return 'CALL ' + r.condition.toUpperCase() + ',' + hex(r.target);
  if (r.tag === 'jp') return r.condition ? 'JP ' + r.condition.toUpperCase() + ',' + hex(r.target) : 'JP ' + hex(r.target);
  if (r.tag === 'jr') return r.condition ? 'JR ' + r.condition.toUpperCase() + ',' + hex(r.target) : 'JR ' + hex(r.target);
  if (r.tag === 'jr-conditional') return 'JR ' + r.condition.toUpperCase() + ',' + hex(r.target);
  if (r.tag === 'ld-reg-mem') {
    const pfx = r.modePrefix ? '.' + r.modePrefix.toUpperCase() + ' ' : '';
    return pfx + 'LD ' + r.dest.toUpperCase() + ',(' + hex(r.addr) + ')';
  }
  if (r.tag === 'ld-mem-reg') {
    const pfx = r.modePrefix ? '.' + r.modePrefix.toUpperCase() + ' ' : '';
    return pfx + 'LD (' + hex(r.addr) + '),' + r.src.toUpperCase();
  }
  if (r.tag === 'ld-pair-mem') {
    const pfx = r.modePrefix ? '.' + r.modePrefix.toUpperCase() + ' ' : '';
    if (r.direction === 'to-mem') return pfx + 'LD (' + hex(r.addr) + '),' + r.pair.toUpperCase();
    return pfx + 'LD ' + r.pair.toUpperCase() + ',(' + hex(r.addr) + ')';
  }
  if (r.tag === 'ld-pair-imm') return 'LD ' + r.pair.toUpperCase() + ',' + hex(r.value);
  if (r.tag === 'ld-reg-imm') return 'LD ' + r.dest.toUpperCase() + ',0x' + r.value.toString(16).toUpperCase().padStart(2, '0');
  if (r.tag === 'ld-reg-reg') return 'LD ' + r.dest.toUpperCase() + ',' + r.src.toUpperCase();
  if (r.tag === 'alu-imm') return r.op.toUpperCase() + ' 0x' + r.value.toString(16).toUpperCase().padStart(2, '0');
  if (r.tag === 'alu-reg') return r.op.toUpperCase() + ' ' + r.src.toUpperCase();
  if (r.tag === 'push') return 'PUSH ' + r.pair.toUpperCase();
  if (r.tag === 'pop') return 'POP ' + r.pair.toUpperCase();
  if (r.tag === 'ex-de-hl') return 'EX DE,HL';
  if (r.tag === 'inc-pair') return 'INC ' + r.pair.toUpperCase();
  if (r.tag === 'dec-pair') return 'DEC ' + r.pair.toUpperCase();
  if (r.tag === 'inc-reg') return 'INC ' + (r.reg || r.dest || '?').toUpperCase();
  if (r.tag === 'dec-reg') return 'DEC ' + (r.reg || r.dest || '?').toUpperCase();
  if (r.tag === 'nop') return 'NOP';
  if (r.tag === 'di') return 'DI';
  if (r.tag === 'ei') return 'EI';
  if (r.tag === 'halt') return 'HALT';
  if (r.tag === 'rst') return 'RST ' + hex(r.target, 2);
  if (r.tag === 'ldir') return 'LDIR';
  if (r.tag === 'ldi') return 'LDI';
  if (r.tag === 'lddr') return 'LDDR';
  if (r.tag === 'djnz') return 'DJNZ ' + hex(r.target);
  if (r.tag === 'or-reg') return 'OR ' + r.src.toUpperCase();
  if (r.tag === 'and-reg') return 'AND ' + r.src.toUpperCase();
  if (r.tag === 'xor-reg') return 'XOR ' + r.src.toUpperCase();
  if (r.tag === 'cp-reg') return 'CP ' + r.src.toUpperCase();
  if (r.tag === 'cp-imm') return 'CP 0x' + r.value.toString(16).toUpperCase().padStart(2, '0');
  if (r.tag === 'sla') return 'SLA ' + (r.reg || '?').toUpperCase();
  if (r.tag === 'sra') return 'SRA ' + (r.reg || '?').toUpperCase();
  if (r.tag === 'srl') return 'SRL ' + (r.reg || '?').toUpperCase();
  if (r.tag === 'rl') return 'RL ' + (r.reg || '?').toUpperCase();
  if (r.tag === 'rr') return 'RR ' + (r.reg || '?').toUpperCase();
  if (r.tag === 'rlc') return 'RLC ' + (r.reg || '?').toUpperCase();
  if (r.tag === 'rrc') return 'RRC ' + (r.reg || '?').toUpperCase();
  if (r.tag === 'bit') return 'BIT ' + r.bit + ',' + (r.reg || '?').toUpperCase();
  if (r.tag === 'set') return 'SET ' + r.bit + ',' + (r.reg || '?').toUpperCase();
  if (r.tag === 'res') return 'RES ' + r.bit + ',' + (r.reg || '?').toUpperCase();
  if (r.tag === 'rla') return 'RLA';
  if (r.tag === 'rra') return 'RRA';
  if (r.tag === 'rlca') return 'RLCA';
  if (r.tag === 'rrca') return 'RRCA';
  if (r.tag === 'cpl') return 'CPL';
  if (r.tag === 'scf') return 'SCF';
  if (r.tag === 'ccf') return 'CCF';
  if (r.tag === 'add-pair') return 'ADD ' + (r.dest || 'HL').toUpperCase() + ',' + (r.src || r.pair || '?').toUpperCase();
  if (r.tag === 'adc-pair') return 'ADC ' + (r.dest || 'HL').toUpperCase() + ',' + (r.src || r.pair || '?').toUpperCase();
  if (r.tag === 'sbc-pair') return 'SBC ' + (r.dest || 'HL').toUpperCase() + ',' + (r.src || r.pair || '?').toUpperCase();
  if (r.tag === 'ex-sp-hl') return 'EX (SP),HL';
  if (r.tag === 'ld-sp-hl') return 'LD SP,HL';
  if (r.tag === 'jp-hl') return 'JP (HL)';
  if (r.tag === 'out') return 'OUT (' + hex(r.port, 2) + '),' + (r.src || 'A').toUpperCase();
  if (r.tag === 'in') return 'IN ' + (r.dest || 'A').toUpperCase() + ',(' + hex(r.port, 2) + ')';
  if (r.tag === 'exx') return 'EXX';
  if (r.tag === 'ex-af') return "EX AF,AF'";
  if (r.tag === 'neg') return 'NEG';
  if (r.tag === 'reti') return 'RETI';
  if (r.tag === 'retn') return 'RETN';
  if (r.tag === 'cpir') return 'CPIR';
  if (r.tag === 'cpdr') return 'CPDR';
  if (r.tag === 'ld-indexed') {
    const off = r.displacement !== undefined ? r.displacement : 0;
    const sign = off >= 0 ? '+' : '';
    if (r.direction === 'to-mem') return 'LD (IY' + sign + off + '),' + (r.src || hex(r.value, 2));
    return 'LD ' + (r.dest || '?').toUpperCase() + ',(IY' + sign + off + ')';
  }

  const extras = Object.entries(r)
    .filter(function(e) { return !['pc', 'length', 'nextPc', 'mode', 'modePrefix', 'terminates'].includes(e[0]); })
    .map(function(e) { return e[0] + '=' + e[1]; })
    .join(' ');
  return '[' + r.tag + '] ' + extras;
}

function disassembleRange(start, maxInsn) {
  const insns = [];
  let addr = start;
  for (let i = 0; i < maxInsn && addr < rom.length; i++) {
    const r = decodeInstruction(rom, addr, 'adl');
    if (!r || !r.length) {
      insns.push({ address: addr, bytes: bytesHex(addr, 1), mnemonic: '??? (decode fail)', decoded: null });
      addr++;
      continue;
    }
    insns.push({
      address: addr,
      bytes: bytesHex(addr, r.length),
      mnemonic: formatInsn(r),
      decoded: r,
    });
    addr = r.nextPc;
    if (r.tag === 'ret' || r.tag === 'reti' || r.tag === 'retn' ||
        r.tag === 'jp-hl' || (r.tag === 'jp' && !r.condition)) {
      break;
    }
  }
  return insns;
}

// ============================
// Part A: Decode 0x07B451
// ============================

console.log('=== phase578b: Decode 0x07B451 (called by 0x070372) ===\n');

const insns07B451 = disassembleRange(0x07B451, MAX_INSN);
const lastInsn = insns07B451[insns07B451.length - 1];
const endAddr = lastInsn ? lastInsn.address + (lastInsn.decoded ? lastInsn.decoded.length : 1) : 0x07B451;
console.log('Function: ' + hex(0x07B451) + ' - ' + hex(endAddr - 1) + ' (' + (endAddr - 0x07B451) + ' bytes, ' + insns07B451.length + ' insns)\n');

for (const item of insns07B451) {
  console.log('  ' + hex(item.address) + '  ' + item.bytes.padEnd(20) + '  ' + item.mnemonic);
}

// Targets
console.log('\n  --- CALL/JP/JR Targets ---');
for (const item of insns07B451) {
  if (!item.decoded) continue;
  const r = item.decoded;
  if (['call', 'call-conditional', 'jp', 'jr', 'jr-conditional', 'rst', 'djnz'].includes(r.tag) && r.target !== undefined) {
    console.log('  ' + hex(item.address) + ': ' + item.mnemonic);
  }
}

// RAM refs
console.log('\n  --- RAM Refs (D0xxxx) ---');
for (const item of insns07B451) {
  if (!item.decoded) continue;
  const addr = item.decoded.addr;
  if (addr !== undefined && addr >= 0xD00000 && addr <= 0xDFFFFF) {
    const access = item.decoded.tag.includes('mem-reg') ? 'WRITE' :
      (item.decoded.tag.includes('reg-mem') || item.decoded.tag.includes('pair-mem')) ? 'READ' : 'REF';
    const isPx = (addr >= 0xD02A62 && addr <= 0xD02A75) ? ' *** PIXEL WORKSPACE ***' : '';
    console.log('  ' + hex(item.address) + ': ' + item.mnemonic + '  [' + access + ']' + isPx);
  }
}

// IY ops
console.log('\n  --- IY Operations ---');
for (const item of insns07B451) {
  if (!item.decoded) continue;
  if (item.decoded.tag && (item.decoded.tag.startsWith('indexed-cb-') || item.decoded.tag === 'ld-indexed')) {
    console.log('  ' + hex(item.address) + ': ' + item.mnemonic);
  }
}

// Block copies
console.log('\n  --- Block Copies ---');
for (const item of insns07B451) {
  if (!item.decoded) continue;
  if (['ldir', 'ldi', 'lddr'].includes(item.decoded.tag)) {
    console.log('  ' + hex(item.address) + ': ' + item.mnemonic);
  }
}

// Scan for callers of 0x07B451
console.log('\n  --- Callers of 0x07B451 ---');
const target2 = 0x07B451;
const t2Lo  = target2 & 0xFF;
const t2Mid = (target2 >> 8) & 0xFF;
const t2Hi  = (target2 >> 16) & 0xFF;
const callOps = [0xCD, 0xC4, 0xCC, 0xD4, 0xDC, 0xE4, 0xEC, 0xF4, 0xFC];
const jpOps   = [0xC3, 0xC2, 0xCA, 0xD2, 0xDA, 0xE2, 0xEA, 0xF2, 0xFA];

let caller2Count = 0;
for (let i = 0; i < rom.length - 4; i++) {
  const op = rom[i];
  if (callOps.includes(op) || jpOps.includes(op)) {
    if (rom[i + 1] === t2Lo && rom[i + 2] === t2Mid && rom[i + 3] === t2Hi) {
      const r = decodeInstruction(rom, i, 'adl');
      if (r && r.target === target2) {
        console.log('  ' + hex(i) + ': ' + bytesHex(i, r.length).padEnd(20) + '  ' + formatInsn(r));
        caller2Count++;
      }
    }
  }
}
console.log('  Total callers: ' + caller2Count);

// ============================
// Part B: Context around caller 0x070267
// ============================

console.log('\n=== Context: 0x070241 font engine (around caller 0x070267) ===\n');

// Decode from 0x070241 (known function start) to see context
const contextInsns = disassembleRange(0x070241, MAX_INSN);
for (const item of contextInsns) {
  const marker = item.address === 0x070267 ? ' <<<< CALLS 0x070372' :
                 item.address === 0x0703AC ? ' <<<< CALLS 0x070372 (2nd)' : '';
  console.log('  ' + hex(item.address) + '  ' + item.bytes.padEnd(20) + '  ' + item.mnemonic + marker);
}

// ============================
// Summary
// ============================

console.log('\n=== Full Summary ===\n');
console.log('  0x070372 (20B, 8 insns): IY+0x35 bit 7 save/restore wrapper');
console.log('    - Saves bit 7 of (IY+0x35) on stack');
console.log('    - Clears bit 7 of (IY+0x35)');
console.log('    - Calls 0x07B451 (the real work)');
console.log('    - Restores bit 7 of (IY+0x35) only if it was set before');
console.log('    - 2 callers: 0x070267, 0x0703AC (both in font engine core 0x070241)');
console.log('');
console.log('  0x07B451 (' + (endAddr - 0x07B451) + 'B, ' + insns07B451.length + ' insns): delegated subroutine');

console.log('\nDone.');
process.exit(0);
