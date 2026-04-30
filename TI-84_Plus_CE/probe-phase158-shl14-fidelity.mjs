#!/usr/bin/env node

/**
 * Phase 158 - Shl14 (0x07FB33/0x07FB50) transpiled block fidelity check.
 *
 * Part A: Standalone RLD verification using cpu.rld() directly.
 * Part B: Transpiled block execution of Shl14 and comparison with Part A.
 * Part C: ROM byte disassembly of Shl14 and normalization loop blocks.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_BIN_PATH = path.join(__dirname, 'ROM.rom');
const ROM_TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');

if (!fs.existsSync(ROM_BIN_PATH)) {
  throw new Error(`ROM binary not found: ${ROM_BIN_PATH}`);
}

if (!fs.existsSync(ROM_TRANSPILED_PATH)) {
  throw new Error(
    'ROM.transpiled.js not found. Run `node scripts/transpile-ti84-rom.mjs` first.'
  );
}

const romBytes = fs.readFileSync(ROM_BIN_PATH);
const romModule = await import(pathToFileURL(ROM_TRANSPILED_PATH).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS ?? romModule.blocks;

if (!BLOCKS) {
  throw new Error('Unable to locate PRELIFTED_BLOCKS in ROM.transpiled.js');
}

// --- Constants ---

const MEM_SIZE = 0x1000000;
const OP1_ADDR = 0xd005f8;
const OP1_MANTISSA_START = 0xd005fa;
const OP1_MANTISSA_END = 0xd00600;

const STACK_RESET_TOP = 0xd1a87e;
const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08c331;
const POST_INIT_ENTRY = 0x0802b2;

const SHL14_ENTRY = 0x07fb33;
const SHL14_CHAIN = 0x07fb50;
const NORM_LOOP = 0x07ca48;

// --- Helpers ---

const hex = (value, width = 6) =>
  value === undefined || value === null
    ? 'n/a'
    : `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;

const hexByte = (value) =>
  (value & 0xff).toString(16).toUpperCase().padStart(2, '0');

function readBytes(mem, addr, len) {
  return Array.from(mem.subarray(addr, addr + len), (byte) => byte & 0xff);
}

function formatBytes(bytes) {
  return bytes.map((byte) => hexByte(byte)).join(' ');
}

function write24(mem, addr, value) {
  mem[addr] = value & 0xff;
  mem[addr + 1] = (value >>> 8) & 0xff;
  mem[addr + 2] = (value >>> 16) & 0xff;
}

// --- Runtime setup ---

function createRuntime() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, 0x400000));
  const executor = createExecutor(BLOCKS, mem, {
    peripherals: createPeripheralBus({ timerInterrupt: false }),
  });
  return { mem, executor, cpu: executor.cpu };
}

function coldBoot(executor, cpu, mem) {
  executor.runFrom(BOOT_ENTRY, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xff, cpu.sp, cpu.sp + 3);

  executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: 100000,
    maxLoopIterations: 10000,
  });

  cpu.mbase = 0xd0;
  cpu._iy = 0xd00080;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xff, cpu.sp, cpu.sp + 3);

  executor.runFrom(POST_INIT_ENTRY, 'adl', { maxSteps: 100, maxLoopIterations: 32 });
}

// --- Part A: Standalone RLD verification ---

function partA(executor, cpu, mem) {
  console.log('========================================');
  console.log('PART A: Standalone RLD Verification');
  console.log('========================================');
  console.log('');

  // Test 1: Simple RLD with all-zero mantissa byte
  console.log('--- Test A1: RLD with mem[HL]=0x00, A=0x00 ---');
  const testAddr = 0xd00600;
  mem[testAddr] = 0x00;
  cpu.hl = testAddr;
  cpu.a = 0x00;

  console.log(`  Before: mem[${hex(testAddr)}]=0x${hexByte(mem[testAddr])}, A=0x${hexByte(cpu.a)}, HL=${hex(cpu.hl)}`);
  cpu.rld();
  console.log(`  After:  mem[${hex(testAddr)}]=0x${hexByte(mem[testAddr])}, A=0x${hexByte(cpu.a)}`);
  console.log(`  Expected: mem=0x00, A=0x00`);
  console.log(`  Match: ${mem[testAddr] === 0x00 && cpu.a === 0x00 ? 'YES' : 'NO'}`);
  console.log('');

  // Test 2: Full 7-RLD chain with rich mantissa
  // OP1 = [00, 83, 12, 34, 56, 78, 90, 12, 34]
  // Mantissa bytes at 0xD005FA..0xD00600: 12 34 56 78 90 12 34
  console.log('--- Test A2: 7-RLD chain with rich mantissa ---');
  const richOp1 = [0x00, 0x83, 0x12, 0x34, 0x56, 0x78, 0x90, 0x12, 0x34];
  mem.set(richOp1, OP1_ADDR);

  const mantissaBefore = readBytes(mem, OP1_MANTISSA_START, 7);
  console.log(`  OP1 before: [${formatBytes(readBytes(mem, OP1_ADDR, 9))}]`);
  console.log(`  Mantissa before: [${formatBytes(mantissaBefore)}]`);

  // RLD chain: HL starts at 0xD00600 (last mantissa byte), A=0, walk backward
  cpu.hl = OP1_MANTISSA_END; // 0xD00600
  cpu.a = 0x00;

  console.log(`  Starting HL=${hex(cpu.hl)}, A=0x${hexByte(cpu.a)}`);
  console.log('');

  // Perform 7 RLDs with DEC HL between each (except after last)
  for (let i = 0; i < 7; i++) {
    const hlBefore = cpu.hl;
    const aBefore = cpu.a;
    const memBefore = mem[cpu.hl];
    cpu.rld();
    const aAfter = cpu.a;
    const memAfter = mem[hlBefore];
    console.log(
      `  RLD #${i + 1}: HL=${hex(hlBefore)} mem[HL]: 0x${hexByte(memBefore)}->0x${hexByte(memAfter)}, A: 0x${hexByte(aBefore)}->0x${hexByte(aAfter)}`
    );
    if (i < 6) {
      cpu.hl = (cpu.hl - 1) & 0xffffff;
    }
  }

  const mantissaAfterA = readBytes(mem, OP1_MANTISSA_START, 7);
  const finalA_A = cpu.a;
  console.log('');
  console.log(`  Mantissa after:  [${formatBytes(mantissaAfterA)}]`);
  console.log(`  Final A: 0x${hexByte(finalA_A)}`);
  console.log(`  Expected mantissa: [23 45 67 89 01 23 40]`);
  console.log(`  Expected A: 0x01`);

  const expectedMantissa = [0x23, 0x45, 0x67, 0x89, 0x01, 0x23, 0x40];
  const mantissaMatch = mantissaAfterA.every((b, i) => b === expectedMantissa[i]);
  const aMatch = finalA_A === 0x01;
  console.log(`  Mantissa match: ${mantissaMatch ? 'YES' : 'NO'}`);
  console.log(`  A match: ${aMatch ? 'YES' : 'NO'}`);
  console.log('');

  return { mantissa: mantissaAfterA, a: finalA_A };
}

// --- Part B: Transpiled block execution ---

function partB(executor, cpu, mem, partAResult) {
  console.log('========================================');
  console.log('PART B: Transpiled Block Execution');
  console.log('========================================');
  console.log('');

  const { compiledBlocks } = executor;

  // Check block existence
  const key1 = '07fb33:adl';
  const key2 = '07fb50:adl';
  const block1Exists = !!compiledBlocks[key1];
  const block2Exists = !!compiledBlocks[key2];
  console.log(`  Block ${key1}: ${block1Exists ? 'EXISTS' : 'MISSING'}`);
  console.log(`  Block ${key2}: ${block2Exists ? 'EXISTS' : 'MISSING'}`);
  console.log('');

  if (!block1Exists && !block2Exists) {
    console.log('  BOTH BLOCKS MISSING — cannot run Part B.');
    return null;
  }

  // Test B1: Rich mantissa [00, 83, 12, 34, 56, 78, 90, 12, 34]
  console.log('--- Test B1: Rich mantissa via transpiled blocks ---');
  const richOp1 = [0x00, 0x83, 0x12, 0x34, 0x56, 0x78, 0x90, 0x12, 0x34];
  mem.set(richOp1, OP1_ADDR);

  // Reset CPU state for block execution
  cpu.madl = 1;
  cpu.mbase = 0xd0;
  cpu.sp = STACK_RESET_TOP - 12;
  mem.fill(0xff, cpu.sp, cpu.sp + 12);

  console.log(`  OP1 before: [${formatBytes(readBytes(mem, OP1_ADDR, 9))}]`);
  console.log(`  Mantissa before: [${formatBytes(readBytes(mem, OP1_MANTISSA_START, 7))}]`);

  let nextPc;

  if (block1Exists) {
    // Execute block 07fb33:adl — should set HL=0xD00600, XOR A, JR to 07fb50
    console.log(`  Executing block ${key1}...`);
    nextPc = compiledBlocks[key1](cpu);
    console.log(`  Returned PC: ${hex(nextPc)}`);
    console.log(`  After ${key1}: HL=${hex(cpu.hl)}, A=0x${hexByte(cpu.a)}`);
  } else {
    // Manually set up what block 07fb33 would do
    console.log(`  Block ${key1} missing — manually setting HL=0xD00600, A=0`);
    cpu.hl = OP1_MANTISSA_END;
    cpu.a = 0x00;
    nextPc = SHL14_CHAIN;
  }

  if (block2Exists) {
    // Execute block 07fb50:adl — 7 RLDs + 6 DEC HL
    console.log(`  Executing block ${key2}...`);
    nextPc = compiledBlocks[key2](cpu);
    console.log(`  Returned PC: ${hex(nextPc)}`);
  } else {
    console.log(`  Block ${key2} MISSING — cannot execute the RLD chain.`);
  }

  const mantissaAfterB1 = readBytes(mem, OP1_MANTISSA_START, 7);
  const finalA_B1 = cpu.a;
  console.log(`  Mantissa after:  [${formatBytes(mantissaAfterB1)}]`);
  console.log(`  Final A: 0x${hexByte(finalA_B1)}`);
  console.log('');

  // Compare with Part A
  const mantissaMatch = mantissaAfterB1.every((b, i) => b === partAResult.mantissa[i]);
  const aMatch = finalA_B1 === partAResult.a;
  console.log(`  === COMPARISON WITH PART A ===`);
  console.log(`  Part A mantissa: [${formatBytes(partAResult.mantissa)}], A=0x${hexByte(partAResult.a)}`);
  console.log(`  Part B mantissa: [${formatBytes(mantissaAfterB1)}], A=0x${hexByte(finalA_B1)}`);
  console.log(`  Mantissa match: ${mantissaMatch ? 'YES' : 'NO'}`);
  console.log(`  A match: ${aMatch ? 'YES' : 'NO'}`);
  console.log(`  OVERALL: ${mantissaMatch && aMatch ? 'PASS — RLD implementation is CORRECT' : 'FAIL — divergence detected'}`);

  if (!mantissaMatch) {
    // Find first diverging byte
    for (let i = 0; i < 7; i++) {
      if (mantissaAfterB1[i] !== partAResult.mantissa[i]) {
        console.log(`  DIVERGENCE at mantissa byte ${i}: Part A=0x${hexByte(partAResult.mantissa[i])}, Part B=0x${hexByte(mantissaAfterB1[i])}`);
      }
    }
  }
  console.log('');

  // Test B2: gcd input mantissa [00, 83, 12, 00, 00, 00, 00, 00, 00]
  console.log('--- Test B2: gcd input (mantissa = 1200) via transpiled blocks ---');
  const gcdOp1 = [0x00, 0x83, 0x12, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
  mem.set(gcdOp1, OP1_ADDR);

  cpu.madl = 1;
  cpu.mbase = 0xd0;

  console.log(`  OP1 before: [${formatBytes(readBytes(mem, OP1_ADDR, 9))}]`);
  console.log(`  Mantissa before: [${formatBytes(readBytes(mem, OP1_MANTISSA_START, 7))}]`);

  if (block1Exists) {
    console.log(`  Executing block ${key1}...`);
    nextPc = compiledBlocks[key1](cpu);
    console.log(`  After ${key1}: HL=${hex(cpu.hl)}, A=0x${hexByte(cpu.a)}, returned PC=${hex(nextPc)}`);
  } else {
    cpu.hl = OP1_MANTISSA_END;
    cpu.a = 0x00;
  }

  if (block2Exists) {
    console.log(`  Executing block ${key2}...`);
    nextPc = compiledBlocks[key2](cpu);
    console.log(`  Returned PC: ${hex(nextPc)}`);
  }

  const mantissaAfterB2 = readBytes(mem, OP1_MANTISSA_START, 7);
  const finalA_B2 = cpu.a;
  console.log(`  Mantissa after:  [${formatBytes(mantissaAfterB2)}]`);
  console.log(`  Final A: 0x${hexByte(finalA_B2)}`);

  // Also compute what manual RLD chain would give for this input
  // Reset and do manual chain
  mem.set(gcdOp1, OP1_ADDR);
  cpu.hl = OP1_MANTISSA_END;
  cpu.a = 0x00;
  for (let i = 0; i < 7; i++) {
    cpu.rld();
    if (i < 6) cpu.hl = (cpu.hl - 1) & 0xffffff;
  }
  const manualMantissaB2 = readBytes(mem, OP1_MANTISSA_START, 7);
  const manualA_B2 = cpu.a;

  console.log(`  Manual mantissa: [${formatBytes(manualMantissaB2)}]`);
  console.log(`  Manual A: 0x${hexByte(manualA_B2)}`);

  const gcdMatch = mantissaAfterB2.every((b, i) => b === manualMantissaB2[i]) && finalA_B2 === manualA_B2;
  console.log(`  Match: ${gcdMatch ? 'YES' : 'NO'}`);
  console.log('');

  return { mantissaB1: mantissaAfterB1, aB1: finalA_B1 };
}

// --- Part C: ROM byte disassembly ---

function partC() {
  console.log('========================================');
  console.log('PART C: ROM Byte Disassembly');
  console.log('========================================');
  console.log('');

  function disasmRange(startAddr, maxBytes, label) {
    console.log(`--- ${label} ---`);
    console.log(`Address    | ROM Hex            | Mnemonic`);
    console.log(`-----------+--------------------+---------`);

    let pc = startAddr;
    const endAddr = startAddr + maxBytes;

    while (pc < endAddr) {
      let instr;
      try {
        instr = decodeInstruction(romBytes, pc, 'adl');
      } catch (e) {
        const byte = romBytes[pc];
        console.log(`${hex(pc)}   | ${hexByte(byte)}                 | ??? (decode error: ${e.message})`);
        pc++;
        continue;
      }

      if (!instr || instr.length === 0) {
        const byte = romBytes[pc];
        console.log(`${hex(pc)}   | ${hexByte(byte)}                 | ??? (no decode)`);
        pc++;
        continue;
      }

      const instrBytes = readBytes(romBytes, pc, instr.length);
      const hexStr = formatBytes(instrBytes).padEnd(18);

      // Build mnemonic from tag + fields
      let mnemonic = instr.tag || '???';
      if (instr.modePrefix) {
        mnemonic = `${instr.modePrefix} ${mnemonic}`;
      }

      // Add operand details for known instruction types
      if (instr.tag === 'jr' || instr.tag === 'jr-cc') {
        const target = instr.target ?? (pc + instr.length + (instr.offset ?? 0));
        mnemonic += instr.cc ? ` ${instr.cc},` : '';
        mnemonic += ` ${hex(target)}`;
      } else if (instr.tag === 'jp' || instr.tag === 'jp-cc') {
        mnemonic += instr.cc ? ` ${instr.cc},` : '';
        mnemonic += ` ${hex(instr.target ?? instr.value ?? 0)}`;
      } else if (instr.tag === 'call' || instr.tag === 'call-cc') {
        mnemonic += instr.cc ? ` ${instr.cc},` : '';
        mnemonic += ` ${hex(instr.target ?? instr.value ?? 0)}`;
      } else if (instr.tag === 'ret' || instr.tag === 'ret-cc') {
        mnemonic += instr.cc ? ` ${instr.cc}` : '';
      } else if (instr.tag === 'ld-pair-imm') {
        mnemonic += ` ${instr.pair},${hex(instr.value)}`;
      } else if (instr.tag === 'ld-reg-reg') {
        mnemonic += ` ${instr.dest},${instr.src}`;
      } else if (instr.tag === 'ld-reg-imm') {
        mnemonic += ` ${instr.dest},0x${hexByte(instr.value)}`;
      } else if (instr.tag === 'ld-reg-mem') {
        mnemonic += ` ${instr.dest},(${instr.pair || 'hl'})`;
      } else if (instr.tag === 'ld-mem-reg') {
        mnemonic += ` (${instr.pair || 'hl'}),${instr.src}`;
      } else if (instr.tag === 'ld-mem-imm') {
        mnemonic += ` (${hex(instr.addr ?? instr.address ?? 0)}),${instr.src || instr.pair || ''}`;
      } else if (instr.tag === 'dec-pair') {
        mnemonic += ` ${instr.pair}`;
      } else if (instr.tag === 'inc-pair') {
        mnemonic += ` ${instr.pair}`;
      } else if (instr.tag === 'xor') {
        mnemonic += ` ${instr.src || 'a'}`;
      } else if (instr.tag === 'or' || instr.tag === 'and' || instr.tag === 'cp' || instr.tag === 'sub' || instr.tag === 'add') {
        mnemonic += ` ${instr.src || ''}`;
      }

      console.log(`${hex(pc)}   | ${hexStr} | ${mnemonic}`);
      pc = instr.nextPc ?? (pc + instr.length);
    }
    console.log('');
  }

  // Shl14 entry: 0x07FB33 for ~29 bytes (until JR target at 0x07FB50)
  disasmRange(SHL14_ENTRY, 29, 'Shl14 Entry (0x07FB33)');

  // Shl14 chain: 0x07FB50 for ~21 bytes (until RET at 0x07FB64)
  disasmRange(SHL14_CHAIN, 21, 'Shl14 RLD Chain (0x07FB50)');

  // Normalization loop: 0x07CA48 for 64 bytes
  disasmRange(NORM_LOOP, 64, 'Normalization Loop (0x07CA48)');
}

// --- Main ---

function main() {
  console.log('=== Phase 158: Shl14 Transpiled Block Fidelity Check ===');
  console.log('');

  const { mem, executor, cpu } = createRuntime();
  coldBoot(executor, cpu, mem);

  // Part A
  const partAResult = partA(executor, cpu, mem);

  // Part B
  partB(executor, cpu, mem, partAResult);

  // Part C
  partC();

  console.log('=== Phase 158 Complete ===');
}

try {
  main();
} catch (error) {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
}
