#!/usr/bin/env node
// Decode 0x0021C2 — Syscall target from 0x000138
// Session 567 discovered that 0x055743 (BPP-aware geometry loader) calls
// 0x000138 (syscall vector) which dispatches to 0x0021C2. Purpose unknown —
// likely app/context validation.
//
// This probe first disassembles 0x000138 to confirm the JP target,
// then disassembles 0x0021C2 to decode the full function.

import { readFileSync } from 'fs';
import { decodeInstruction } from './ez80-decoder.js';

const rom = readFileSync(new URL('./ROM.rom', import.meta.url));

const SYSCALL_VECTOR = 0x000138;
const START = 0x0021C2;
const MAX_BYTES = 256;

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
  0xd0231a: 'tokenCursor',
  0xd0265b: 'appValidatorAbortCount',
};

function annotateAddr(addr) {
  if (RAM_LABELS[addr]) return `  ; ${RAM_LABELS[addr]}`;
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

// ===================================================================
// Part 1: Disassemble syscall vector at 0x000138
// ===================================================================
console.log(`=== Part 1: Syscall vector at ${hex(SYSCALL_VECTOR)} ===\n`);

let pc = SYSCALL_VECTOR;
for (let i = 0; i < 3; i++) {
  const inst = decodeInstruction(rom, pc, 'adl');
  const rawBytes = Array.from(
    rom.slice(inst.pc, inst.pc + inst.length),
    (v) => v.toString(16).padStart(2, '0')
  ).join(' ');
  const dasm = formatInstruction(inst);
  console.log(`${hex(inst.pc)}  ${rawBytes.padEnd(20)} ${dasm}`);
  pc += inst.length;

  // If it's a JP, we found the target
  if (inst.tag === 'jp') {
    console.log(`\n  -> Syscall 0x000138 dispatches to ${hex(inst.target)}`);
    if (inst.target !== START) {
      console.log(`  NOTE: Actual target is ${hex(inst.target)}, not the expected ${hex(START)}`);
      console.log(`  Will disassemble actual target instead.`);
    } else {
      console.log(`  CONFIRMED: Target matches expected 0x0021C2`);
    }
    break;
  }
}

// ===================================================================
// Part 2: Disassemble the handler at 0x0021C2
// ===================================================================
console.log(`\n\n=== Part 2: Disassembly of ${hex(START)} — Syscall 0x000138 handler ===\n`);

// Collect external calls, RAM refs, exit paths
const calls = [];
const ramRefs = [];
const exitPaths = [];
const condBranchTargets = new Set();
const iyRefs = [];

// First pass: disassemble until unconditional exit, collecting branch targets
pc = START;
const endPc = START + MAX_BYTES;
let instrCount = 0;
let lastPc = START;
const instructions = [];

while (pc < endPc) {
  const inst = decodeInstruction(rom, pc, 'adl');

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

  // Track IY-relative references
  if (inst.indexRegister === 'iy' && inst.displacement !== undefined) {
    const iyAddr = 0xd00080 + inst.displacement;
    iyRefs.push({ pc: inst.pc, displacement: inst.displacement, addr: iyAddr, label: RAM_LABELS[iyAddr] || `IY+${hexByte(inst.displacement)}` });
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
  // targets an address past us (meaning there's a fall-through path)
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
    } else {
      annotation += `  ; IY+${hexByte(inst.displacement)} = ${hex(iyAddr)}`;
    }
  }

  console.log(`${hex(inst.pc)}  ${rawBytes.padEnd(20)} ${dasm}${annotation}`);
}

// Summary
console.log(`\n\n=== Summary ===`);
console.log(`Function start:  ${hex(START)}`);
console.log(`Function size:   ${lastPc - START} bytes (${instrCount} instructions)`);
console.log(`Disassembly end: ${hex(lastPc)}`);

console.log(`\nExternal CALLs (${calls.length}):`);
for (const c of calls) {
  console.log(`  ${hex(c.pc)} -> CALL ${c.conditional ? c.condition + ', ' : ''}${hex(c.target)}`);
}

console.log(`\nRAM references (${ramRefs.length}):`);
for (const r of ramRefs) {
  console.log(`  ${hex(r.pc)} -> ${hex(r.addr)} (${r.label})`);
}

