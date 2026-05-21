#!/usr/bin/env node

/**
 * Phase 391 — Trace 0x08C308 (LCD Mode Selector)
 *
 * Session 390 found VRAM rectangle-fill at 0x09EF44 calls 0x08C308 to
 * determine 8bpp vs 16bpp LCD mode. This probe:
 *   1. Statically disassembles 0x08C308 using the eZ80 decoder
 *   2. Identifies what port or RAM address it reads
 *   3. Determines return value meaning
 *   4. Finds all callers (CALL/JP to 0x08C308)
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romPath = path.join(__dirname, 'ROM.rom');
const romBytes = new Uint8Array(readFileSync(romPath).buffer);

const TARGET = 0x08C308;

function hex(v, w = 6) {
  return `0x${(v >>> 0).toString(16).padStart(w, '0')}`;
}

function hexByte(v) {
  return `0x${(v & 0xff).toString(16).padStart(2, '0')}`;
}

// ── Comprehensive instruction formatter ──────────────────────────────
function fmt(inst) {
  const prefix = inst.modePrefix ? `${inst.modePrefix} ` : '';
  const t = inst.tag;

  // Returns
  if (t === 'ret') return `${prefix}ret`;
  if (t === 'ret-conditional') return `${prefix}ret ${inst.condition}`;
  if (t === 'reti') return `${prefix}reti`;
  if (t === 'retn') return `${prefix}retn`;

  // Calls and jumps
  if (t === 'call') return `${prefix}call ${hex(inst.target)}`;
  if (t === 'call-conditional') return `${prefix}call ${inst.condition}, ${hex(inst.target)}`;
  if (t === 'jp') return `${prefix}jp ${hex(inst.target)}`;
  if (t === 'jp-conditional') return `${prefix}jp ${inst.condition}, ${hex(inst.target)}`;
  if (t === 'jp-hl') return `${prefix}jp (hl)`;
  if (t === 'jp-index') return `${prefix}jp (${inst.indexRegister})`;
  if (t === 'jr') return `${prefix}jr ${hex(inst.target)}`;
  if (t === 'jr-conditional') return `${prefix}jr ${inst.condition}, ${hex(inst.target)}`;
  if (t === 'djnz') return `${prefix}djnz ${hex(inst.target)}`;
  if (t === 'rst') return `${prefix}rst ${hexByte(inst.target)}`;

  // Loads
  if (t === 'ld-reg-reg') return `${prefix}ld ${inst.dest}, ${inst.src}`;
  if (t === 'ld-reg-imm') return `${prefix}ld ${inst.dest}, ${hexByte(inst.value)}`;
  if (t === 'ld-reg-ind') return `${prefix}ld ${inst.dest}, (${inst.src})`;
  if (t === 'ld-ind-reg') return `${prefix}ld (${inst.dest}), ${inst.src}`;
  if (t === 'ld-reg-mem') return `${prefix}ld ${inst.dest}, (${hex(inst.addr)})`;
  if (t === 'ld-mem-reg') return `${prefix}ld (${hex(inst.addr)}), ${inst.src}`;
  if (t === 'ld-pair-imm') return `${prefix}ld ${inst.pair}, ${hex(inst.value)}`;
  if (t === 'ld-pair-mem') return `${prefix}ld ${inst.pair}, (${hex(inst.addr)})`;
  if (t === 'ld-mem-pair') return `${prefix}ld (${hex(inst.addr)}), ${inst.pair}`;
  if (t === 'ld-sp-hl') return `${prefix}ld sp, hl`;
  if (t === 'ld-sp-index') return `${prefix}ld sp, ${inst.indexRegister}`;
  if (t === 'ld-pair-ind') return `${prefix}ld (${inst.pair}), ${inst.src || 'hl'}`;
  if (t === 'ld-ind-pair') return `${prefix}ld ${inst.dest || 'hl'}, (${inst.pair})`;
  if (t === 'ld-ind-imm') return `${prefix}ld (hl), ${hexByte(inst.value)}`;
  if (t === 'ld-mem-a') return `${prefix}ld (${hex(inst.addr)}), a`;
  if (t === 'ld-a-mem') return `${prefix}ld a, (${hex(inst.addr)})`;
  if (t === 'ld-a-ind') return `${prefix}ld a, (${inst.pair})`;
  if (t === 'ld-ind-a') return `${prefix}ld (${inst.pair}), a`;

  // Index register loads
  if (t === 'ld-index-imm') return `${prefix}ld ${inst.indexRegister}, ${hex(inst.value)}`;
  if (t === 'ld-index-mem') return `${prefix}ld ${inst.indexRegister}, (${hex(inst.addr)})`;
  if (t === 'ld-mem-index') return `${prefix}ld (${hex(inst.addr)}), ${inst.indexRegister}`;
  if (t === 'ld-indexed-reg') return `${prefix}ld (${inst.indexRegister}+${inst.displacement}), ${inst.src}`;
  if (t === 'ld-reg-indexed') return `${prefix}ld ${inst.dest}, (${inst.indexRegister}+${inst.displacement})`;
  if (t === 'ld-indexed-imm') return `${prefix}ld (${inst.indexRegister}+${inst.displacement}), ${hexByte(inst.value)}`;
  if (t === 'ld-index-pair') return `${prefix}ld ${inst.indexRegister}, ${inst.pair || '??'}`;

  // ALU
  if (t === 'alu-reg') return `${prefix}${inst.op} a, ${inst.src}`;
  if (t === 'alu-imm') return `${prefix}${inst.op} a, ${hexByte(inst.value)}`;
  if (t === 'alu-ind') return `${prefix}${inst.op} a, (hl)`;
  if (t === 'alu-indexed') return `${prefix}${inst.op} a, (${inst.indexRegister}+${inst.displacement})`;
  if (t === 'inc-reg') return `${prefix}inc ${inst.reg}`;
  if (t === 'dec-reg') return `${prefix}dec ${inst.reg}`;
  if (t === 'inc-pair') return `${prefix}inc ${inst.pair}`;
  if (t === 'dec-pair') return `${prefix}dec ${inst.pair}`;
  if (t === 'inc-ind') return `${prefix}inc (hl)`;
  if (t === 'dec-ind') return `${prefix}dec (hl)`;
  if (t === 'inc-index') return `${prefix}inc ${inst.indexRegister}`;
  if (t === 'dec-index') return `${prefix}dec ${inst.indexRegister}`;
  if (t === 'inc-indexed') return `${prefix}inc (${inst.indexRegister}+${inst.displacement})`;
  if (t === 'dec-indexed') return `${prefix}dec (${inst.indexRegister}+${inst.displacement})`;
  if (t === 'add-pair') return `${prefix}add hl, ${inst.src}`;
  if (t === 'adc-pair') return `${prefix}adc hl, ${inst.src}`;
  if (t === 'sbc-pair') return `${prefix}sbc hl, ${inst.src}`;
  if (t === 'add-index-pair') return `${prefix}add ${inst.indexRegister}, ${inst.src}`;
  if (t === 'neg') return `${prefix}neg`;

  // Bit ops
  if (t === 'bit-test') return `${prefix}bit ${inst.bit}, ${inst.reg}`;
  if (t === 'bit-test-ind') return `${prefix}bit ${inst.bit}, (hl)`;
  if (t === 'bit-set') return `${prefix}set ${inst.bit}, ${inst.reg}`;
  if (t === 'bit-set-ind') return `${prefix}set ${inst.bit}, (hl)`;
  if (t === 'bit-res') return `${prefix}res ${inst.bit}, ${inst.reg}`;
  if (t === 'bit-res-ind') return `${prefix}res ${inst.bit}, (hl)`;
  if (t === 'indexed-cb-bit') return `${prefix}bit ${inst.bit}, (${inst.indexRegister}+${inst.displacement})`;
  if (t === 'indexed-cb-set') return `${prefix}set ${inst.bit}, (${inst.indexRegister}+${inst.displacement})`;
  if (t === 'indexed-cb-res') return `${prefix}res ${inst.bit}, (${inst.indexRegister}+${inst.displacement})`;
  if (t === 'indexed-cb-rotate') return `${prefix}${inst.op} (${inst.indexRegister}+${inst.displacement})`;

  // Rotates / shifts
  if (t === 'rotate-reg') return `${prefix}${inst.op} ${inst.reg}`;
  if (t === 'rotate-ind') return `${prefix}${inst.op} (hl)`;
  if (t === 'rlca') return `${prefix}rlca`;
  if (t === 'rrca') return `${prefix}rrca`;
  if (t === 'rla') return `${prefix}rla`;
  if (t === 'rra') return `${prefix}rra`;
  if (t === 'rld') return `${prefix}rld`;
  if (t === 'rrd') return `${prefix}rrd`;

  // Stack
  if (t === 'push') return `${prefix}push ${inst.pair}`;
  if (t === 'pop') return `${prefix}pop ${inst.pair}`;
  if (t === 'push-index') return `${prefix}push ${inst.indexRegister}`;
  if (t === 'pop-index') return `${prefix}pop ${inst.indexRegister}`;
  if (t === 'ex-sp-hl') return `${prefix}ex (sp), hl`;
  if (t === 'ex-sp-index') return `${prefix}ex (sp), ${inst.indexRegister}`;

  // Exchange
  if (t === 'ex-de-hl') return `${prefix}ex de, hl`;
  if (t === 'ex-af') return `${prefix}ex af, af'`;
  if (t === 'exx') return `${prefix}exx`;

  // I/O
  if (t === 'in-reg-c') return `${prefix}in ${inst.reg}, (c)`;
  if (t === 'out-c-reg') return `${prefix}out (c), ${inst.reg}`;
  if (t === 'in-a-imm') return `${prefix}in a, (${hexByte(inst.port)})`;
  if (t === 'out-imm-a') return `${prefix}out (${hexByte(inst.port)}), a`;
  if (t === 'ini') return `${prefix}ini`;
  if (t === 'ind') return `${prefix}ind`;
  if (t === 'inir') return `${prefix}inir`;
  if (t === 'indr') return `${prefix}indr`;
  if (t === 'outi') return `${prefix}outi`;
  if (t === 'outd') return `${prefix}outd`;
  if (t === 'otir') return `${prefix}otir`;
  if (t === 'otdr') return `${prefix}otdr`;
  if (t === 'in0') return `${prefix}in0 ${inst.reg}, (${hexByte(inst.port)})`;
  if (t === 'out0') return `${prefix}out0 (${hexByte(inst.port)}), ${inst.reg}`;

  // Block transfer / search
  if (t === 'ldi') return `${prefix}ldi`;
  if (t === 'ldir') return `${prefix}ldir`;
  if (t === 'ldd') return `${prefix}ldd`;
  if (t === 'lddr') return `${prefix}lddr`;
  if (t === 'cpi') return `${prefix}cpi`;
  if (t === 'cpir') return `${prefix}cpir`;
  if (t === 'cpd') return `${prefix}cpd`;
  if (t === 'cpdr') return `${prefix}cpdr`;

  // Misc
  if (t === 'nop') return `${prefix}nop`;
  if (t === 'halt') return `${prefix}halt`;
  if (t === 'di') return `${prefix}di`;
  if (t === 'ei') return `${prefix}ei`;
  if (t === 'im') return `${prefix}im ${inst.mode}`;
  if (t === 'scf') return `${prefix}scf`;
  if (t === 'ccf') return `${prefix}ccf`;
  if (t === 'cpl') return `${prefix}cpl`;
  if (t === 'daa') return `${prefix}daa`;
  if (t === 'ld-i-a') return `${prefix}ld i, a`;
  if (t === 'ld-a-i') return `${prefix}ld a, i`;
  if (t === 'ld-r-a') return `${prefix}ld r, a`;
  if (t === 'ld-a-r') return `${prefix}ld a, r`;
  if (t === 'ld-mb-a') return `${prefix}ld mb, a`;
  if (t === 'ld-a-mb') return `${prefix}ld a, mb`;
  if (t === 'stmix') return `${prefix}stmix`;
  if (t === 'rsmix') return `${prefix}rsmix`;
  if (t === 'slp') return `${prefix}slp`;
  if (t === 'tst-a-reg') return `${prefix}tst a, ${inst.reg}`;
  if (t === 'tst-a-imm') return `${prefix}tst a, ${hexByte(inst.value)}`;
  if (t === 'tstio') return `${prefix}tstio ${hexByte(inst.value)}`;
  if (t === 'mlt') return `${prefix}mlt ${inst.pair}`;

  // Fallback: show tag + all fields
  const keys = Object.keys(inst).filter(k => !['pc', 'length', 'nextPc', 'mode', 'modePrefix', 'tag'].includes(k));
  const extra = keys.map(k => `${k}=${JSON.stringify(inst[k])}`).join(' ');
  return `${prefix}${t}${extra ? ' ' + extra : ''}`;
}

// ── Raw bytes hex dump ───────────────────────────────────────────────
function rawHex(pc, len) {
  const bytes = [];
  for (let i = 0; i < len; i++) {
    bytes.push(romBytes[pc + i].toString(16).padStart(2, '0'));
  }
  return bytes.join(' ');
}

// ── 1. Static disassembly of 0x08C308 ───────────────────────────────
console.log('=== Phase 391: Trace 0x08C308 (LCD Mode Selector) ===\n');
console.log('--- 1. Static Disassembly from 0x08C308 ---\n');

let pc = TARGET;
const instructions = [];
let hitRet = false;

for (let i = 0; i < 80 && !hitRet; i++) {
  const inst = decodeInstruction(romBytes, pc, 'adl');
  const raw = rawHex(pc, inst.length);
  const asm = fmt(inst);
  console.log(`  ${hex(pc)}: ${raw.padEnd(20)} ${asm}`);
  instructions.push(inst);

  if (inst.tag === 'ret' || inst.tag === 'reti' || inst.tag === 'retn') {
    hitRet = true;
  }
  // Also stop at unconditional JP (not JP (hl))
  if (inst.tag === 'jp') {
    hitRet = true;
  }

  pc = inst.nextPc;
}

// ── 2. Identify port / RAM reads ─────────────────────────────────────
console.log('\n--- 2. Port and RAM Reads ---\n');

const portReads = [];
const memReads = [];
const memWrites = [];

for (const inst of instructions) {
  const t = inst.tag;

  // I/O port reads
  if (t === 'in-reg-c' || t === 'in-a-imm' || t === 'in0' || t === 'ini' || t === 'inir') {
    portReads.push({ pc: inst.pc, inst: fmt(inst), tag: t });
  }

  // Memory reads via absolute address
  if (t === 'ld-reg-mem' || t === 'ld-a-mem' || t === 'ld-pair-mem' || t === 'ld-index-mem') {
    memReads.push({ pc: inst.pc, addr: inst.addr, inst: fmt(inst) });
  }

  // Memory writes via absolute address
  if (t === 'ld-mem-reg' || t === 'ld-mem-a' || t === 'ld-mem-pair' || t === 'ld-mem-index') {
    memWrites.push({ pc: inst.pc, addr: inst.addr, inst: fmt(inst) });
  }
}

if (portReads.length === 0) {
  console.log('  No direct IN instructions found in this function.');
} else {
  for (const r of portReads) {
    console.log(`  Port read at ${hex(r.pc)}: ${r.inst}`);
  }
}

if (memReads.length === 0) {
  console.log('  No absolute memory reads found (may use indirect via HL/IX/IY).');
} else {
  for (const r of memReads) {
    console.log(`  Memory read at ${hex(r.pc)}: ${r.inst}  (addr=${hex(r.addr)})`);
  }
}

if (memWrites.length > 0) {
  for (const w of memWrites) {
    console.log(`  Memory write at ${hex(w.pc)}: ${w.inst}  (addr=${hex(w.addr)})`);
  }
}

// Also flag indirect memory reads (LD reg, (HL/IX/IY))
const indirectReads = instructions.filter(i =>
  i.tag === 'ld-reg-ind' || i.tag === 'ld-a-ind' || i.tag === 'ld-reg-indexed' || i.tag === 'ld-ind-pair'
);
if (indirectReads.length > 0) {
  console.log('\n  Indirect memory reads:');
  for (const inst of indirectReads) {
    console.log(`    ${hex(inst.pc)}: ${fmt(inst)}`);
  }
}

// ── 3. Return value analysis ─────────────────────────────────────────
console.log('\n--- 3. Return Value Analysis ---\n');

// Look at what register is loaded/modified just before RET
// and any conditional branches
const branches = instructions.filter(i =>
  i.tag === 'jr-conditional' || i.tag === 'jp-conditional' || i.tag === 'ret-conditional'
);
if (branches.length > 0) {
  console.log('  Conditional branches in this function:');
  for (const b of branches) {
    console.log(`    ${hex(b.pc)}: ${fmt(b)}`);
  }
}

// Find what happens to A register near returns
const retIdx = instructions.findIndex(i => i.tag === 'ret' || i.tag === 'jp');
if (retIdx >= 0) {
  console.log(`\n  Return/exit at ${hex(instructions[retIdx].pc)}: ${fmt(instructions[retIdx])}`);
  // Show the last few instructions before return
  const contextStart = Math.max(0, retIdx - 5);
  console.log('  Instructions leading to return:');
  for (let i = contextStart; i <= retIdx; i++) {
    console.log(`    ${hex(instructions[i].pc)}: ${fmt(instructions[i])}`);
  }
}

// ── 4. Find all callers ──────────────────────────────────────────────
console.log('\n--- 4. All Callers (CALL/JP to 0x08C308) ---\n');

// In ADL mode (24-bit), CALL nn = CD lo mid hi, JP nn = C3 lo mid hi
// Target 0x08C308: lo=0x08, mid=0xC3, hi=0x08
const targetLo = TARGET & 0xFF;         // 0x08
const targetMid = (TARGET >> 8) & 0xFF; // 0xC3
const targetHi = (TARGET >> 16) & 0xFF; // 0x08

const callers = [];

for (let i = 0; i < romBytes.length - 3; i++) {
  const opcode = romBytes[i];
  // CALL nn (CD) or JP nn (C3)
  if (opcode === 0xCD || opcode === 0xC3) {
    if (romBytes[i + 1] === targetLo &&
        romBytes[i + 2] === targetMid &&
        romBytes[i + 3] === targetHi) {
      const type = opcode === 0xCD ? 'CALL' : 'JP';
      callers.push({ addr: i, type });
    }
  }
  // Conditional calls: C4 CC D4 DC E4 EC F4 FC
  // Conditional jumps: C2 CA D2 DA E2 EA F2 FA
  if ((opcode & 0xC7) === 0xC4 || (opcode & 0xC7) === 0xC2) {
    if (romBytes[i + 1] === targetLo &&
        romBytes[i + 2] === targetMid &&
        romBytes[i + 3] === targetHi) {
      // Decode to get condition
      const inst = decodeInstruction(romBytes, i, 'adl');
      callers.push({ addr: i, type: fmt(inst) });
    }
  }
}

// Also check with mode prefix bytes (0x40, 0x49, 0x52, 0x5B) before the opcode
const modePrefixes = [0x40, 0x49, 0x52, 0x5B];
for (let i = 0; i < romBytes.length - 4; i++) {
  if (modePrefixes.includes(romBytes[i])) {
    const opcode = romBytes[i + 1];
    if (opcode === 0xCD || opcode === 0xC3 ||
        (opcode & 0xC7) === 0xC4 || (opcode & 0xC7) === 0xC2) {
      if (romBytes[i + 2] === targetLo &&
          romBytes[i + 3] === targetMid &&
          romBytes[i + 4] === targetHi) {
        const inst = decodeInstruction(romBytes, i, 'adl');
        // Avoid duplicates with the non-prefix scan
        if (!callers.some(c => c.addr === i)) {
          callers.push({ addr: i, type: `(prefixed) ${fmt(inst)}` });
        }
      }
    }
  }
}

console.log(`  Found ${callers.length} caller(s):\n`);
for (const c of callers) {
  // Show a few instructions of context around the caller
  console.log(`  ${hex(c.addr)}: ${c.type}`);

  // Decode 3 instructions before and 3 after for context
  // Find approximate start (go back ~12 bytes)
  let contextPc = Math.max(0, c.addr - 12);
  const contextEnd = c.addr + 8;
  const contextInsts = [];
  while (contextPc < contextEnd && contextInsts.length < 8) {
    const inst = decodeInstruction(romBytes, contextPc, 'adl');
    contextInsts.push(inst);
    contextPc = inst.nextPc;
  }
  for (const inst of contextInsts) {
    const marker = inst.pc === c.addr ? ' >>>' : '    ';
    console.log(`${marker} ${hex(inst.pc)}: ${fmt(inst)}`);
  }
  console.log();
}

// ── Summary ──────────────────────────────────────────────────────────
console.log('--- Summary ---\n');
console.log(`  Function at ${hex(TARGET)} is ${pc - TARGET} bytes long (${instructions.length} instructions)`);
console.log(`  Port reads: ${portReads.length}`);
console.log(`  Absolute memory reads: ${memReads.length}`);
console.log(`  Indirect memory reads: ${indirectReads.length}`);
console.log(`  Absolute memory writes: ${memWrites.length}`);
console.log(`  Callers found: ${callers.length}`);
