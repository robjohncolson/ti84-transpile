#!/usr/bin/env node
// Decode 0x0A26C7 — Alternate cleanup exit from 8bpp glyph blit path
// Session 567 found the column blit 8bpp sub-path (0x0A262B-0x0A2673)
// exits via JP 0x0A26C7, NOT the main post-blit handler at 0x0A2695.
// This probe disassembles 0x0A26C7 to understand how the alternate
// cleanup differs from the main 0x0A2695 path.

import { readFileSync } from 'fs';
import { decodeInstruction } from './ez80-decoder.js';

const rom = readFileSync(new URL('./ROM.rom', import.meta.url));

const START = 0x0A26C7;
const MASK_TABLE = 0x0A26E4; // 7-entry pixel fill mask table (session 562)
const MAX_BYTES = MASK_TABLE - START; // don't overlap mask table

function hex(v, w = 6) {
  return '0x' + (v >>> 0).toString(16).padStart(w, '0');
}

function hexByte(v) {
  return '0x' + (v & 0xff).toString(16).padStart(2, '0');
}

function hexWord(v) {
  return '0x' + (v & 0xffffff).toString(16).padStart(6, '0');
}

// Known RAM addresses for annotation
const RAM_LABELS = {
  0xd005f8: 'tokenClassByte0',
  0xd005f9: 'tokenClassByte1',
  0xd005fa: 'tokenClassByte2',
  0xd00080: 'IY_base (flags)',
  0xd00081: 'IY+0x01',
  0xd0058e: 'keyEventCode',
  0xd006c0: 'textBuffer',
  0xd02505: 'scrollCount',
  0xd025ce: 'rowCount',
  0xd025cf: 'fontAppField',
  0xd02611: 'fontAppHeader',
  0xd000c6: 'bppModeFlags',
  0xd007c4: 'curSavePos',
  0xd031f5: 'scrollFillBase',
  0xd0059c: 'vramScanlinePtr',
  0xd005c5: 'glyphWorkspace',
};

// Known ROM addresses for annotation
const ROM_LABELS = {
  0x0a2695: 'POST_BLIT_COLUMN_HANDLER (main exit)',
  0x0a26c7: 'ALTERNATE_8BPP_CLEANUP (this fn)',
  0x0a26d6: '15B function (session 565)',
  0x0a26e4: 'mask table (7-entry pixel fill)',
  0x0a2537: 'ROW_LOOP_TOP',
  0x0a258f: 'COLUMN_BLIT',
  0x0a2400: 'RENDER_SETUP',
  0x0a23ab: 'RENDERING_PREAMBLE',
};

function annotateAddr(addr) {
  if (RAM_LABELS[addr]) return `  ; ${RAM_LABELS[addr]}`;
  if (ROM_LABELS[addr]) return `  ; ${ROM_LABELS[addr]}`;
  if (addr >= 0xd00080 && addr <= 0xd000ff) return `  ; IY+${hex(addr - 0xd00080, 2)}`;
  if (addr >= 0xd00000 && addr < 0xe00000) return `  ; RAM`;
  if (addr < 0x400000) return `  ; ROM`;
  return '';
}

