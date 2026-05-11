#!/usr/bin/env node

/**
 * probe-phase290-0015xx-callers.mjs
 *
 * Disassemble context around each site that references 0x0059E9,
 * find the 0x0015xx function start, extract string literals loaded
 * into HL before CALL 0x0059E9, and classify each caller.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rom = fs.readFileSync(path.join(__dirname, 'ROM.rom'));

// --- Formatting helpers ---

const hex = (value, width = 6) =>
  value === undefined || value === null
    ? 'n/a'
    : `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;

const byteHex = (value) => hex(value, 2);
const wordHex = (value) => hex(value, 4);

function decodePrefix(modePrefix) {
  if (!modePrefix) return '';
  return `.${modePrefix} `;
}

function formatSignedDisplacement(value) {
  return value >= 0 ? `+${value}` : `${value}`;
}

function formatIndexed(indexRegister, displacement) {
  return `(${indexRegister}${formatSignedDisplacement(displacement)})`;
}

function formatTarget(value) {
  if (value <= 0xff) return byteHex(value);
  if (value <= 0xffff) return wordHex(value);
  return hex(value);
}

function formatAlu(op, rhs) {
  if (op === 'cp' || op === 'and' || op === 'or' || op === 'xor' || op === 'sub') {
    return `${op} ${rhs}`;
  }
  return `${op} a, ${rhs}`;
}

function formatInstruction(instr) {
  const prefix = decodePrefix(instr.modePrefix);

  switch (instr.tag) {
    case 'indexed-cb-bit':
      return `${prefix}bit ${instr.bit}, ${formatIndexed(instr.indexRegister, instr.displacement)}`;
    case 'indexed-cb-res':
      return `${prefix}res ${instr.bit}, ${formatIndexed(instr.indexRegister, instr.displacement)}`;
    case 'indexed-cb-set':
      return `${prefix}set ${instr.bit}, ${formatIndexed(instr.indexRegister, instr.displacement)}`;
    case 'indexed-cb-rotate':
      return `${prefix}${instr.operation} ${formatIndexed(instr.indexRegister, instr.displacement)}`;
    case 'rotate-reg':
      return `${prefix}${instr.op} ${instr.reg}`;
    case 'rotate-ind':
      return `${prefix}${instr.op} (${instr.indirectRegister})`;
    case 'bit-test':
      return `${prefix}bit ${instr.bit}, ${instr.reg}`;
    case 'bit-test-ind':
      return `${prefix}bit ${instr.bit}, (${instr.indirectRegister})`;
    case 'bit-res':
      return `${prefix}res ${instr.bit}, ${instr.reg}`;
    case 'bit-res-ind':
      return `${prefix}res ${instr.bit}, (${instr.indirectRegister})`;
    case 'bit-set':
      return `${prefix}set ${instr.bit}, ${instr.reg}`;
    case 'bit-set-ind':
      return `${prefix}set ${instr.bit}, (${instr.indirectRegister})`;
    case 'ld-pair-imm':
      return `${prefix}ld ${instr.pair}, ${formatTarget(instr.value)}`;
    case 'ld-pair-mem':
      if (instr.direction === 'to-mem') {
        return `${prefix}ld (${formatTarget(instr.addr)}), ${instr.pair}`;
      }
      return `${prefix}ld ${instr.pair}, (${formatTarget(instr.addr)})`;
    case 'ld-mem-pair':
      return `${prefix}ld (${formatTarget(instr.addr)}), ${instr.pair}`;
    case 'ld-reg-reg':
      return `${prefix}ld ${instr.dest}, ${instr.src}`;
    case 'ld-reg-imm':
      return `${prefix}ld ${instr.dest}, ${byteHex(instr.value)}`;
    case 'ld-reg-mem':
      return `${prefix}ld ${instr.dest}, (${formatTarget(instr.addr)})`;
    case 'ld-mem-reg':
      return `${prefix}ld (${formatTarget(instr.addr)}), ${instr.src}`;
    case 'ld-reg-ind':
      return `${prefix}ld ${instr.dest}, (${instr.src})`;
    case 'ld-ind-reg':
      return `${prefix}ld (${instr.dest}), ${instr.src}`;
    case 'ld-ind-imm':
      return `${prefix}ld (${instr.dest}), ${byteHex(instr.value)}`;
    case 'ld-reg-ixd':
      return `${prefix}ld ${instr.dest}, ${formatIndexed(instr.indexRegister, instr.displacement)}`;
    case 'ld-ixd-reg':
      return `${prefix}ld ${formatIndexed(instr.indexRegister, instr.displacement)}, ${instr.src}`;
    case 'ld-ixd-imm':
      return `${prefix}ld ${formatIndexed(instr.indexRegister, instr.displacement)}, ${byteHex(instr.value)}`;
    case 'ld-sp-pair':
      return `${prefix}ld sp, ${instr.pair}`;
    case 'inc-pair':
      return `${prefix}inc ${instr.pair}`;
    case 'dec-pair':
      return `${prefix}dec ${instr.pair}`;
    case 'inc-reg':
      return `${prefix}inc ${instr.reg}`;
    case 'dec-reg':
      return `${prefix}dec ${instr.reg}`;
    case 'add-pair':
      return `${prefix}add ${instr.dest}, ${instr.src}`;
    case 'adc-pair':
      return `${prefix}adc ${instr.dest}, ${instr.src}`;
    case 'sbc-pair':
      return `${prefix}sbc ${instr.dest}, ${instr.src}`;
    case 'alu-reg':
      return `${prefix}${formatAlu(instr.op, instr.src)}`;
    case 'alu-imm':
      return `${prefix}${formatAlu(instr.op, byteHex(instr.value))}`;
    case 'alu-ind':
      return `${prefix}${formatAlu(instr.op, `(${instr.indirectRegister})`)}`;
    case 'alu-ixd':
      return `${prefix}${formatAlu(instr.op, formatIndexed(instr.indexRegister, instr.displacement))}`;
    case 'push':
      return `${prefix}push ${instr.pair}`;
    case 'pop':
      return `${prefix}pop ${instr.pair}`;
    case 'jr-conditional':
      return `${prefix}jr ${instr.condition}, ${hex(instr.target)}`;
    case 'jr':
      return `${prefix}jr ${hex(instr.target)}`;
    case 'jp-conditional':
      return `${prefix}jp ${instr.condition}, ${hex(instr.target)}`;
    case 'jp':
      return `${prefix}jp ${hex(instr.target)}`;
    case 'jp-indirect':
      return `${prefix}jp (${instr.indirectRegister})`;
    case 'call-conditional':
      return `${prefix}call ${instr.condition}, ${hex(instr.target)}`;
    case 'call':
      return `${prefix}call ${hex(instr.target)}`;
    case 'ret-conditional':
      return `${prefix}ret ${instr.condition}`;
    case 'ret':
      return `${prefix}ret`;
    case 'reti':
      return `${prefix}reti`;
    case 'retn':
      return `${prefix}retn`;
    case 'djnz':
      return `${prefix}djnz ${hex(instr.target)}`;
    case 'rst':
      return `${prefix}rst ${formatTarget(instr.target)}`;
    case 'ex-de-hl':
      return `${prefix}ex de, hl`;
    case 'ex-af':
      return `${prefix}ex af, af'`;
    case 'ex-sp-hl':
      return `${prefix}ex (sp), hl`;
    case 'ex-sp-ix':
      return `${prefix}ex (sp), ${instr.indexRegister}`;
    case 'exx':
      return `${prefix}exx`;
    case 'di':
      return `${prefix}di`;
    case 'ei':
      return `${prefix}ei`;
    case 'nop':
      return `${prefix}nop`;
    case 'halt':
      return `${prefix}halt`;
    case 'rlca':
      return `${prefix}rlca`;
    case 'rrca':
      return `${prefix}rrca`;
    case 'rla':
      return `${prefix}rla`;
    case 'rra':
      return `${prefix}rra`;
    case 'daa':
      return `${prefix}daa`;
    case 'cpl':
      return `${prefix}cpl`;
    case 'scf':
      return `${prefix}scf`;
    case 'ccf':
      return `${prefix}ccf`;
    case 'ldi':
      return `${prefix}ldi`;
    case 'ldir':
      return `${prefix}ldir`;
    case 'ldd':
      return `${prefix}ldd`;
    case 'lddr':
      return `${prefix}lddr`;
    case 'cpi':
      return `${prefix}cpi`;
    case 'cpir':
      return `${prefix}cpir`;
    case 'cpd':
      return `${prefix}cpd`;
    case 'cpdr':
      return `${prefix}cpdr`;
    case 'ini':
      return `${prefix}ini`;
    case 'inir':
      return `${prefix}inir`;
    case 'ind':
      return `${prefix}ind`;
    case 'indr':
      return `${prefix}indr`;
    case 'outi':
      return `${prefix}outi`;
    case 'otir':
      return `${prefix}otir`;
    case 'outd':
      return `${prefix}outd`;
    case 'otdr':
      return `${prefix}otdr`;
    case 'in-reg':
      return `${prefix}in ${instr.reg}, (c)`;
    case 'out-reg':
      return `${prefix}out (c), ${instr.reg}`;
    case 'in-imm':
      return `${prefix}in a, (${byteHex(instr.port)})`;
    case 'out-imm':
      return `${prefix}out (${byteHex(instr.port)}), a`;
    case 'in0':
      return `${prefix}in0 ${instr.reg}, (${byteHex(instr.port)})`;
    case 'out0':
      return `${prefix}out0 (${byteHex(instr.port)}), ${instr.reg}`;
    case 'neg':
      return `${prefix}neg`;
    case 'im':
      return `${prefix}im ${instr.mode}`;
    case 'ld-i-a':
      return `${prefix}ld i, a`;
    case 'ld-a-i':
      return `${prefix}ld a, i`;
    case 'ld-r-a':
      return `${prefix}ld r, a`;
    case 'ld-a-r':
      return `${prefix}ld a, r`;
    case 'ld-mb-a':
      return `${prefix}ld mb, a`;
    case 'ld-a-mb':
      return `${prefix}ld a, mb`;
    case 'rrd':
      return `${prefix}rrd`;
    case 'rld':
      return `${prefix}rld`;
    case 'stmix':
      return `${prefix}stmix`;
    case 'rsmix':
      return `${prefix}rsmix`;
    case 'tst-a':
      return `${prefix}tst a, ${byteHex(instr.value)}`;
    case 'mlt':
      return `${prefix}mlt ${instr.pair}`;
    case 'lea-ix':
      return `${prefix}lea ix, ${instr.indexRegister}${formatSignedDisplacement(instr.displacement)}`;
    case 'lea-iy':
      return `${prefix}lea iy, ${instr.indexRegister}${formatSignedDisplacement(instr.displacement)}`;
    case 'lea-pair':
      return `${prefix}lea ${instr.pair}, ${instr.indexRegister}${formatSignedDisplacement(instr.displacement)}`;
    case 'pea':
      return `${prefix}pea ${instr.indexRegister}${formatSignedDisplacement(instr.displacement)}`;
    default:
      return `${prefix}${instr.tag}`;
  }
}

// --- Disassembly engine ---

function disasmRange(start, end) {
  const lines = [];
  let pc = start;
  while (pc < end) {
    const inst = decodeInstruction(rom, pc, 'adl');
    if (!inst || !inst.length) {
      const b = rom[pc];
      lines.push({ pc, text: `  ${hex(pc)}: ${byteHex(b).padEnd(18)} db ${byteHex(b)}` });
      pc++;
    } else {
      const bytes = [];
      for (let i = 0; i < inst.length; i++) bytes.push(byteHex(rom[pc + i]));
      const asm = formatInstruction(inst);
      lines.push({ pc, text: `  ${hex(pc)}: ${bytes.join(' ').padEnd(18)} ${asm}` });
      pc += inst.length;
    }
  }
  return lines;
}

function readString(addr) {
  if (addr < 0 || addr >= rom.length) return `(out of range: ${hex(addr)})`;
  let s = '';
  for (let i = 0; i < 200; i++) {
    const b = rom[addr + i];
    if (b === 0) break;
    s += (b >= 0x20 && b < 0x7f) ? String.fromCharCode(b) : `\\x${byteHex(b).replace('0x', '')}`;
  }
  return s;
}

/**
 * Scan backward from callAddr looking for LD HL,nn (tag 'ld-pair-imm' with pair='hl').
 * Returns addresses loaded into HL.
 */
