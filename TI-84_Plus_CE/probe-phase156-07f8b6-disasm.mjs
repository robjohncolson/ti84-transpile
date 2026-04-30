#!/usr/bin/env node

/**
 * Phase 156 - Static disassembly of 0x07F8B6 and 0x07CA48.
 *
 * Goal: understand how the function at 0x07F8B6 chains into FPDiv
 * at 0x07CA48, and what register/OP setup happens in between.
 *
 * Regions disassembled:
 *   1. 0x07F8B6 - 0x07F900  (the target function)
 *   2. 0x07CA48 - 0x07CA70  (FPDiv loop entry)
 *   3. First ~20 bytes of any CALL targets found in region 1
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));

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

function hexBytes(start, length) {
  const bytes = [];
  for (let i = 0; i < length; i++) {
    bytes.push(byteHex(romBytes[start + i] ?? 0));
  }
  return bytes.join(' ');
}

function decodeRange(startAddr, endAddr) {
  const entries = [];
  let pc = startAddr;

  while (pc < endAddr) {
    try {
      const instr = decodeInstruction(romBytes, pc, 'adl');
      const length = Math.max(instr.length || 1, 1);
      entries.push({
        pc,
        instr,
        bytes: hexBytes(pc, length),
        text: formatInstruction(instr),
      });
      pc += length;
    } catch (error) {
      entries.push({
        pc,
        instr: null,
        bytes: hexBytes(pc, 1),
        text: `decode-error: ${error?.message ?? error}`,
      });
      pc += 1;
    }
  }

  return entries;
}

function printDisasm(label, entries) {
  console.log(`--- ${label} ---`);
  for (const entry of entries) {
    const addr = hex(entry.pc);
    const bytes = entry.bytes.padEnd(20);
    console.log(`  ${addr}  ${bytes}  ${entry.text}`);
  }
  console.log('');
}

// --- Known address annotations ---

const ANNOTATIONS = new Map([
  [0x07F8A2, 'AbsOP1 (set sign byte of OP1 to 0x00)'],
  [0x07C747, 'OP1toOP2 (copy OP1 -> OP2)'],
  [0x07F95E, 'OP1->OP3 copy'],
  [0x07F8B6, 'Target function (called from gcd body at 0x068D82)'],
  [0x07CA48, 'FPDiv entry'],
  [0x07F974, 'Mov9 / ldir-based 9-byte copy'],
  [0x07F8FA, 'OP1toOP2 internal (after Mov9)'],
  [0x07FD4A, 'helper (seen in trace at steps 45, 63)'],
  [0x07FB33, 'helper (seen in trace at steps 68, 75)'],
  [0x07FDF1, 'helper (seen in trace at steps 71, 78)'],
  [0x080037, 'helper (seen in trace at step 26)'],
]);

// --- Main ---

function main() {
  console.log('=== Phase 156: Static disassembly of 0x07F8B6 and 0x07CA48 ===');
  console.log('');

  // Region 1: The target function at 0x07F8B6
  const region1 = decodeRange(0x07F8B6, 0x07F910);
  printDisasm('Region 1: 0x07F8B6 - 0x07F910 (target function)', region1);

  // Collect CALL targets from region 1
  const callTargets = new Set();
  for (const entry of region1) {
    if (!entry.instr) continue;
    if (entry.instr.tag === 'call' || entry.instr.tag === 'call-conditional') {
      callTargets.add(entry.instr.target);
    }
    if (entry.instr.tag === 'jp' || entry.instr.tag === 'jp-conditional') {
      callTargets.add(entry.instr.target);
    }
  }

  // Region 2: FPDiv entry at 0x07CA48
  const region2 = decodeRange(0x07CA48, 0x07CA78);
  printDisasm('Region 2: 0x07CA48 - 0x07CA78 (FPDiv entry)', region2);

  // Collect CALL targets from region 2
  for (const entry of region2) {
    if (!entry.instr) continue;
    if (entry.instr.tag === 'call' || entry.instr.tag === 'call-conditional') {
      callTargets.add(entry.instr.target);
    }
    if (entry.instr.tag === 'jp' || entry.instr.tag === 'jp-conditional') {
      callTargets.add(entry.instr.target);
    }
  }

  // Disassemble first ~20 bytes of each CALL/JP target found
  console.log('--- CALL/JP targets from both regions ---');
  const sortedTargets = Array.from(callTargets).sort((a, b) => a - b);
  for (const target of sortedTargets) {
    const annotation = ANNOTATIONS.get(target) ?? '';
    const label = annotation ? ` (${annotation})` : '';
    const targetEntries = decodeRange(target, target + 24);
    printDisasm(`Target ${hex(target)}${label}`, targetEntries);
  }

  // Also disassemble the area just before 0x07F8B6 to see if it falls through
  console.log('--- Context: bytes before 0x07F8B6 (0x07F8A2 - 0x07F8B6) ---');
  const before = decodeRange(0x07F8A2, 0x07F8B6);
  printDisasm('Pre-context 0x07F8A2 (AbsOP1)', before);

  // Summary of control flow
  console.log('=== Control flow summary ===');
  console.log('');
  console.log('Region 1 (0x07F8B6) instructions with control transfer:');
  for (const entry of region1) {
    if (!entry.instr) continue;
    const tag = entry.instr.tag;
    if (
      tag === 'call' || tag === 'call-conditional' ||
      tag === 'jp' || tag === 'jp-conditional' ||
      tag === 'jr' || tag === 'jr-conditional' ||
      tag === 'ret' || tag === 'ret-conditional' ||
      tag === 'djnz' || tag === 'rst'
    ) {
      console.log(`  ${hex(entry.pc)}  ${entry.text}`);
    }
  }

  console.log('');
  console.log('Region 2 (0x07CA48 FPDiv) instructions with control transfer:');
  for (const entry of region2) {
    if (!entry.instr) continue;
    const tag = entry.instr.tag;
    if (
      tag === 'call' || tag === 'call-conditional' ||
      tag === 'jp' || tag === 'jp-conditional' ||
      tag === 'jr' || tag === 'jr-conditional' ||
      tag === 'ret' || tag === 'ret-conditional' ||
      tag === 'djnz' || tag === 'rst'
    ) {
      console.log(`  ${hex(entry.pc)}  ${entry.text}`);
    }
  }

  console.log('');
  console.log('Done.');
}

try {
  main();
} catch (error) {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
}
