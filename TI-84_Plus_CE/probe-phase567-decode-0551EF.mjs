/**
 * probe-phase567-decode-0551EF.mjs
 * Decode two undecoded BPP cluster helpers:
 *   0x0551EF — post-fill cleanup (called by 0x0551FE VRAM fill)
 *   0x055743 — BPP mode helper (called by 0x05523D BPP mode activate)
 */

import { readFileSync } from 'fs';
import { decodeInstruction } from './ez80-decoder.js';

const rom = readFileSync(new URL('./ROM.rom', import.meta.url));

function hex(v, w = 6) {
  return '0x' + v.toString(16).padStart(w, '0');
}

function hexByte(v) {
  return '0x' + (v & 0xFF).toString(16).padStart(2, '0');
}

function formatInstruction(inst) {
  const prefix = inst.modePrefix ? `${inst.modePrefix} ` : '';
  let text = inst.tag;

  switch (inst.tag) {
    case 'push': text = `push ${inst.pair}`; break;
    case 'pop': text = `pop ${inst.pair}`; break;
    case 'ld-pair-imm': text = `ld ${inst.pair}, ${hex(inst.value)}`; break;
    case 'ld-pair-mem':
      text = inst.direction === 'to-mem'
        ? `ld (${hex(inst.addr)}), ${inst.pair}`
        : `ld ${inst.pair}, (${hex(inst.addr)})`;
      break;
    case 'ld-reg-imm': text = `ld ${inst.dest}, ${hexByte(inst.value)}`; break;
    case 'ld-reg-reg': text = `ld ${inst.dest}, ${inst.src}`; break;
    case 'ld-reg-ind': text = `ld ${inst.dest}, (${inst.src})`; break;
    case 'ld-ind-reg': text = `ld (${inst.dest}), ${inst.src}`; break;
    case 'ld-ind-imm': text = `ld (hl), ${hexByte(inst.value)}`; break;
    case 'ld-reg-ixd': {
      const s = inst.displacement >= 0 ? '+' : '';
      text = `ld ${inst.dest}, (${inst.indexRegister}${s}${inst.displacement})`;
      break;
    }
    case 'ld-ixd-reg': {
      const s = inst.displacement >= 0 ? '+' : '';
      text = `ld (${inst.indexRegister}${s}${inst.displacement}), ${inst.src}`;
      break;
    }
    case 'ld-ixd-imm': {
      const s = inst.displacement >= 0 ? '+' : '';
      text = `ld (${inst.indexRegister}${s}${inst.displacement}), ${hexByte(inst.value)}`;
      break;
    }
    case 'ld-mem-a': text = `ld (${hex(inst.addr)}), a`; break;
    case 'ld-a-mem': text = `ld a, (${hex(inst.addr)})`; break;
    case 'alu-imm': text = `${inst.op} ${hexByte(inst.value)}`; break;
    case 'alu-reg': text = `${inst.op} ${inst.src}`; break;
    case 'alu-ind': text = `${inst.op} (${inst.indirectRegister || 'hl'})`; break;
    case 'alu-ixd': {
      const s = inst.displacement >= 0 ? '+' : '';
      text = `${inst.op} (${inst.indexRegister}${s}${inst.displacement})`;
      break;
    }
    case 'call': text = `call ${hex(inst.target)}`; break;
    case 'call-conditional': text = `call ${inst.condition}, ${hex(inst.target)}`; break;
    case 'jp': text = `jp ${hex(inst.target)}`; break;
    case 'jp-conditional': text = `jp ${inst.condition}, ${hex(inst.target)}`; break;
    case 'jp-indirect': text = `jp (${inst.indirectRegister || 'hl'})`; break;
    case 'jr': text = `jr ${hex(inst.target)}`; break;
    case 'jr-conditional': text = `jr ${inst.condition}, ${hex(inst.target)}`; break;
    case 'ret': text = 'ret'; break;
    case 'ret-conditional': text = `ret ${inst.condition}`; break;
    case 'reti': text = 'reti'; break;
    case 'inc-pair': text = `inc ${inst.pair}`; break;
    case 'dec-pair': text = `dec ${inst.pair}`; break;
    case 'inc-reg': text = `inc ${inst.reg}`; break;
    case 'dec-reg': text = `dec ${inst.reg}`; break;
    case 'inc-ind': text = `inc (hl)`; break;
    case 'dec-ind': text = `dec (hl)`; break;
    case 'add-pair': text = `add ${inst.dest}, ${inst.src}`; break;
    case 'sbc-pair': text = `sbc ${inst.dest}, ${inst.src}`; break;
    case 'adc-pair': text = `adc ${inst.dest}, ${inst.src}`; break;
    case 'djnz': text = `djnz ${hex(inst.target)}`; break;
    case 'rotate-reg': text = `${inst.op} ${inst.reg}`; break;
    case 'rotate-ind': text = `${inst.op} (${inst.indirectRegister || 'hl'})`; break;
    case 'ex-de-hl': text = 'ex de, hl'; break;
    case 'ex-af': text = "ex af, af'"; break;
    case 'exx': text = 'exx'; break;
    case 'nop': text = 'nop'; break;
    case 'di': text = 'di'; break;
    case 'ei': text = 'ei'; break;
    case 'halt': text = 'halt'; break;
    case 'im': text = `im ${inst.mode}`; break;
    case 'rst': text = `rst ${hex(inst.target, 2)}`; break;
    case 'ldir': text = 'ldir'; break;
    case 'lddr': text = 'lddr'; break;
    case 'ldi': text = 'ldi'; break;
    case 'ldd': text = 'ldd'; break;
    case 'cpir': text = 'cpir'; break;
    case 'cpdr': text = 'cpdr'; break;
    case 'cpi': text = 'cpi'; break;
    case 'cpd': text = 'cpd'; break;
    case 'out-imm': text = `out (${hexByte(inst.port)}), a`; break;
    case 'in-imm': text = `in a, (${hexByte(inst.port)})`; break;
    case 'out-c': text = `out (c), ${inst.reg}`; break;
    case 'in-c': text = `in ${inst.reg}, (c)`; break;
    case 'otir': text = 'otir'; break;
    case 'otdr': text = 'otdr'; break;
    case 'outi': text = 'outi'; break;
    case 'outd': text = 'outd'; break;
    case 'inir': text = 'inir'; break;
    case 'indr': text = 'indr'; break;
    case 'ini': text = 'ini'; break;
    case 'ind': text = 'ind'; break;
    case 'bit-test': text = `bit ${inst.bit}, ${inst.reg}`; break;
    case 'bit-test-ind': text = `bit ${inst.bit}, (${inst.indirectRegister || 'hl'})`; break;
    case 'bit-set': text = `set ${inst.bit}, ${inst.reg}`; break;
    case 'bit-set-ind': text = `set ${inst.bit}, (${inst.indirectRegister || 'hl'})`; break;
    case 'bit-res': text = `res ${inst.bit}, ${inst.reg}`; break;
    case 'bit-res-ind': text = `res ${inst.bit}, (${inst.indirectRegister || 'hl'})`; break;
    case 'indexed-cb-bit': text = `bit ${inst.bit}, (${inst.indexRegister}+${inst.displacement})`; break;
    case 'indexed-cb-set': text = `set ${inst.bit}, (${inst.indexRegister}+${inst.displacement})`; break;
    case 'indexed-cb-res': text = `res ${inst.bit}, (${inst.indexRegister}+${inst.displacement})`; break;
    case 'indexed-cb-rotate': text = `${inst.operation} (${inst.indexRegister}+${inst.displacement})`; break;
    case 'scf': text = 'scf'; break;
    case 'ccf': text = 'ccf'; break;
    case 'cpl': text = 'cpl'; break;
    case 'neg': text = 'neg'; break;
    case 'daa': text = 'daa'; break;
    case 'rlca': text = 'rlca'; break;
    case 'rrca': text = 'rrca'; break;
    case 'rla': text = 'rla'; break;
    case 'rra': text = 'rra'; break;
    case 'rld': text = 'rld'; break;
    case 'rrd': text = 'rrd'; break;
    case 'ex-sp-hl': text = 'ex (sp), hl'; break;
    case 'ex-sp-ix': text = `ex (sp), ${inst.indexRegister}`; break;
    case 'ld-sp-hl': text = 'ld sp, hl'; break;
    case 'ld-sp-ix': text = `ld sp, ${inst.indexRegister}`; break;
    case 'ld-i-a': text = 'ld i, a'; break;
    case 'ld-a-i': text = 'ld a, i'; break;
    case 'ld-r-a': text = 'ld r, a'; break;
    case 'ld-a-r': text = 'ld a, r'; break;
    case 'inc-ixd': {
      const s = inst.displacement >= 0 ? '+' : '';
      text = `inc (${inst.indexRegister}${s}${inst.displacement})`;
      break;
    }
    case 'dec-ixd': {
      const s = inst.displacement >= 0 ? '+' : '';
      text = `dec (${inst.indexRegister}${s}${inst.displacement})`;
      break;
    }
    default:
      // leave as tag name
      break;
  }

  return `${prefix}${text}`;
}

