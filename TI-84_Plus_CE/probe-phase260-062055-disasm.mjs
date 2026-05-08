#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const START_ADDR = 0x062055;
const END_ADDR = 0x062100;
const WATCH_ADDR = 0xD007E0;

const CONTROL_FLOW_TAGS = new Set([
  'djnz',
  'jp',
  'jp-conditional',
  'jp-indirect',
  'jr',
  'jr-conditional',
  'ret',
  'ret-conditional',
  'reti',
  'retn',
]);

const IY_BIT_TAGS = new Set([
  'indexed-cb-bit',
  'indexed-cb-res',
  'indexed-cb-set',
]);

const rom = fs.readFileSync(ROM_PATH);

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return ((value ?? 0) & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

function hexBytes(buffer, start, length) {
  return Array.from(buffer.slice(start, start + length), hexByte).join(' ');
}

function fmtDisp(value) {
  return value >= 0 ? `+${value}` : `${value}`;
}

function fmtIndexed(register, displacement) {
  return `(${register}${fmtDisp(displacement)})`;
}

function withModePrefix(inst, text) {
  return inst.modePrefix ? `${inst.modePrefix} ${text}` : text;
}

function formatMnemonic(inst) {
  switch (inst.tag) {
    case 'nop':
      return withModePrefix(inst, 'nop');
    case 'push':
      return withModePrefix(inst, `push ${inst.pair}`);
    case 'pop':
      return withModePrefix(inst, `pop ${inst.pair}`);
    case 'inc-pair':
      return withModePrefix(inst, `inc ${inst.pair}`);
    case 'dec-pair':
      return withModePrefix(inst, `dec ${inst.pair}`);
    case 'inc-reg':
      return withModePrefix(inst, `inc ${inst.reg}`);
    case 'dec-reg':
      return withModePrefix(inst, `dec ${inst.reg}`);
    case 'ld-pair-imm':
      return withModePrefix(inst, `ld ${inst.pair}, ${hex(inst.value)}`);
    case 'ld-reg-imm':
      return withModePrefix(inst, `ld ${inst.dest}, ${hex(inst.value, 2)}`);
    case 'ld-reg-reg':
      return withModePrefix(inst, `ld ${inst.dest}, ${inst.src}`);
    case 'ld-reg-ind':
      return withModePrefix(inst, `ld ${inst.dest}, (${inst.src})`);
    case 'ld-ind-reg':
      return withModePrefix(inst, `ld (${inst.dest}), ${inst.src}`);
    case 'ld-reg-mem':
      return withModePrefix(inst, `ld ${inst.dest}, (${hex(inst.addr)})`);
    case 'ld-mem-reg':
      return withModePrefix(inst, `ld (${hex(inst.addr)}), ${inst.src}`);
    case 'ld-reg-ixd':
      return withModePrefix(inst, `ld ${inst.dest}, ${fmtIndexed(inst.indexRegister, inst.displacement)}`);
    case 'ld-ixd-reg':
      return withModePrefix(inst, `ld ${fmtIndexed(inst.indexRegister, inst.displacement)}, ${inst.src}`);
    case 'indexed-cb-bit':
      return withModePrefix(inst, `bit ${inst.bit}, ${fmtIndexed(inst.indexRegister, inst.displacement)}`);
    case 'indexed-cb-res':
      return withModePrefix(inst, `res ${inst.bit}, ${fmtIndexed(inst.indexRegister, inst.displacement)}`);
    case 'indexed-cb-set':
      return withModePrefix(inst, `set ${inst.bit}, ${fmtIndexed(inst.indexRegister, inst.displacement)}`);
    case 'call':
      return withModePrefix(inst, `call ${hex(inst.target)}`);
    case 'call-conditional':
      return withModePrefix(inst, `call ${inst.condition}, ${hex(inst.target)}`);
    case 'jp':
      return withModePrefix(inst, `jp ${hex(inst.target)}`);
    case 'jp-conditional':
      return withModePrefix(inst, `jp ${inst.condition}, ${hex(inst.target)}`);
    case 'jp-indirect':
      return withModePrefix(inst, `jp (${inst.indirectRegister})`);
    case 'jr':
      return withModePrefix(inst, `jr ${hex(inst.target)}`);
    case 'jr-conditional':
      return withModePrefix(inst, `jr ${inst.condition}, ${hex(inst.target)}`);
    case 'ret':
      return withModePrefix(inst, 'ret');
    case 'ret-conditional':
      return withModePrefix(inst, `ret ${inst.condition}`);
    case 'alu-imm':
      return withModePrefix(inst, `${inst.op} ${hex(inst.value, 2)}`);
    case 'alu-reg':
      return withModePrefix(inst, `${inst.op} ${inst.src}`);
    default:
      return withModePrefix(inst, inst.tag);
  }
}

function flagsFor(inst) {
  const flags = [];

  if (inst.tag === 'ld-mem-reg' && inst.src === 'a' && (inst.addr >>> 0) === WATCH_ADDR) {
    flags.push('D007E0_WRITE');
  }

  if ((inst.tag === 'call' || inst.tag === 'call-conditional') && Number.isInteger(inst.target)) {
    flags.push(`CALL ${hex(inst.target)}`);
  }

  if (IY_BIT_TAGS.has(inst.tag) && inst.indexRegister === 'iy') {
    const op = inst.tag.slice('indexed-cb-'.length).toUpperCase();
    flags.push(`${op} IY${fmtDisp(inst.displacement)}`);
  }

  if (CONTROL_FLOW_TAGS.has(inst.tag)) {
    flags.push('CTRL');
  }

  return flags;
}

function summarizeLine(addr, bytes, mnemonic, flags) {
  const suffix = flags.length > 0 ? `  [${flags.join('] [')}]` : '';
  return `${hex(addr)}: ${bytes} → ${mnemonic}${suffix}`;
}

function main() {
  console.log(`Disassembly ${hex(START_ADDR)}..${hex(END_ADDR - 1)} from ${path.basename(ROM_PATH)} (ADL mode)`);
  console.log(`Watching for ld (${hex(WATCH_ADDR)}), a / calls / IY bit ops / control-flow boundaries`);
  console.log('');

  const flagged = [];

  for (let pc = START_ADDR; pc < END_ADDR;) {
    try {
      const inst = decodeInstruction(rom, pc, 'adl');
      const length = Math.max(inst.length ?? 1, 1);
      const bytes = hexBytes(rom, pc, length);
      const mnemonic = formatMnemonic(inst);
      const flags = flagsFor(inst);
      const line = summarizeLine(pc, bytes, mnemonic, flags);
      console.log(line);
      if (flags.length > 0) flagged.push(line);
      pc += length;
    } catch (error) {
      const bytes = hexBytes(rom, pc, 1);
      const line = `${hex(pc)}: ${bytes} → db ${hex(rom[pc] ?? 0, 2)}  [DECODE_ERROR: ${error.message}]`;
      console.log(line);
      flagged.push(line);
      pc += 1;
    }
  }

  console.log('');
  console.log('Flagged summary:');
  for (const line of flagged) {
    console.log(line);
  }
}

main();