console.log(`\nIY-relative references (${iyRefs.length}):`);
for (const r of iyRefs) {
  console.log(`  ${hex(r.pc)} -> IY+${hexByte(r.displacement)} = ${hex(r.addr)} (${r.label})`);
}

console.log(`\nExit paths (${exitPaths.length}):`);
for (const e of exitPaths) {
  if (e.target !== undefined) {
    console.log(`  ${hex(e.pc)} -> ${e.type.toUpperCase()} ${hex(e.target)}`);
  } else {
    console.log(`  ${hex(e.pc)} -> ${e.type.toUpperCase()}${e.condition ? ' ' + e.condition : ''}`);
  }
}

// ===================================================================
// Part 3: Context — disassemble bytes around the function
// ===================================================================
console.log(`\n\n=== Context: 16 bytes before ${hex(START)} ===\n`);
let ctxPc = START - 16;
while (ctxPc < START) {
  const inst = decodeInstruction(rom, ctxPc, 'adl');
  const rawBytes = Array.from(
    rom.slice(inst.pc, inst.pc + inst.length),
    (v) => v.toString(16).padStart(2, '0')
  ).join(' ');
  const dasm = formatInstruction(inst);
  console.log(`${hex(inst.pc)}  ${rawBytes.padEnd(20)} ${dasm}`);
  ctxPc += inst.length;
}

// Also check the nearby syscall vectors for context
console.log(`\n\n=== Context: Nearby syscall vectors (0x000130-0x000148) ===\n`);
ctxPc = 0x000130;
while (ctxPc < 0x000148) {
  const inst = decodeInstruction(rom, ctxPc, 'adl');
  const rawBytes = Array.from(
    rom.slice(inst.pc, inst.pc + inst.length),
    (v) => v.toString(16).padStart(2, '0')
  ).join(' ');
  const dasm = formatInstruction(inst);
  console.log(`${hex(inst.pc)}  ${rawBytes.padEnd(20)} ${dasm}`);
  ctxPc += inst.length;
}

// ===================================================================
// Part 4: If handler is short, disassemble subroutines it calls
// ===================================================================
if (calls.length > 0) {
  console.log(`\n\n=== Part 4: Disassemble first-level subroutines ===\n`);
  for (const c of calls) {
    if (c.target < 0x400000) {
      console.log(`--- Subroutine at ${hex(c.target)} (called from ${hex(c.pc)}) ---\n`);
      let subPc = c.target;
      const subEnd = c.target + 128;
      const subCondTargets = new Set();
      while (subPc < subEnd) {
        const inst = decodeInstruction(rom, subPc, 'adl');
        const rawBytes = Array.from(
          rom.slice(inst.pc, inst.pc + inst.length),
          (v) => v.toString(16).padStart(2, '0')
        ).join(' ');
        const dasm = formatInstruction(inst);

        let annotation = '';
        if (inst.addr !== undefined) {
          annotation = annotateAddr(inst.addr);
        } else if (inst.target !== undefined && typeof inst.target === 'number') {
          annotation = annotateAddr(inst.target);
        }
        if (dasm.includes('iy') && inst.displacement !== undefined) {
          const iyAddr = 0xd00080 + inst.displacement;
          if (RAM_LABELS[iyAddr]) {
            annotation += `  ; IY+${hexByte(inst.displacement)} = ${RAM_LABELS[iyAddr]}`;
          } else {
            annotation += `  ; IY+${hexByte(inst.displacement)} = ${hex(iyAddr)}`;
          }
        }

        console.log(`${hex(inst.pc)}  ${rawBytes.padEnd(20)} ${dasm}${annotation}`);

        if (inst.tag === 'jr-conditional' || inst.tag === 'jp-conditional') {
          subCondTargets.add(inst.target);
        }

        subPc += inst.length;

        if (inst.tag === 'ret' || inst.tag === 'jp' || inst.tag === 'jp-hl' || inst.tag === 'jp-index') {
          const nextPc = inst.pc + inst.length;
          if (!subCondTargets.has(nextPc)) {
            break;
          }
          console.log(`  (conditional branch targets ${hex(nextPc)}, continuing)\n`);
        }
      }
      console.log('');
    }
  }
}

console.log(`\nDone.`);