function disasmRegion(label, startAddr, maxBytes) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`  ${label}`);
  console.log(`  Start: ${hex(startAddr)}  Max bytes: ${maxBytes}`);
  console.log('='.repeat(70));

  let offset = startAddr;
  const endAddr = startAddr + maxBytes;
  const instructions = [];

  while (offset < endAddr) {
    let instr;
    try {
      instr = decodeInstruction(rom, offset, 'adl');
    } catch (e) {
      console.log(`  ${hex(offset)}  [DECODE ERROR: ${e.message}]`);
      break;
    }

    if (!instr || instr.length === 0) {
      console.log(`  ${hex(offset)}  [NULL/ZERO-LENGTH]`);
      break;
    }

    const hexBytes = [];
    for (let i = 0; i < instr.length; i++) {
      hexBytes.push(rom[offset + i].toString(16).padStart(2, '0'));
    }
    const hexStr = hexBytes.join(' ').padEnd(20);
    const formatted = formatInstruction(instr);

    console.log(`  ${hex(offset)}  ${hexStr}  ${formatted}`);

    instructions.push({
      addr: offset,
      hex: hexStr.trim(),
      tag: instr.tag,
      formatted,
      length: instr.length,
      raw: instr,
    });

    // Stop at unconditional RET or JP (not conditional)
    if (instr.tag === 'ret') break;
    if (instr.tag === 'jp') break;
    if (instr.tag === 'jp-indirect') break;

    offset += instr.length;
  }

  const lastInstr = instructions[instructions.length - 1];
  const size = lastInstr ? (lastInstr.addr + lastInstr.length - startAddr) : 0;

  console.log(`\n  --- Summary ---`);
  console.log(`  Size: ${size} bytes (${hex(startAddr)} - ${hex(startAddr + size - 1)})`);
  console.log(`  Instructions: ${instructions.length}`);

  // Identify calls, jumps, RAM/MMIO refs
  const calls = [];
  const ramRefs = [];
  for (const i of instructions) {
    const r = i.raw;
    if (r.tag === 'call' || r.tag === 'call-conditional') {
      calls.push(`call ${r.condition ? r.condition + ', ' : ''}${hex(r.target)} @ ${hex(i.addr)}`);
    }
    if (r.tag === 'jp' || r.tag === 'jp-conditional') {
      calls.push(`jp ${r.condition ? r.condition + ', ' : ''}${hex(r.target)} @ ${hex(i.addr)}`);
    }

    // Check for RAM/MMIO addresses in various instruction fields
    for (const field of ['addr', 'target', 'value']) {
      const val = r[field];
      if (typeof val === 'number' && val >= 0xD00000) {
        ramRefs.push(`${hex(val)} (${field}) in "${i.formatted}" @ ${hex(i.addr)}`);
      }
    }
  }

  if (calls.length) {
    console.log(`  External calls/jumps:`);
    calls.forEach(c => console.log(`    ${c}`));
  }
  if (ramRefs.length) {
    console.log(`  RAM/MMIO references:`);
    ramRefs.forEach(r => console.log(`    ${r}`));
  }

  return { instructions, size };
}