function formatInstruction(inst) {
  switch (inst.tag) {
    case 'nop': return 'nop';
    case 'halt': return 'halt';
    case 'di': return 'di';
    case 'ei': return 'ei';
    case 'exx': return 'exx';
    case 'ex-af': return "ex af, af'";
    case 'ex-de-hl': return 'ex de, hl';
    case 'ex-sp-hl': return 'ex (sp), hl';
    case 'ex-sp-index': return `ex (sp), ${inst.indexRegister}`;
    case 'ld-reg-reg': return `ld ${inst.dest}, ${inst.src}`;
    case 'ld-reg-imm': return `ld ${inst.dest}, ${hexByte(inst.value)}`;
    case 'ld-pair-imm': return `ld ${inst.pair}, ${hexWord(inst.value)}`;
    case 'ld-reg-mem': return `ld ${inst.dest}, (${hexWord(inst.addr)})`;
    case 'ld-mem-reg': return `ld (${hexWord(inst.addr)}), ${inst.src}`;
    case 'ld-pair-mem': return `ld ${inst.pair}, (${hexWord(inst.addr)})`;
    case 'ld-mem-pair': return `ld (${hexWord(inst.addr)}), ${inst.pair}`;
    case 'ld-sp-hl': return 'ld sp, hl';
    case 'ld-sp-index': return `ld sp, ${inst.indexRegister}`;
    case 'ld-reg-ind': return `ld ${inst.dest}, (${inst.indirectRegister})`;
    case 'ld-ind-reg': return `ld (${inst.indirectRegister}), ${inst.src}`;
    case 'ld-ind-imm': return `ld (${inst.indirectRegister}), ${hexByte(inst.value)}`;
    case 'ld-indexed-reg': {
      const s = inst.displacement >= 0 ? '+' : '';
      return `ld (${inst.indexRegister}${s}${inst.displacement}), ${inst.src}`;
    }
    case 'ld-reg-indexed': {
      const s = inst.displacement >= 0 ? '+' : '';
      return `ld ${inst.dest}, (${inst.indexRegister}${s}${inst.displacement})`;
    }
    case 'ld-indexed-imm': {
      const s = inst.displacement >= 0 ? '+' : '';
      return `ld (${inst.indexRegister}${s}${inst.displacement}), ${hexByte(inst.value)}`;
    }
    case 'ld-a-i': return 'ld a, i';
    case 'ld-i-a': return 'ld i, a';
    case 'ld-a-r': return 'ld a, r';
    case 'ld-r-a': return 'ld r, a';
    case 'alu-reg': return `${inst.op} ${inst.src}`;
    case 'alu-imm': return `${inst.op} ${hexByte(inst.value)}`;
    case 'alu-ind': return `${inst.op} (${inst.indirectRegister})`;
    case 'alu-indexed': {
      const s = inst.displacement >= 0 ? '+' : '';
      return `${inst.op} (${inst.indexRegister}${s}${inst.displacement})`;
    }
    case 'inc-reg': return `inc ${inst.reg}`;
    case 'dec-reg': return `dec ${inst.reg}`;
    case 'inc-pair': return `inc ${inst.pair}`;
    case 'dec-pair': return `dec ${inst.pair}`;
    case 'inc-ind': return `inc (${inst.indirectRegister})`;
    case 'dec-ind': return `dec (${inst.indirectRegister})`;
    case 'inc-index': return `inc ${inst.indexRegister}`;
    case 'dec-index': return `dec ${inst.indexRegister}`;
    case 'inc-indexed': {
      const s = inst.displacement >= 0 ? '+' : '';
      return `inc (${inst.indexRegister}${s}${inst.displacement})`;
    }
    case 'dec-indexed': {
      const s = inst.displacement >= 0 ? '+' : '';
      return `dec (${inst.indexRegister}${s}${inst.displacement})`;
    }
    case 'push': return `push ${inst.pair}`;
    case 'pop': return `pop ${inst.pair}`;
    case 'push-index': return `push ${inst.indexRegister}`;
    case 'pop-index': return `pop ${inst.indexRegister}`;
    case 'jp': return `jp ${hexWord(inst.target)}`;
    case 'jp-conditional': return `jp ${inst.condition}, ${hexWord(inst.target)}`;
    case 'jp-hl': return 'jp (hl)';
    case 'jp-index': return `jp (${inst.indexRegister})`;
    case 'jr': return `jr ${hexWord(inst.target)}`;
    case 'jr-conditional': return `jr ${inst.condition}, ${hexWord(inst.target)}`;
    case 'djnz': return `djnz ${hexWord(inst.target)}`;
    case 'call': return `call ${hexWord(inst.target)}`;
    case 'call-conditional': return `call ${inst.condition}, ${hexWord(inst.target)}`;
    case 'ret': return 'ret';
    case 'ret-conditional': return `ret ${inst.condition}`;
    case 'reti': return 'reti';
    case 'retn': return 'retn';
    case 'rst': return `rst ${hexByte(inst.target)}`;
    case 'bit-test': return `bit ${inst.bit}, ${inst.reg}`;
    case 'bit-test-ind': return `bit ${inst.bit}, (${inst.indirectRegister})`;
    case 'bit-set': return `set ${inst.bit}, ${inst.reg}`;
    case 'bit-set-ind': return `set ${inst.bit}, (${inst.indirectRegister})`;
    case 'bit-reset': return `res ${inst.bit}, ${inst.reg}`;
    case 'bit-reset-ind': return `res ${inst.bit}, (${inst.indirectRegister})`;
    case 'indexed-cb-bit': {
      const s = inst.displacement >= 0 ? '+' : '';
      return `bit ${inst.bit}, (${inst.indexRegister}${s}${inst.displacement})`;
    }
    case 'indexed-cb-set': {
      const s = inst.displacement >= 0 ? '+' : '';
      return `set ${inst.bit}, (${inst.indexRegister}${s}${inst.displacement})`;
    }
    case 'indexed-cb-reset': {
      const s = inst.displacement >= 0 ? '+' : '';
      return `res ${inst.bit}, (${inst.indexRegister}${s}${inst.displacement})`;
    }
    case 'rotate-reg': return `${inst.op} ${inst.reg}`;
    case 'rotate-ind': return `${inst.op} (${inst.indirectRegister})`;
    case 'indexed-cb-rotate': {
      const s = inst.displacement >= 0 ? '+' : '';
      return `${inst.op} (${inst.indexRegister}${s}${inst.displacement})`;
    }
    case 'rlca': return 'rlca';
    case 'rrca': return 'rrca';
    case 'rla': return 'rla';
    case 'rra': return 'rra';
    case 'rld': return 'rld';
    case 'rrd': return 'rrd';
    case 'daa': return 'daa';
    case 'cpl': return 'cpl';
    case 'scf': return 'scf';
    case 'ccf': return 'ccf';
    case 'neg': return 'neg';
    case 'im': return `im ${inst.mode_val ?? inst.im_mode ?? '?'}`;
    case 'in-reg': return `in ${inst.reg}, (c)`;
    case 'out-reg': return `out (c), ${inst.reg}`;
    case 'in-a-imm': return `in a, (${hexByte(inst.port)})`;
    case 'out-imm-a': return `out (${hexByte(inst.port)}), a`;
    case 'ldi': return 'ldi';
    case 'ldir': return 'ldir';
    case 'ldd': return 'ldd';
    case 'lddr': return 'lddr';
    case 'cpi': return 'cpi';
    case 'cpir': return 'cpir';
    case 'cpd': return 'cpd';
    case 'cpdr': return 'cpdr';
    case 'ini': return 'ini';
    case 'inir': return 'inir';
    case 'ind': return 'ind';
    case 'indr': return 'indr';
    case 'outi': return 'outi';
    case 'otir': return 'otir';
    case 'outd': return 'outd';
    case 'otdr': return 'otdr';
    case 'add-hl-pair': return `add hl, ${inst.pair}`;
    case 'adc-hl-pair': return `adc hl, ${inst.pair}`;
    case 'sbc-hl-pair': return `sbc hl, ${inst.pair}`;
    case 'add-index-pair': return `add ${inst.indexRegister}, ${inst.pair}`;
    case 'lea-index': {
      const s = inst.displacement >= 0 ? '+' : '';
      return `lea ${inst.dest}, ${inst.indexRegister}${s}${inst.displacement}`;
    }
    case 'lea-pair': {
      const s = inst.displacement >= 0 ? '+' : '';
      return `lea ${inst.pair}, ${inst.indexRegister}${s}${inst.displacement}`;
    }
    case 'pea-index': {
      const s = inst.displacement >= 0 ? '+' : '';
      return `pea ${inst.indexRegister}${s}${inst.displacement}`;
    }
    case 'tst-a-reg': return `tst a, ${inst.reg}`;
    case 'tst-a-imm': return `tst a, ${hexByte(inst.value)}`;
    case 'mlt': return `mlt ${inst.pair}`;
    case 'stmix': return 'stmix';
    case 'rsmix': return 'rsmix';
    case 'slp': return 'slp';
    case 'ld-mb-a': return 'ld mb, a';
    case 'ld-a-mb': return 'ld a, mb';
    default: return `<${inst.tag}>${JSON.stringify(inst)}`;
  }
}