function findHLLoads(callAddr, maxBack = 40) {
  const results = [];
  let pc = callAddr - maxBack;
  if (pc < 0) pc = 0;
  while (pc < callAddr) {
    const inst = decodeInstruction(rom, pc, 'adl');
    if (!inst || !inst.length) { pc++; continue; }
    if (inst.tag === 'ld-pair-imm' && inst.pair === 'hl') {
      results.push(inst.value);
    }
    pc += inst.length;
  }
  return results;
}

// --- Sites referencing 0x0059E9 ---

const callSites = [0x00158C, 0x0015A0, 0x0015B5, 0x0015BD, 0x00166F, 0x00175B, 0x001763];
const jpSites = [0x000378, 0x003AEB];
const allSites = [
  ...callSites.map(a => ({ addr: a, type: 'CALL' })),
  ...jpSites.map(a => ({ addr: a, type: 'JP' })),
];

console.log('='.repeat(80));
console.log('Probe phase-290: Callers of 0x0059E9 - context disassembly');
console.log('='.repeat(80));

for (const { addr, type } of allSites) {
  const before = Math.max(0, addr - 40);
  const after = addr + 20;
  console.log(`\n${'─'.repeat(70)}`);
  console.log(`${type} site at ${hex(addr)} - context [${hex(before)} .. ${hex(after)}]`);
  console.log('─'.repeat(70));
  const lines = disasmRange(before, after);
  for (const l of lines) {
    const marker = (l.pc === addr) ? '  <<<' : '';
    console.log(l.text + marker);
  }

  // String literals loaded into HL before this call/jp
  const hlAddrs = findHLLoads(addr);
  if (hlAddrs.length > 0) {
    console.log(`\n  String literals (HL loads before ${type}):`);
    for (const a of hlAddrs) {
      const str = readString(a);
      console.log(`    HL = ${hex(a)} -> "${str}"`);
    }
  }
}

