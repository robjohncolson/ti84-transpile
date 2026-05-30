#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const DECODER_PATH = path.join(__dirname, 'ez80-decoder.js');

const { decodeInstruction } = await import(pathToFileURL(DECODER_PATH).href);
const rom = fs.readFileSync(ROM_PATH);

const SCHEDULER_SNIPPET = 0x0015C7;
const SET_BIT3_SITE = 0x0015E1;
const CALL_59C6_SITE = 0x0015EF;
const FUNC_59C6 = 0x0059C6;
const FUNC_5A75 = 0x005A75;
const KEY_PROCESSOR = 0x03FA09;

const BIT3_READ = [0xFD, 0xCB, 0x05, 0x5E];
const BIT3_SET = [0xFD, 0xCB, 0x05, 0xDE];
const BIT3_RES = [0xFD, 0xCB, 0x05, 0x9E];

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function bytesAt(pc, length) {
  return Array.from(rom.subarray(pc, pc + length), (byte) => byte.toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

function fmtIndexed(inst) {
  const sign = inst.displacement < 0 ? '-' : '+';
  return `(${String(inst.indexRegister).toUpperCase()}${sign}0x${Math.abs(inst.displacement).toString(16).toUpperCase().padStart(2, '0')})`;
}

function fmt(inst) {
  if (!inst) return '(decode failed)';
  switch (inst.tag) {
    case 'call': return `CALL ${hex(inst.target)}`;
    case 'call-conditional': return `CALL ${String(inst.condition).toUpperCase()},${hex(inst.target)}`;
    case 'jp': return `JP ${hex(inst.target)}`;
    case 'jp-conditional': return `JP ${String(inst.condition).toUpperCase()},${hex(inst.target)}`;
    case 'jr': return `JR ${hex(inst.target)}`;
    case 'jr-conditional': return `JR ${String(inst.condition).toUpperCase()},${hex(inst.target)}`;
    case 'ret': return 'RET';
    case 'push': return `PUSH ${String(inst.pair).toUpperCase()}`;
    case 'pop': return `POP ${String(inst.pair).toUpperCase()}`;
    case 'ld-pair-imm': return `LD ${String(inst.pair).toUpperCase()},${hex(inst.value, inst.value <= 0xFFFF ? 4 : 6)}`;
    case 'ld-reg-imm': return `LD ${String(inst.dest).toUpperCase()},0x${(inst.value & 0xFF).toString(16).toUpperCase().padStart(2, '0')}`;
    case 'ld-reg-reg': return `LD ${String(inst.dest).toUpperCase()},${String(inst.src).toUpperCase()}`;
    case 'ld-reg-ind': return `LD ${String(inst.dest).toUpperCase()},(${String(inst.src).toUpperCase()})`;
    case 'ld-reg-mem': return `LD ${String(inst.dest).toUpperCase()},(${hex(inst.addr)})`;
    case 'ld-mem-reg': return `LD (${hex(inst.addr)}),${String(inst.src).toUpperCase()}`;
    case 'ld-pair-mem':
      return inst.direction === 'to-mem'
        ? `LD (${hex(inst.addr)}),${String(inst.pair).toUpperCase()}`
        : `LD ${String(inst.pair).toUpperCase()},(${hex(inst.addr)})`;
    case 'inc-reg': return `INC ${String(inst.reg).toUpperCase()}`;
    case 'inc-pair': return `INC ${String(inst.pair).toUpperCase()}`;
    case 'dec-reg': return `DEC ${String(inst.reg).toUpperCase()}`;
    case 'dec-pair': return `DEC ${String(inst.pair).toUpperCase()}`;
    case 'alu-imm': return `${String(inst.op).toUpperCase()} 0x${(inst.value & 0xFF).toString(16).toUpperCase().padStart(2, '0')}`;
    case 'alu-reg': return `${String(inst.op).toUpperCase()} ${String(inst.src).toUpperCase()}`;
    case 'bit-test': return `BIT ${inst.bit},${String(inst.reg).toUpperCase()}`;
    case 'indexed-cb-bit': return `BIT ${inst.bit},${fmtIndexed(inst)}`;
    case 'indexed-cb-set': return `SET ${inst.bit},${fmtIndexed(inst)}`;
    case 'indexed-cb-res': return `RES ${inst.bit},${fmtIndexed(inst)}`;
    case 'in0': return `IN0 ${String(inst.reg).toUpperCase()},(0x${inst.port.toString(16).toUpperCase().padStart(2, '0')})`;
    case 'djnz': return `DJNZ ${hex(inst.target)}`;
    default: return inst.mnemonic ? `${inst.mnemonic}${inst.operands ? ` ${inst.operands}` : ''}` : inst.tag;
  }
}

function decodeSafe(pc) {
  try {
    return decodeInstruction(rom, pc, 'adl');
  } catch {
    return null;
  }
}

function disassemble(startPc, { maxInstructions = 12, maxBytes = Infinity } = {}) {
  const rows = [];
  let pc = startPc;
  let used = 0;
  while (rows.length < maxInstructions && used < maxBytes && pc < rom.length) {
    const inst = decodeSafe(pc);
    if (!inst || !inst.length) break;
    rows.push({ pc, inst, bytes: bytesAt(pc, inst.length) });
    pc += inst.length;
    used += inst.length;
    if (inst.tag === 'ret') break;
  }
  return rows;
}

function findPattern(pattern) {
  const matches = [];
  for (let pc = 0; pc <= rom.length - pattern.length; pc++) {
    let ok = true;
    for (let i = 0; i < pattern.length; i++) {
      if (rom[pc + i] !== pattern[i]) {
        ok = false;
        break;
      }
    }
    if (ok) matches.push(pc);
  }
  return matches;
}

function findTransfers(target, opcodes) {
  const lo = target & 0xFF;
  const mid = (target >> 8) & 0xFF;
  const hi = (target >> 16) & 0xFF;
  const out = [];
  for (let pc = 0; pc <= rom.length - 4; pc++) {
    if (opcodes.includes(rom[pc]) && rom[pc + 1] === lo && rom[pc + 2] === mid && rom[pc + 3] === hi) {
      out.push(pc);
    }
  }
  return out;
}

function wrapAddresses(addresses, width = 8) {
  const lines = [];
  for (let i = 0; i < addresses.length; i += width) {
    lines.push(addresses.slice(i, i + width).map((addr) => hex(addr)).join(', '));
  }
  return lines;
}

function printRows(title, rows) {
  console.log(title);
  for (const row of rows) {
    console.log(`${hex(row.pc)}  ${row.bytes.padEnd(15)}  ${fmt(row.inst)}`);
  }
  console.log('');
}

const readers = findPattern(BIT3_READ);
const writers = findPattern(BIT3_SET);
const clearers = findPattern(BIT3_RES);
const calls59C6 = findTransfers(FUNC_59C6, [0xCD]);
const keyProcessorTransfers = findTransfers(KEY_PROCESSOR, [0xCD, 0xC3]);
const localReaders = readers.filter((addr) => addr >= FUNC_59C6 && addr < 0x005C00);
const keyWindowReaders = readers.filter((addr) => addr >= 0x03F900 && addr < 0x03FD00);
const rendererCallsKeyProcessor = keyProcessorTransfers.filter((addr) => addr >= FUNC_59C6 && addr < 0x005C00);

console.log('=== Phase 464: D00085 Bit 3 Chain + Decode 0x0059C6 ===');
console.log('ROM-only analysis: no boot, no cpu-runtime.js, static decode/search only.');
console.log('');

printRows('--- Scheduler snippet around 0x0015E1 ---', disassemble(SCHEDULER_SNIPPET, { maxInstructions: 18 }));
printRows('--- First ~50 bytes of 0x0059C6 ---', disassemble(FUNC_59C6, { maxInstructions: 20, maxBytes: 0x32 }));
printRows('--- 0x005A75 local D00085-bit3 consumers ---', disassemble(FUNC_5A75, { maxInstructions: 28, maxBytes: 0x70 }));
printRows('--- First part of key processor 0x03FA09 ---', disassemble(KEY_PROCESSOR, { maxInstructions: 16, maxBytes: 0x40 }));

console.log('--- All D00085 bit-3 opcode sites ((IY+5)) ---');
console.log(`READ  BIT 3,(IY+5): ${readers.length} site(s)`);
for (const line of wrapAddresses(readers)) console.log(`  ${line}`);
console.log(`WRITE SET 3,(IY+5): ${writers.length} site(s)`);
for (const line of wrapAddresses(writers)) console.log(`  ${line}`);
console.log(`CLEAR RES 3,(IY+5): ${clearers.length} site(s)`);
for (const line of wrapAddresses(clearers)) console.log(`  ${line}`);
console.log('');

console.log('--- Call sites ---');
console.log(`CALL 0x0059C6: ${calls59C6.map((addr) => hex(addr)).join(', ')}`);
console.log(`CALL/JP 0x03FA09: ${keyProcessorTransfers.map((addr) => hex(addr)).join(', ')}`);
console.log('');

console.log('--- Static findings ---');
console.log(`Scheduler key-detect path sets D00085 bit 3 at ${hex(SET_BIT3_SITE)}, then calls 0x0059C6 from ${hex(CALL_59C6_SITE)} with A=0x0A, HL=0x001900, and stores HL into (0xD00595) immediately before the call.`);
console.log('0x0059C6 is not a key-dispatch entry point. It compares A against 0xD6, routes through 0x005A75, increments D00596, and wraps via 0x005A02. The 0x005A75 helper maps A through 0x00596E, computes a D40000-based destination, and writes pixels/bytes.');
console.log(`The only D00085 bit-3 readers inside the 0x0059C6 renderer cluster are ${localReaders.map((addr) => hex(addr)).join(', ')}. Those reads adjust HL/C/E and apply XOR 0xFE before writing output, so bit 3 is acting as a rendering/layout mode flag there.`);
console.log(`0x03FA09 lives on the key path, starting from D00587 and clearing RES 3,(IY+0) at ${hex(0x03FA11)}. There are ${keyWindowReaders.length} BIT 3,(IY+5) reads inside the 0x03FA09 neighborhood, and ${rendererCallsKeyProcessor.length} direct CALL/JP edges from the 0x0059C6 cluster to 0x03FA09.`);
console.log('Verdict: D00085 bit 3 is consumed by the 0x0059C6/0x005A75 display-output chain, not by the 0x03FA09 key processor itself. The scheduler temporarily sets the flag before the 0x0015EF call, so the connection to key handling is indirect: scheduler detects a key, flips the flag, runs the renderer/helper, then clears the flag before continuing.');