// Collect external calls, RAM refs, exit paths
const calls = [];
const ramRefs = [];
const exitPaths = [];
const condBranchTargets = new Set();

console.log(`=== Disassembly of 0x0A26C7 — Alternate 8bpp Cleanup Exit ===`);
console.log(`    (8bpp blit path 0x0A262B-0x0A2673 exits here via JP)`);
console.log(`    (main post-blit handler is at 0x0A2695 for comparison)`);
console.log(`    (mask table at 0x0A26E4 — stop before that)\n`);

// Disassemble up to mask table boundary
let pc = START;
const endPc = START + MAX_BYTES;
let instrCount = 0;
let lastPc = START;
const instructions = [];

while (pc < endPc) {
  const inst = decodeInstruction(rom, pc, 'adl');

  // Safety: don't decode into mask table
  if (inst.pc + inst.length > MASK_TABLE) {
    console.log(`  (stopping: next instruction would overlap mask table at ${hex(MASK_TABLE)})\n`);
    break;
  }

  const rawBytes = Array.from(
    rom.slice(inst.pc, inst.pc + inst.length),
    (v) => v.toString(16).padStart(2, '0')
  ).join(' ');

  const dasm = formatInstruction(inst);
  instructions.push({ inst, rawBytes, dasm });

  // Track conditional branch targets
  if (inst.tag === 'jr-conditional' || inst.tag === 'jp-conditional') {
    condBranchTargets.add(inst.target);
  }

  // Track calls
  if (inst.tag === 'call' || inst.tag === 'call-conditional') {
    calls.push({ pc: inst.pc, target: inst.target, conditional: inst.tag === 'call-conditional', condition: inst.condition });
  }

  // Track RAM references
  if (inst.addr !== undefined && inst.addr >= 0xd00000 && inst.addr < 0xe00000) {
    ramRefs.push({ pc: inst.pc, addr: inst.addr, label: RAM_LABELS[inst.addr] || 'RAM' });
  }

  // Track exit paths
  if (inst.tag === 'ret' || inst.tag === 'ret-conditional') {
    exitPaths.push({ pc: inst.pc, type: inst.tag, condition: inst.condition });
  }
  if (inst.tag === 'jp' || inst.tag === 'jp-hl' || inst.tag === 'jp-index') {
    exitPaths.push({ pc: inst.pc, type: inst.tag, target: inst.target });
  }

  instrCount++;
  lastPc = inst.pc + inst.length;
  pc += inst.length;

  // Stop at unconditional RET or JP, but continue if a conditional branch
  // targets an address past us
  if (inst.tag === 'ret' || inst.tag === 'jp' || inst.tag === 'jp-hl' || inst.tag === 'jp-index') {
    const nextPc = inst.pc + inst.length;
    if (!condBranchTargets.has(nextPc)) {
      break;
    }
    console.log(`  (conditional branch targets ${hex(nextPc)}, continuing)\n`);
  }
}

