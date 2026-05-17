#!/usr/bin/env node

/**
 * Phase 350: Disassemble the post-flash-ready boot path (0x0006FA-0x000720).
 *
 * Pure disassembly - no execution. Reads ROM bytes and decodes eZ80 instructions
 * in ADL mode from the target range.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

process.emitWarning = () => {};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const DECODER_PATH = path.join(__dirname, 'ez80-decoder.js');

const START_ADDR = 0x0006FA;
const END_ADDR = 0x000720;
const MODE = 'adl';

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return ((value ?? 0) & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

function hexBytes(buffer, start, length) {
  return Array.from(
    buffer.subarray(start, start + length),
    (v) => hexByte(v),
  ).join(' ');
}

function formatDisp(value) {
  if (value >= 0) return `+0x${value.toString(16).toUpperCase()}`;
  return `-0x${(-value).toString(16).toUpperCase()}`;
}

function withModePrefix(inst, text) {
  return inst?.modePrefix ? `${inst.modePrefix} ${text}` : text;
}

function formatInstruction(inst) {
  switch (inst?.tag) {
    case 'alu-imm':
      return withModePrefix(inst, `${inst.op} ${hexByte(inst.value)}`);
    case 'alu-reg':
      return withModePrefix(inst, `${inst.op} ${inst.src}`);
    case 'bit-test':
      return withModePrefix(inst, `bit ${inst.bit}, ${inst.reg}`);
    case 'bit-test-ind':
      return withModePrefix(inst, `bit ${inst.bit}, (${inst.indirectRegister})`);
    case 'call':
      return withModePrefix(inst, `call ${hex(inst.target)}`);
    case 'call-conditional':
      return withModePrefix(inst, `call ${inst.condition}, ${hex(inst.target)}`);
    case 'ccf':
    case 'di':
    case 'ei':
    case 'halt':
    case 'nop':
    case 'scf':
    case 'rla':
    case 'rlca':
    case 'rra':
    case 'rrca':
    case 'neg':
      return withModePrefix(inst, inst.tag);
    case 'dec-pair':
      return withModePrefix(inst, `dec ${inst.pair}`);
    case 'dec-reg':
      return withModePrefix(inst, `dec ${inst.reg}`);
    case 'djnz':
      return withModePrefix(inst, `djnz ${hex(inst.target)}`);
    case 'in0':
      return withModePrefix(inst, `in0 ${inst.reg}, (${hexByte(inst.port)})`);
    case 'inc-pair':
      return withModePrefix(inst, `inc ${inst.pair}`);
    case 'inc-reg':
      return withModePrefix(inst, `inc ${inst.reg}`);
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
    case 'ld-reg-imm':
      return withModePrefix(inst, `ld ${inst.dest}, ${hexByte(inst.value)}`);
    case 'ld-reg-mem':
      return withModePrefix(inst, `ld ${inst.dest}, (${hex(inst.addr)})`);
    case 'ld-mem-reg':
      return withModePrefix(inst, `ld (${hex(inst.addr)}), ${inst.src}`);
    case 'ld-pair-imm':
      return withModePrefix(inst, `ld ${inst.pair}, ${hex(inst.value)}`);
    case 'ld-reg-reg':
      return withModePrefix(inst, `ld ${inst.dest}, ${inst.src}`);
    case 'out0':
      return withModePrefix(inst, `out0 (${hexByte(inst.port)}), ${inst.reg}`);
    case 'pop':
      return withModePrefix(inst, `pop ${inst.pair}`);
    case 'push':
      return withModePrefix(inst, `push ${inst.pair}`);
    case 'ret':
      return withModePrefix(inst, 'ret');
    case 'ret-conditional':
      return withModePrefix(inst, `ret ${inst.condition}`);
    case 'rst':
      return withModePrefix(inst, `rst ${hex(inst.target, 2)}`);
    default: {
      // Fallback: show tag and key fields
      const parts = [];
      for (const [key, value] of Object.entries(inst ?? {})) {
        if (['tag', 'length', 'pc', 'nextPc', 'mode', 'modePrefix', 'nextMode', 'terminates', 'fallthrough', 'kind'].includes(key)) continue;
        if (value === undefined || value === null) continue;
        if (typeof value === 'number') {
          parts.push(`${key}=${hex(value)}`);
        } else {
          parts.push(`${key}=${value}`);
        }
      }
      return withModePrefix(inst, parts.length > 0 ? `${inst.tag} ${parts.join(' ')}` : inst.tag);
    }
  }
}

// --- Main ---

if (!fs.existsSync(ROM_PATH)) {
  throw new Error('ROM.rom is missing.');
}

const romBytes = new Uint8Array(fs.readFileSync(ROM_PATH));
const { decodeInstruction } = await import(pathToFileURL(DECODER_PATH).href);

console.log('Phase 350: Post-Flash-Ready Boot Path Disassembly');
console.log('=================================================');
console.log(`Range: ${hex(START_ADDR)} - ${hex(END_ADDR)}`);
console.log(`Mode:  ADL (24-bit)`);
console.log('');

// Raw hex dump
console.log('=== Raw Hex Dump ===');
for (let offset = START_ADDR; offset < END_ADDR; offset += 16) {
  const len = Math.min(16, END_ADDR - offset);
  console.log(`  ${hex(offset)}: ${hexBytes(romBytes, offset, len)}`);
}
console.log('');

// Disassembly
console.log('=== Disassembly ===');
let pc = START_ADDR;
while (pc < END_ADDR) {
  let inst = null;
  try {
    inst = decodeInstruction(romBytes, pc, MODE);
  } catch {
    // decode failed
  }

  if (!inst || !Number.isInteger(inst.length) || inst.length <= 0) {
    const byte = romBytes[pc];
    console.log(`  ${hex(pc)}: ${hexByte(byte)}                db ${hexByte(byte)}`);
    pc += 1;
    continue;
  }

  const len = inst.length;
  const bytes = hexBytes(romBytes, pc, len).padEnd(17);
  const mnemonic = formatInstruction(inst);
  console.log(`  ${hex(pc)}: ${bytes} ${mnemonic}`);
  pc += len;
}

console.log('');
console.log('--- probe complete ---');
