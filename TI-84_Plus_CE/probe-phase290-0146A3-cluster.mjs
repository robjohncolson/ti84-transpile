#!/usr/bin/env node

/**
 * probe-phase290-0146A3-cluster.mjs
 *
 * Static disassembly of the region around 0x0146A3 containing 5 consecutive
 * CALL 0x0059E9 instructions. Extracts string literals pointed to by HL loads
 * before each CALL, finds function boundaries, and searches for xrefs.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rom = readFileSync(path.join(__dirname, 'ROM.rom'));

const ADL_MODE = 'adl';

// --- Helpers ---

function hex(value, width = 6) {
  return `0x${value.toString(16).toUpperCase().padStart(width, '0')}`;
}

function bytesStr(pc, length) {
  return Array.from(rom.slice(pc, pc + length), b =>
    b.toString(16).toUpperCase().padStart(2, '0')
  ).join(' ');
}

function formatInstruction(inst) {
  const prefix = inst.modePrefix ? `${inst.modePrefix} ` : '';
  const disp = (value) => (value >= 0 ? `+${value}` : `${value}`);

  let text = inst.tag;
  switch (inst.tag) {
    case 'nop': text = 'nop'; break;
    case 'halt': text = 'halt'; break;
    case 'di': text = 'di'; break;
    case 'ei': text = 'ei'; break;
    case 'ret': text = 'ret'; break;
    case 'reti': text = 'reti'; break;
    case 'ret-conditional': text = `ret ${inst.condition}`; break;
    case 'call': text = `call ${hex(inst.target)}`; break;
    case 'call-conditional': text = `call ${inst.condition}, ${hex(inst.target)}`; break;
    case 'jp': text = `jp ${hex(inst.target)}`; break;
    case 'jp-conditional': text = `jp ${inst.condition}, ${hex(inst.target)}`; break;
    case 'jp-hl': text = 'jp (hl)'; break;
    case 'jp-ix': text = 'jp (ix)'; break;
    case 'jp-iy': text = 'jp (iy)'; break;
    case 'jr': text = `jr ${hex(inst.target)}`; break;
    case 'jr-conditional': text = `jr ${inst.condition}, ${hex(inst.target)}`; break;
    case 'djnz': text = `djnz ${hex(inst.target)}`; break;
    case 'push': text = `push ${inst.pair}`; break;
    case 'pop': text = `pop ${inst.pair}`; break;
    case 'ex-de-hl': text = 'ex de, hl'; break;
    case 'ex-af': text = "ex af, af'"; break;
    case 'ex-sp-hl': text = 'ex (sp), hl'; break;
    case 'ld-pair-imm': text = `ld ${inst.pair}, ${hex(inst.value)}`; break;
    case 'ld-pair-mem':
      text = inst.direction === 'to-mem'
        ? `ld (${hex(inst.addr)}), ${inst.pair}`
        : `ld ${inst.pair}, (${hex(inst.addr)})`;
      break;
    case 'ld-reg-imm': text = `ld ${inst.dest}, ${hex(inst.value, 2)}`; break;
    case 'ld-reg-mem': text = `ld ${inst.dest}, (${hex(inst.addr)})`; break;
    case 'ld-mem-reg': text = `ld (${hex(inst.addr)}), ${inst.src}`; break;
    case 'ld-reg-ind': text = `ld ${inst.dest}, (${inst.src})`; break;
    case 'ld-ind-reg': text = `ld (${inst.dest}), ${inst.src}`; break;
    case 'ld-reg-reg': text = `ld ${inst.dest}, ${inst.src}`; break;
    case 'ld-pair-indexed': text = `ld ${inst.pair}, (${inst.indexRegister}${disp(inst.displacement)})`; break;
    case 'ld-special': text = `ld ${inst.dest}, ${inst.src}`; break;
    case 'inc-pair': text = `inc ${inst.pair}`; break;
    case 'dec-pair': text = `dec ${inst.pair}`; break;
    case 'inc-reg': text = `inc ${inst.reg}`; break;
    case 'dec-reg': text = `dec ${inst.reg}`; break;
    case 'add-pair': text = `add ${inst.dest}, ${inst.src}`; break;
    case 'adc-pair': text = `adc hl, ${inst.src}`; break;
    case 'sbc-pair': text = `sbc hl, ${inst.src}`; break;
    case 'alu-reg': text = `${inst.op} ${inst.src}`; break;
    case 'alu-imm': text = `${inst.op} ${hex(inst.value, 2)}`; break;
    case 'alu-indexed': text = `${inst.op} (${inst.indexRegister}${disp(inst.displacement)})`; break;
    case 'rotate-reg': text = `${inst.op} ${inst.reg}`; break;
    case 'bit-test': text = `bit ${inst.bit}, ${inst.reg}`; break;
    case 'bit-set': text = `set ${inst.bit}, ${inst.reg}`; break;
    case 'bit-reset': text = `res ${inst.bit}, ${inst.reg}`; break;
    case 'rst': text = `rst ${hex(inst.target, 2)}`; break;
    case 'ldir': text = 'ldir'; break;
    case 'lddr': text = 'lddr'; break;
    case 'cpir': text = 'cpir'; break;
    case 'cpdr': text = 'cpdr'; break;
    case 'ccf': text = 'ccf'; break;
    case 'scf': text = 'scf'; break;
    case 'cpl': text = 'cpl'; break;
    case 'rla': text = 'rla'; break;
    case 'rlca': text = 'rlca'; break;
    case 'rra': text = 'rra'; break;
    case 'rrca': text = 'rrca'; break;
    case 'daa': text = 'daa'; break;
    case 'neg': text = 'neg'; break;
    case 'im': text = `im ${inst.mode_val ?? inst.im_mode ?? '?'}`; break;
    case 'in': text = `in ${inst.dest}, (${inst.port !== undefined ? hex(inst.port, 2) : 'c'})`; break;
    case 'out': text = `out (${inst.port !== undefined ? hex(inst.port, 2) : 'c'}), ${inst.src}`; break;
    default: {
      const details = [];
      for (const [key, value] of Object.entries(inst)) {
        if (['pc', 'length', 'nextPc', 'tag', 'mode', 'modePrefix', 'fallthrough', 'terminates'].includes(key)) continue;
        details.push(`${key}=${typeof value === 'number' ? hex(value) : value}`);
      }
      text = details.length > 0 ? `${inst.tag} ${details.join(' ')}` : inst.tag;
      break;
    }
  }

  return `${prefix}${text}`;
}

function readNullTermString(addr) {
  let s = '';
  for (let i = addr; i < rom.length && rom[i] !== 0; i++) {
    const ch = rom[i];
    if (ch >= 0x20 && ch < 0x7F) {
      s += String.fromCharCode(ch);
    } else {
      s += `\\x${ch.toString(16).padStart(2, '0')}`;
    }
    if (s.length > 80) { s += '...'; break; }
  }
  return s;
}

function disasmRange(start, end) {
  const instructions = [];
  let pc = start;
  while (pc < end) {
    const inst = decodeInstruction(rom, pc, ADL_MODE);
    if (!inst || !inst.length) {
      instructions.push({ pc, tag: 'db', raw: rom[pc], length: 1 });
      pc++;
    } else {
      instructions.push(inst);
      pc += inst.length;
    }
  }
  return instructions;
}

function printInst(inst) {
  const bytes = bytesStr(inst.pc, inst.length);
  const asm = inst.tag === 'db'
    ? `db ${hex(inst.raw, 2)}`
    : formatInstruction(inst);
  console.log(`  ${hex(inst.pc)}  ${bytes.padEnd(18)}  ${asm}`);
}

// --- 1. Static disassembly of 0x014680 - 0x014720 ---

console.log('=== DISASSEMBLY: 0x014680 - 0x014720 ===\n');

const DISASM_START = 0x014680;
const DISASM_END = 0x014720;

const instructions = disasmRange(DISASM_START, DISASM_END);
for (const inst of instructions) {
  printInst(inst);
}

// --- 2. Extract string literals from HL loads before CALL 0x0059E9 ---

console.log('\n=== STRING LITERALS (HL loads before CALL 0x0059E9) ===\n');

const callSites = [0x0146A3, 0x0146B1, 0x0146BF, 0x0146CD, 0x0146DB];

for (const callAddr of callSites) {
  // Find the LD HL (ld-pair-imm with pair=hl) before this CALL in our instruction list
  let hlAddr = null;
  for (const inst of instructions) {
    if (inst.pc >= callAddr) break;
    if (inst.pc >= callAddr - 20 && inst.pc < callAddr && inst.tag === 'ld-pair-imm' && inst.pair === 'hl') {
      hlAddr = inst.value;
    }
  }

  if (hlAddr !== null) {
    const str = readNullTermString(hlAddr);
    console.log(`  CALL at ${hex(callAddr)} <- LD HL,${hex(hlAddr)} -> "${str}"`);
  } else {
    console.log(`  CALL at ${hex(callAddr)} <- (no HL load found in preceding instructions)`);
  }
}

// --- 3. Find function boundaries ---

console.log('\n=== FUNCTION BOUNDARIES ===\n');

// Search backward from 0x014680 for RET (0xC9) byte marking end of previous function
let scanEntry = DISASM_START;
for (let addr = DISASM_START - 1; addr >= DISASM_START - 0x200; addr--) {
  const byte = rom[addr];
  if (byte === 0xC9) {
    // Verify it decodes as RET at this address
    const inst = decodeInstruction(rom, addr, ADL_MODE);
    if (inst && inst.tag === 'ret') {
      scanEntry = addr + 1;
      console.log(`  Previous function ends with ret at ${hex(addr)}`);
      console.log(`  Entry point: ${hex(scanEntry)}`);
      break;
    }
  }
}

// Search forward past 0x0146E0 for function end (RET or unconditional JP)
const SEARCH_END = 0x014800;
let funcEnd = null;
let pc = 0x0146DF; // just after the last CALL
while (pc < SEARCH_END) {
  const inst = decodeInstruction(rom, pc, ADL_MODE);
  if (!inst || !inst.length) { pc++; continue; }
  if (inst.tag === 'ret' || inst.tag === 'jp') {
    funcEnd = inst.pc + inst.length;
    console.log(`  Function ends with ${formatInstruction(inst)} at ${hex(inst.pc)}`);
    console.log(`  End address: ${hex(funcEnd)}`);
    break;
  }
  pc += inst.length;
}

if (!funcEnd) {
  console.log(`  No clear RET/JP found before ${hex(SEARCH_END)}`);
  funcEnd = SEARCH_END;
}

// Extended disassembly if entry is before our original start
if (scanEntry < DISASM_START) {
  console.log(`\n  --- Preamble (${hex(scanEntry)} to ${hex(DISASM_START)}) ---`);
  const preInsts = disasmRange(scanEntry, DISASM_START);
  for (const inst of preInsts) { printInst(inst); }
}

// Extended disassembly past our original end
if (funcEnd > DISASM_END) {
  console.log(`\n  --- Tail (${hex(DISASM_END)} to ${hex(funcEnd)}) ---`);
  const postInsts = disasmRange(DISASM_END, funcEnd);
  for (const inst of postInsts) { printInst(inst); }
}

// --- 4. Search ROM for CALL/JP to the function entry point ---

console.log(`\n=== XREFS: CALL/JP to ${hex(scanEntry)} ===\n`);

// In ADL mode: CALL nn = 0xCD + 3-byte LE addr, JP nn = 0xC3 + 3-byte LE addr
const targetLo = scanEntry & 0xFF;
const targetMid = (scanEntry >> 8) & 0xFF;
const targetHi = (scanEntry >> 16) & 0xFF;

let xrefCount = 0;
for (let addr = 0; addr < rom.length - 3; addr++) {
  const opcode = rom[addr];
  if ((opcode === 0xCD || opcode === 0xC3) &&
      rom[addr + 1] === targetLo &&
      rom[addr + 2] === targetMid &&
      rom[addr + 3] === targetHi) {
    const type = opcode === 0xCD ? 'CALL' : 'JP  ';
    console.log(`  ${hex(addr)}  ${type} ${hex(scanEntry)}`);
    xrefCount++;
  }
}

if (xrefCount === 0) {
  console.log('  (none found)');
}
console.log(`\n  Total xrefs: ${xrefCount}`);

console.log('\n=== DONE ===');