// Print all instructions
for (const { inst, rawBytes, dasm } of instructions) {
  let annotation = '';

  // Annotate addresses in the instruction
  if (inst.addr !== undefined) {
    annotation = annotateAddr(inst.addr);
  } else if (inst.target !== undefined && typeof inst.target === 'number') {
    annotation = annotateAddr(inst.target);
  }

  // IY-relative references
  if (dasm.includes('iy') && inst.displacement !== undefined) {
    const iyAddr = 0xd00080 + inst.displacement;
    if (RAM_LABELS[iyAddr]) {
      annotation += `  ; IY+${hexByte(inst.displacement)} = ${RAM_LABELS[iyAddr]}`;
    }
  }

  console.log(`${hex(inst.pc)}  ${rawBytes.padEnd(20)} ${dasm}${annotation}`);
}

// Summary
console.log(`\n\n=== Summary ===`);
console.log(`Function start:  ${hex(START)}`);
console.log(`Function size:   ${lastPc - START} bytes (${instrCount} instructions)`);
console.log(`Disassembly end: ${hex(lastPc)}`);
console.log(`Gap to mask tbl: ${MASK_TABLE - lastPc} bytes (${hex(MASK_TABLE)} - ${hex(lastPc)})`);

console.log(`\nExternal CALLs (${calls.length}):`);
for (const c of calls) {
  console.log(`  ${hex(c.pc)} -> CALL ${c.conditional ? c.condition + ', ' : ''}${hex(c.target)}`);
}

console.log(`\nRAM references (${ramRefs.length}):`);
for (const r of ramRefs) {
  console.log(`  ${hex(r.pc)} -> ${hex(r.addr)} (${r.label})`);
}

