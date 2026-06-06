#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ============================================================
// Part 1: ROM byte scan for references to D00842
// ============================================================

console.log('=== Phase 528 - Investigate D00842 FP Default/Error Value ===\n');
console.log('--- Part 1: ROM byte scan for D00842 references ---\n');

const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));

// D00842 in little-endian: 42 08 D0
const target = [0x42, 0x08, 0xD0];
const hits = [];

for (let i = 0; i < romBytes.length - 2; i++) {
  if (romBytes[i] === target[0] && romBytes[i + 1] === target[1] && romBytes[i + 2] === target[2]) {
    hits.push(i);
  }
}

console.log(`Found ${hits.length} references to D00842 in ROM:\n`);

// Simple eZ80 instruction context decoder
function decodeContext(rom, addrPos) {
  const b1 = addrPos > 0 ? rom[addrPos - 1] : -1;
  const b2 = addrPos > 1 ? rom[addrPos - 2] : -1;

  let instr = '???';
  let rw = '?';

  // Single-byte opcode + 3-byte addr
  if (b1 === 0x3A) { instr = 'LD A, (D00842)'; rw = 'READ'; }
  else if (b1 === 0x32) { instr = 'LD (D00842), A'; rw = 'WRITE'; }
  else if (b1 === 0x21) { instr = 'LD HL, D00842'; rw = 'LEA/ADDR'; }
  else if (b1 === 0x11) { instr = 'LD DE, D00842'; rw = 'LEA/ADDR'; }
  else if (b1 === 0x01) { instr = 'LD BC, D00842'; rw = 'LEA/ADDR'; }
  else if (b1 === 0x2A) { instr = 'LD HL, (D00842)'; rw = 'READ'; }
  else if (b1 === 0x22) { instr = 'LD (D00842), HL'; rw = 'WRITE'; }
  else if (b1 === 0xCD) { instr = 'CALL D00842'; rw = 'CALL'; }
  else if (b1 === 0xC3) { instr = 'JP D00842'; rw = 'JUMP'; }
  else if ((b1 & 0xC7) === 0xC2) { instr = `JP cc, D00842 (cc=${(b1 >> 3) & 7})`; rw = 'JUMP'; }
  // Two-byte prefix: ED xx addr
  else if (b2 === 0xED) {
    if (b1 === 0x6B) { instr = 'LD HL, (D00842)'; rw = 'READ'; }
    else if (b1 === 0x5B) { instr = 'LD DE, (D00842)'; rw = 'READ'; }
    else if (b1 === 0x4B) { instr = 'LD BC, (D00842)'; rw = 'READ'; }
    else if (b1 === 0x63) { instr = 'LD (D00842), HL'; rw = 'WRITE'; }
    else if (b1 === 0x53) { instr = 'LD (D00842), DE'; rw = 'WRITE'; }
    else if (b1 === 0x43) { instr = 'LD (D00842), BC'; rw = 'WRITE'; }
    else { instr = `ED ${b1.toString(16)} + D00842`; }
  }
  // DD/FD prefix (IX/IY)
  else if (b2 === 0xDD || b2 === 0xFD) {
    const reg = b2 === 0xDD ? 'IX' : 'IY';
    if (b1 === 0x21) { instr = `LD ${reg}, D00842`; rw = 'LEA/ADDR'; }
    else if (b1 === 0x2A) { instr = `LD ${reg}, (D00842)`; rw = 'READ'; }
    else if (b1 === 0x22) { instr = `LD (D00842), ${reg}`; rw = 'WRITE'; }
    else { instr = `${reg}-prefix ${b1.toString(16)} + D00842`; }
  }
  else {
    instr = `opcode ${b1 >= 0 ? '0x' + b1.toString(16).padStart(2, '0') : '??'}${b2 >= 0 ? ' (prev: 0x' + b2.toString(16).padStart(2, '0') + ')' : ''} + D00842`;
  }

  return { instr, rw };
}

for (const pos of hits) {
  const ctx = decodeContext(romBytes, pos);
  // Show surrounding bytes for context
  const startCtx = Math.max(0, pos - 4);
  const endCtx = Math.min(romBytes.length, pos + 6);
  const surrounding = [];
  for (let j = startCtx; j < endCtx; j++) {
    surrounding.push(romBytes[j].toString(16).padStart(2, '0'));
  }
  // Instruction starts at pos minus opcode length; show the instruction address
  const instrAddr = ctx.rw === '?' ? pos : (pos - (ctx.instr.startsWith('ED') || ctx.instr.startsWith('LD IX') || ctx.instr.startsWith('LD IY') ? 2 : 1));
  console.log(`  0x${instrAddr.toString(16).padStart(6, '0')}: ${ctx.instr}  [${ctx.rw}]  bytes: ${surrounding.join(' ')}`);
}