// --- Find function start for the 0x0015xx cluster ---

console.log(`\n${'='.repeat(80)}`);
console.log('Scanning backward from 0x001560 to find function start');
console.log('='.repeat(80));

// Disassemble forward from 0x001400, recording the last RET/JP/RETI/RETN before 0x001560
let lastTerminator = null;
let lastTerminatorPc = null;
let funcStart = null;
let pc = 0x001400;

while (pc < 0x001560) {
  const inst = decodeInstruction(rom, pc, 'adl');
  if (!inst || !inst.length) { pc++; continue; }
  const tag = inst.tag;
  if (tag === 'ret' || tag === 'reti' || tag === 'retn' ||
      (tag === 'jp' && !inst.condition)) {
    lastTerminator = formatInstruction(inst);
    lastTerminatorPc = pc;
    funcStart = pc + inst.length;
  }
  pc += inst.length;
}

if (funcStart) {
  console.log(`\nPrevious function terminates at ${hex(lastTerminatorPc)} (${lastTerminator})`);
  console.log(`Likely function start: ${hex(funcStart)}`);
  console.log(`\nFirst 80 bytes of function:`);
  const lines = disasmRange(funcStart, Math.min(funcStart + 80, 0x001600));
  for (const l of lines) console.log(l.text);
} else {
  console.log('Could not find function boundary before 0x001560');
}