// Region 1: 0x0551EF — post-fill cleanup, small function just before 0x0551FE
const r1 = disasmRegion(
  '0x0551EF — Post-Fill Cleanup (called at end of 0x0551FE VRAM fill)',
  0x0551EF,
  16
);

// Region 2: 0x055743 — BPP mode helper (called by 0x05523D BPP mode activate)
const r2 = disasmRegion(
  '0x055743 — BPP Mode Helper (called by 0x05523D BPP activate)',
  0x055743,
  64
);

// Also decode a bit further if 0x055743 is small — check surroundings
console.log('\n--- Additional context: bytes after 0x0551EF region ---');
const r1end = 0x0551EF + r1.size;
console.log(`  Next function at 0x0551FE starts ${0x0551FE - r1end} bytes after 0x0551EF end (${hex(r1end)})`);
if (r1end < 0x0551FE) {
  console.log('  Gap bytes:');
  let gapHex = '';
  for (let i = r1end; i < 0x0551FE; i++) {
    gapHex += rom[i].toString(16).padStart(2, '0') + ' ';
  }
  console.log(`    ${gapHex.trim()}`);
}

console.log('\n' + '='.repeat(70));
console.log('  FINAL ANALYSIS');
console.log('='.repeat(70));
console.log(`\n  0x0551EF: ${r1.size} bytes, ${r1.instructions.length} instructions`);
console.log(`  0x055743: ${r2.size} bytes, ${r2.instructions.length} instructions`);
console.log('\nDone.');