console.log(`\nExit paths (${exitPaths.length}):`);
for (const e of exitPaths) {
  if (e.target !== undefined) {
    console.log(`  ${hex(e.pc)} -> ${e.type.toUpperCase()} ${hex(e.target)}`);
  } else {
    console.log(`  ${hex(e.pc)} -> ${e.type.toUpperCase()}${e.condition ? ' ' + e.condition : ''}`);
  }
}

// Also disassemble 0x0A2695 (main post-blit) for comparison
console.log(`\n\n=== Comparison: 0x0A2695 POST-BLIT main exit (first 50 bytes) ===\n`);
let cmpPc = 0x0A2695;
const cmpEnd = 0x0A2695 + 50;
while (cmpPc < cmpEnd) {
  const inst = decodeInstruction(rom, cmpPc, 'adl');
  const rawBytes = Array.from(
    rom.slice(inst.pc, inst.pc + inst.length),
    (v) => v.toString(16).padStart(2, '0')
  ).join(' ');
  const dasm = formatInstruction(inst);
  let annotation = '';
  if (inst.addr !== undefined) annotation = annotateAddr(inst.addr);
  else if (inst.target !== undefined && typeof inst.target === 'number') annotation = annotateAddr(inst.target);
  if (dasm.includes('iy') && inst.displacement !== undefined) {
    const iyAddr = 0xd00080 + inst.displacement;
    if (RAM_LABELS[iyAddr]) annotation += `  ; IY+${hexByte(inst.displacement)} = ${RAM_LABELS[iyAddr]}`;
  }
  console.log(`${hex(inst.pc)}  ${rawBytes.padEnd(20)} ${dasm}${annotation}`);
  cmpPc += inst.length;
  if (inst.tag === 'ret' || inst.tag === 'jp' || inst.tag === 'jp-hl') {
    const nextPc = inst.pc + inst.length;
    // Keep going if there's a conditional branch target here
    if (cmpPc <= cmpEnd) {
      // Simple: just stop at first unconditional exit for comparison
      break;
    }
  }
}

// Also show 0x0A26D6 (15B function from session 565)
console.log(`\n\n=== Context: 0x0A26D6 — 15B function (session 565) ===\n`);
let fn2Pc = 0x0A26D6;
const fn2End = 0x0A26D6 + 15;
while (fn2Pc < fn2End) {
  const inst = decodeInstruction(rom, fn2Pc, 'adl');
  const rawBytes = Array.from(
    rom.slice(inst.pc, inst.pc + inst.length),
    (v) => v.toString(16).padStart(2, '0')
  ).join(' ');
  const dasm = formatInstruction(inst);
  let annotation = '';
  if (inst.addr !== undefined) annotation = annotateAddr(inst.addr);
  else if (inst.target !== undefined && typeof inst.target === 'number') annotation = annotateAddr(inst.target);
  console.log(`${hex(inst.pc)}  ${rawBytes.padEnd(20)} ${dasm}${annotation}`);
  fn2Pc += inst.length;
  if (inst.tag === 'ret' || inst.tag === 'jp' || inst.tag === 'jp-hl') break;
}

// Raw bytes for verification
console.log(`\n\n=== Raw bytes ${hex(START)}..${hex(MASK_TABLE - 1)} ===`);
const rawSlice = rom.slice(START, MASK_TABLE);
const rawHex = Array.from(rawSlice, (v) => v.toString(16).padStart(2, '0'));
for (let i = 0; i < rawHex.length; i += 16) {
  const addr = START + i;
  const chunk = rawHex.slice(i, i + 16).join(' ');
  console.log(`${hex(addr)}  ${chunk}`);
}

// Analysis
console.log(`\n\n=== Analysis: 0x0A26C7 vs 0x0A2695 ===`);
console.log(`Entry conditions:`);
console.log(`  - Reached via JP 0x0A26C7 from 8bpp column blit (0x0A262B-0x0A2673)`);
console.log(`  - 8bpp path processes glyph data at 8 bits per pixel depth`);
console.log(`  - Main path (4bpp/16bpp) exits to 0x0A2695 instead`);
console.log(`\nKey question: does 0x0A26C7 rejoin 0x0A2695, or is it a completely`);
console.log(`separate cleanup path that returns independently?`);
console.log(`(Answer determined by the disassembly above)`);

console.log(`\nDone.`);