// ============================================================
// Part 2: Boot and read value at D00842
// ============================================================

console.log('\n--- Part 2: Boot OS and read D00842 ---\n');

const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const MEM_SIZE = 0x1000000;
const BOOT_ENTRY = 0x000000;
const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOP_ITERATIONS = 32;
const STACK_RESET_TOP = 0xD1A87E;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;

const mem = new Uint8Array(MEM_SIZE);
mem.set(romBytes);

const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
const executor = createExecutor(BLOCKS, mem, { peripherals });
const cpu = executor.cpu;

// Cold boot (same as golden probe)
const bootResult = executor.runFrom(BOOT_ENTRY, 'z80', {
  maxSteps: BOOT_MAX_STEPS,
  maxLoopIterations: BOOT_MAX_LOOP_ITERATIONS,
});

cpu.halted = false;
cpu.iff1 = 0;
cpu.iff2 = 0;
cpu.sp = STACK_RESET_TOP - 3;
mem.fill(0xFF, cpu.sp, cpu.sp + 3);

executor.runFrom(KERNEL_INIT_ENTRY, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });
cpu.mbase = 0xD0;
cpu._iy = 0xD00080;
cpu._hl = 0;
cpu.halted = false;
cpu.iff1 = 0;
cpu.iff2 = 0;
cpu.sp = STACK_RESET_TOP - 3;
mem.fill(0xFF, cpu.sp, cpu.sp + 3);

executor.runFrom(POST_INIT_ENTRY, 'adl', { maxSteps: 100, maxLoopIterations: 32 });

console.log(`Boot complete: steps=${bootResult.steps} term=${bootResult.termination}`);

// Read 9 bytes at D00842
const D00842 = 0xD00842;
const fpBytes = [];
for (let i = 0; i < 9; i++) {
  fpBytes.push(mem[D00842 + i]);
}

console.log(`\nRaw bytes at D00842: ${fpBytes.map(b => '0x' + b.toString(16).padStart(2, '0')).join(' ')}`);

// Interpret as BCD FP value
// TI-OS FP format (9 bytes):
//   byte 0: type (bits 0-4) + sign (bit 7)
//   byte 1: exponent (biased by 0x80)
//   bytes 2-8: 7 bytes BCD mantissa
const typeByte = fpBytes[0];
const expByte = fpBytes[1];
const mantissaBytes = fpBytes.slice(2, 9);

const fpType = typeByte & 0x1F;
const isNegative = (typeByte & 0x80) !== 0;
const exponent = expByte - 0x80;

// Decode BCD mantissa
let mantissaStr = '';
for (const b of mantissaBytes) {
  mantissaStr += ((b >> 4) & 0xF).toString();
  mantissaStr += (b & 0xF).toString();
}

// Value = sign * 0.mantissa * 10^exponent
const mantissaVal = parseFloat('0.' + mantissaStr);
const value = (isNegative ? -1 : 1) * mantissaVal * Math.pow(10, exponent);

console.log(`\nFP Interpretation:`);
console.log(`  Type byte:  0x${typeByte.toString(16).padStart(2, '0')} (type=${fpType}, negative=${isNegative})`);
console.log(`  Exponent:   0x${expByte.toString(16).padStart(2, '0')} (unbiased: ${exponent}, i.e. 10^${exponent})`);
console.log(`  Mantissa:   ${mantissaBytes.map(b => b.toString(16).padStart(2, '0')).join(' ')} → 0.${mantissaStr}`);
console.log(`  Value:      ${value}`);

// Check if the value is all zeros (uninitialized)
const allZero = fpBytes.every(b => b === 0);
if (allZero) {
  console.log(`  NOTE: All bytes are zero — this represents FP value 0.0`);
}

// Also check the OP1 slot at D005F8 for comparison
const OP1 = 0xD005F8;
const op1Bytes = [];
for (let i = 0; i < 9; i++) {
  op1Bytes.push(mem[OP1 + i]);
}
console.log(`\nOP1 (D005F8) for reference: ${op1Bytes.map(b => '0x' + b.toString(16).padStart(2, '0')).join(' ')}`);

// Also read the surrounding area D00840-D0084F to see context
console.log(`\nMemory dump D00840-D0084F:`);
for (let base = 0xD00840; base < 0xD00850; base += 8) {
  const row = [];
  for (let j = 0; j < 8; j++) {
    row.push(mem[base + j].toString(16).padStart(2, '0'));
  }
  console.log(`  0x${base.toString(16)}: ${row.join(' ')}`);
}

console.log('\n=== Phase 528 complete ===');