// --- Classification ---

console.log(`\n${'='.repeat(80)}`);
console.log('Classification of each caller');
console.log('='.repeat(80));

for (const { addr, type } of allSites) {
  let classification;

  if (addr < 0x000400) {
    // Very early ROM - near reset vector and interrupt table
    classification = 'BOOT/INIT (early ROM, near reset/interrupt vectors)';
  } else if (addr >= 0x001500 && addr < 0x001800) {
    classification = 'BOOT/INIT (0x0015xx-0x0017xx cluster, OS startup/self-test)';
  } else if (addr >= 0x003A00 && addr < 0x003C00) {
    classification = 'FOREGROUND (0x003Axx range, OS utility/dispatcher)';
  } else {
    classification = 'UNKNOWN';
  }

  // Refine: check for DI/EI near the call site (ISR indicator)
  let hasDisableInterrupts = false;
  const scanStart = Math.max(0, addr - 60);
  let spc = scanStart;
  while (spc < addr) {
    const inst = decodeInstruction(rom, spc, 'adl');
    if (!inst || !inst.length) { spc++; continue; }
    if (inst.tag === 'di') hasDisableInterrupts = true;
    spc += inst.length;
  }

  if (hasDisableInterrupts) {
    classification += ' [DI nearby - possible ISR or critical section]';
  }

  // Check string content for hints
  const hlAddrs = findHLLoads(addr, 60);
  for (const a of hlAddrs) {
    const str = readString(a).toLowerCase();
    if (str.includes('waiting') || str.includes('install') || str.includes('update')) {
      classification += ' [strings suggest boot/update flow]';
      break;
    }
  }

  console.log(`  ${hex(addr)} (${type}): ${classification}`);
}

console.log(`\n${'='.repeat(80)}`);
console.log('Done.');
