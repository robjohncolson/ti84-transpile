#!/usr/bin/env node

/**
 * Phase 158 - Standalone 0x07CA48 normalization loop trace.
 *
 * Calls 0x07CA48 directly (NOT through gcd) with 4 test values:
 *   1. OP1 = 1.0  (exp 0x80, mantissa [10 00 00 00 00 00 00])
 *   2. OP1 = 5.0  (exp 0x80, mantissa [50 00 00 00 00 00 00])
 *   3. OP1 = 12.0 (exp 0x81, mantissa [12 00 00 00 00 00 00])
 *   4. OP1 = 0.5  (exp 0x7F, mantissa [50 00 00 00 00 00 00])
 *
 * For each test, traces every block step with PC, A register, HL, OP1 mantissa,
 * and exponent.  Also decodes ROM bytes at 0x07C9AF (loop exit target).
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
const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08c331;
const POST_INIT_ENTRY = 0x0802b2;
const STACK_RESET_TOP = 0xd1a87e;

const MEMINIT_ENTRY = 0x09dee0;
const MEMINIT_RET = 0x7ffff6;

const USERMEM_ADDR = 0xd1a881;
const EMPTY_VAT_ADDR = 0xd3ffff;

const OP1_ADDR = 0xd005f8;

const ERR_NO_ADDR = 0xd008df;
const ERR_SP_ADDR = 0xd008e0;

const FPSBASE_ADDR = 0xd0258a;
const FPS_ADDR = 0xd0258d;
const OPBASE_ADDR = 0xd02590;
const OPS_ADDR = 0xd02593;
const PTEMPCNT_ADDR = 0xd02596;
const PTEMP_ADDR = 0xd0259a;
const PROGPTR_ADDR = 0xd0259d;
const NEWDATA_PTR_ADDR = 0xd025a0;

const FP_CATEGORY_ADDR = 0xd0060e;

const NORM_ENTRY = 0x07ca48;
const SHL14_ADDR = 0x07fb33;
const DEC_EXP_ADDR = 0x07fdf1;
const VALIDITY_CHECK_ADDR = 0x07fd4a;
const LOOP_EXIT_ADDR = 0x07c9af;
const FPDIV_ENTRY = 0x07cab9;

const FAKE_RET = 0x7ffffe;
const ERR_CATCH_ADDR = 0x7ffffa;

const MEMINIT_BUDGET = 100000;
const MAX_LOOP_ITER = 8192;
const MAX_STEPS = 500;

const FPS_CLEAN_AREA = 0xd1aa00;

// --- Helpers ---

const hex = (value, width = 6) =>
  value === undefined || value === null
    ? 'n/a'
    : `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;

const hexByte = (value) =>
  (value & 0xff).toString(16).toUpperCase().padStart(2, '0');

function read24(mem, addr) {
  return ((mem[addr] & 0xff) | ((mem[addr + 1] & 0xff) << 8) | ((mem[addr + 2] & 0xff) << 16)) >>> 0;
}

function write24(mem, addr, value) {
  mem[addr] = value & 0xff;
  mem[addr + 1] = (value >>> 8) & 0xff;
  mem[addr + 2] = (value >>> 16) & 0xff;
}

function readBytes(mem, addr, len) {
  return Array.from(mem.subarray(addr, addr + len), (byte) => byte & 0xff);
}

function formatBytes(bytes) {
  return bytes.map((byte) => hexByte(byte)).join(' ');
}

function decodeBcdRealBytes(bytes) {
  const type = bytes[0] & 0xff;
  const exponentByte = bytes[1] & 0xff;
  const digits = [];

  for (let i = 2; i < 9; i++) {
    const byte = bytes[i] & 0xff;
    digits.push((byte >> 4) & 0x0f, byte & 0x0f);
  }

  if (digits.every((digit) => digit === 0)) {
    return '0';
  }

  if (digits.some((digit) => digit > 9)) {
    return `invalid-bcd(type=${hexByte(type)},exp=${hexByte(exponentByte)})`;
  }

  const exponent = exponentByte - 0x80;
  const pointIndex = exponent + 1;
  const rawDigits = digits.join('');
  let rendered;

  if (pointIndex <= 0) {
    rendered = `0.${'0'.repeat(-pointIndex)}${rawDigits}`;
  } else if (pointIndex >= rawDigits.length) {
    rendered = rawDigits + '0'.repeat(pointIndex - rawDigits.length);
  } else {
    rendered = `${rawDigits.slice(0, pointIndex)}.${rawDigits.slice(pointIndex)}`;
  }

  rendered = rendered.replace(/^0+(?=\d)/, '');
  rendered = rendered.replace(/(\.\d*?[1-9])0+$/, '$1');
  rendered = rendered.replace(/\.0*$/, '');

  if (rendered.startsWith('.')) {
    rendered = `0${rendered}`;
  }

  if (rendered === '') {
    rendered = '0';
  }

  if ((type & 0x80) !== 0 && rendered !== '0') {
    rendered = `-${rendered}`;
  }

  return rendered;
}

function errName(code) {
  if (code === 0x00) return 'none';
  if (code === 0x80) return 'E_Edit';
  if (code === 0x81) return 'E_Overflow';
  if (code === 0x84) return 'E_Domain';
  if (code === 0x88) return 'E_Syntax';
  if (code === 0x8d) return 'E_Undefined';
  return `unknown(${hex(code, 2)})`;
}

function noteStep(stepCount, step) {
  if (typeof step === 'number') {
    return Math.max(stepCount, step + 1);
  }
  return stepCount + 1;
}

// Known address labels for trace readability
const ADDR_LABELS = new Map([
  [NORM_ENTRY, 'NormEntry'],
  [SHL14_ADDR, 'Shl14'],
  [DEC_EXP_ADDR, 'DecExp'],
  [VALIDITY_CHECK_ADDR, 'ValidityChk'],
  [LOOP_EXIT_ADDR, 'LoopExit'],
  [FPDIV_ENTRY, 'FPDiv'],
  [FAKE_RET, 'FAKE_RET'],
  [ERR_CATCH_ADDR, 'ERR_CATCH'],
  [0x07ca4c, 'Norm+4(RETZ)'],
  [0x07ca4d, 'Norm+5(XORA)'],
  [0x07ca52, 'Norm+A(LdExp)'],
  [0x07ca56, 'Norm+E(SUB80)'],
  [0x07ca58, 'Norm+10(RETC)'],
  [0x07ca59, 'Norm+11(CP0F)'],
  [0x07ca5b, 'Norm+13(JRC)'],
  [0x07ca5d, 'Norm+15(JR42)'],
  [0x07ca5f, 'LoopTop'],
  [0x07ca63, 'LoopCP80'],
  [0x07ca65, 'LoopJPC'],
  [0x07ca69, 'LoopShift'],
  [0x07ca6d, 'LoopDecExp'],
  [0x07ca71, 'LoopJR'],
  [0x07caa1, 'BigShift'],
]);

function addrLabel(addr) {
  const label = ADDR_LABELS.get(addr);
  return label ? ` [${label}]` : '';
}

// --- Runtime setup (copied from phase 157) ---

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

function prepareCallState(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = 0xd0;
  cpu._iy = 0xd00080;
  cpu.f = 0x40;
  cpu._ix = 0xd1a860;
  cpu.sp = STACK_RESET_TOP - 12;
  mem.fill(0xff, cpu.sp, cpu.sp + 12);
}

function seedErrFrame(cpu, mem, ret, errRet = ERR_CATCH_ADDR, prev = 0) {
  cpu.sp -= 3;
  write24(mem, cpu.sp, ret);
  const base = (cpu.sp - 6) & 0xffffff;
  write24(mem, base, errRet);
  write24(mem, base + 3, prev);
  write24(mem, ERR_SP_ADDR, base);
  mem[ERR_NO_ADDR] = 0x00;
}

function seedAllocator(mem) {
  write24(mem, OPBASE_ADDR, EMPTY_VAT_ADDR);
  write24(mem, OPS_ADDR, EMPTY_VAT_ADDR);
  mem.fill(0x00, PTEMPCNT_ADDR, PTEMPCNT_ADDR + 4);
  write24(mem, PTEMP_ADDR, EMPTY_VAT_ADDR);
  write24(mem, PROGPTR_ADDR, EMPTY_VAT_ADDR);
  write24(mem, FPSBASE_ADDR, USERMEM_ADDR);
  write24(mem, FPS_ADDR, USERMEM_ADDR);
  write24(mem, NEWDATA_PTR_ADDR, USERMEM_ADDR);
}

function seedRealRegister(mem, addr, bytes) {
  mem.fill(0x00, addr, addr + 11);
  mem.set(bytes, addr);
}

function runMemInit(executor, cpu, mem) {
  prepareCallState(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEMINIT_RET);

  let ok = false;

  try {
    executor.runFrom(MEMINIT_ENTRY, 'adl', {
      maxSteps: MEMINIT_BUDGET,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc) {
        if ((pc & 0xffffff) === MEMINIT_RET) throw new Error('__RET__');
      },
      onMissingBlock(pc) {
        if ((pc & 0xffffff) === MEMINIT_RET) throw new Error('__RET__');
      },
    });
  } catch (error) {
    if (error?.message === '__RET__') {
      ok = true;
    } else {
      throw error;
    }
  }

  return ok;
}

function createPreparedRuntime() {
  const runtime = createRuntime();
  coldBoot(runtime.executor, runtime.cpu, runtime.mem);
  const memInitOk = runMemInit(runtime.executor, runtime.cpu, runtime.mem);
  return { ...runtime, memInitOk };
}

// --- Disassembly helper (for 0x07C9AF dump) ---

function decodeRange(startAddr, endAddr) {
  const entries = [];
  let pc = startAddr;

  while (pc < endAddr) {
    try {
      const instr = decodeInstruction(romBytes, pc, 'adl');
      const length = Math.max(instr.length || 1, 1);
      const bytes = [];
      for (let i = 0; i < length; i++) {
        bytes.push(hexByte(romBytes[pc + i] ?? 0));
      }
      entries.push({
        pc,
        bytes: bytes.join(' '),
        tag: instr.tag,
        text: formatInstructionSimple(instr),
        length,
      });
      pc += length;
    } catch (error) {
      entries.push({
        pc,
        bytes: hexByte(romBytes[pc] ?? 0),
        tag: 'error',
        text: `decode-error: ${error?.message ?? error}`,
        length: 1,
      });
      pc += 1;
    }
  }

  return entries;
}

function formatInstructionSimple(instr) {
  // Minimal formatter — just enough for the disassembly dump
  const prefix = instr.modePrefix ? `.${instr.modePrefix} ` : '';
  const tag = instr.tag;

  if (tag === 'call') return `${prefix}call ${hex(instr.target)}`;
  if (tag === 'call-conditional') return `${prefix}call ${instr.condition}, ${hex(instr.target)}`;
  if (tag === 'jp') return `${prefix}jp ${hex(instr.target)}`;
  if (tag === 'jp-conditional') return `${prefix}jp ${instr.condition}, ${hex(instr.target)}`;
  if (tag === 'jp-indirect') return `${prefix}jp (${instr.indirectRegister})`;
  if (tag === 'jr') return `${prefix}jr ${hex(instr.target)}`;
  if (tag === 'jr-conditional') return `${prefix}jr ${instr.condition}, ${hex(instr.target)}`;
  if (tag === 'ret') return `${prefix}ret`;
  if (tag === 'ret-conditional') return `${prefix}ret ${instr.condition}`;
  if (tag === 'ld-reg-mem') return `${prefix}ld ${instr.dest}, (${hex(instr.addr)})`;
  if (tag === 'ld-mem-reg') return `${prefix}ld (${hex(instr.addr)}), ${instr.src}`;
  if (tag === 'ld-reg-imm') return `${prefix}ld ${instr.dest}, ${hexByte(instr.value)}`;
  if (tag === 'ld-reg-reg') return `${prefix}ld ${instr.dest}, ${instr.src}`;
  if (tag === 'ld-pair-imm') return `${prefix}ld ${instr.pair}, ${hex(instr.value)}`;
  if (tag === 'ld-reg-ind') return `${prefix}ld ${instr.dest}, (${instr.src})`;
  if (tag === 'ld-ind-reg') return `${prefix}ld (${instr.dest}), ${instr.src}`;
  if (tag === 'alu-imm') return `${prefix}${instr.op} ${hexByte(instr.value)}`;
  if (tag === 'alu-reg') return `${prefix}${instr.op} ${instr.src}`;
  if (tag === 'push') return `${prefix}push ${instr.pair}`;
  if (tag === 'pop') return `${prefix}pop ${instr.pair}`;
  if (tag === 'inc-reg') return `${prefix}inc ${instr.reg}`;
  if (tag === 'dec-reg') return `${prefix}dec ${instr.reg}`;
  if (tag === 'inc-pair') return `${prefix}inc ${instr.pair}`;
  if (tag === 'dec-pair') return `${prefix}dec ${instr.pair}`;
  if (tag === 'add-pair') return `${prefix}add ${instr.dest}, ${instr.src}`;
  if (tag === 'ex-de-hl') return `${prefix}ex de, hl`;
  if (tag === 'ldir') return `${prefix}ldir`;
  if (tag === 'ldi') return `${prefix}ldi`;
  if (tag === 'nop') return `${prefix}nop`;
  if (tag === 'xor-a' || (tag === 'alu-reg' && instr.op === 'xor' && instr.src === 'a')) return `${prefix}xor a`;
  if (tag === 'djnz') return `${prefix}djnz ${hex(instr.target)}`;
  if (tag === 'rst') return `${prefix}rst ${hex(instr.target)}`;
  if (tag === 'scf') return `${prefix}scf`;
  if (tag === 'ccf') return `${prefix}ccf`;
  if (tag === 'cpl') return `${prefix}cpl`;
  if (tag === 'rla') return `${prefix}rla`;
  if (tag === 'rra') return `${prefix}rra`;
  if (tag === 'rlca') return `${prefix}rlca`;
  if (tag === 'rrca') return `${prefix}rrca`;
  if (tag === 'halt') return `${prefix}halt`;
  if (tag === 'di') return `${prefix}di`;
  if (tag === 'ei') return `${prefix}ei`;

  return `${prefix}${tag}`;
}

// --- Test case definitions ---

const TEST_CASES = [
  {
    name: 'OP1 = 1.0 (exp 0x80)',
    bytes: Uint8Array.from([0x00, 0x80, 0x10, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
    expectedShifts: 1,
    expectedPreserved: false,
  },
  {
    name: 'OP1 = 5.0 (exp 0x80)',
    bytes: Uint8Array.from([0x00, 0x80, 0x50, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
    expectedShifts: 1,
    expectedPreserved: false,
  },
  {
    name: 'OP1 = 12.0 (exp 0x81)',
    bytes: Uint8Array.from([0x00, 0x81, 0x12, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
    expectedShifts: 2,
    expectedPreserved: false,
  },
  {
    name: 'OP1 = 0.5 (exp 0x7F)',
    bytes: Uint8Array.from([0x00, 0x7f, 0x50, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
    expectedShifts: 0,
    expectedPreserved: true,
  },
];

// --- Run a single test case ---

function runTestCase(runtime, testCase, testIndex) {
  const { mem, executor, cpu } = runtime;

  console.log(`\n${'='.repeat(70)}`);
  console.log(`Test ${testIndex + 1}: ${testCase.name}`);
  console.log(`${'='.repeat(70)}`);

  // Reset state for this test
  prepareCallState(cpu, mem);
  seedAllocator(mem);
  mem.fill(0x00, FPS_CLEAN_AREA, FPS_CLEAN_AREA + 0x40);
  write24(mem, FPSBASE_ADDR, FPS_CLEAN_AREA);
  write24(mem, FPS_ADDR, FPS_CLEAN_AREA);

  // Set OP1
  seedRealRegister(mem, OP1_ADDR, testCase.bytes);

  // Set up the FP category (real number)
  mem[FP_CATEGORY_ADDR] = 0x00;

  // Push FAKE_RET as return address
  seedErrFrame(cpu, mem, FAKE_RET, ERR_CATCH_ADDR, 0);

  const initialOp1 = readBytes(mem, OP1_ADDR, 9);
  console.log(`  Initial OP1: [${formatBytes(initialOp1)}] = ${decodeBcdRealBytes(initialOp1)}`);
  console.log(`  Initial exp: ${hexByte(mem[OP1_ADDR + 1])}`);
  console.log(`  SP: ${hex(cpu.sp)}`);
  console.log('');

  let stepCount = 0;
  let outcome = 'budget';
  let lastMissingBlock = null;
  let thrownMessage = null;
  let shiftCount = 0;

  // Track calls to known addresses
  const callLog = [];

  try {
    executor.runFrom(NORM_ENTRY, 'adl', {
      maxSteps: MAX_STEPS,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc, mode, meta, step) {
        const norm = pc & 0xffffff;
        stepCount = noteStep(stepCount, step);

        // Read current state
        const a = cpu.a & 0xff;
        const hl = (cpu._hl ?? 0) & 0xffffff;
        const exp = mem[OP1_ADDR + 1] & 0xff;
        const mantissa = readBytes(mem, OP1_ADDR + 2, 7);
        const f = cpu.f & 0xff;

        const flagStr = [
          (f & 0x80) ? 'S' : '-',
          (f & 0x40) ? 'Z' : '-',
          (f & 0x10) ? 'H' : '-',
          (f & 0x04) ? 'P' : '-',
          (f & 0x02) ? 'N' : '-',
          (f & 0x01) ? 'C' : '-',
        ].join('');

        console.log(
          `  Step ${String(stepCount).padStart(3)}: PC=${hex(norm)}${addrLabel(norm).padEnd(16)}  ` +
          `A=${hexByte(a)} F=${flagStr}  HL=${hex(hl)}  ` +
          `exp=${hexByte(exp)} mant=[${formatBytes(mantissa)}]`
        );

        // Track Shl14 calls
        if (norm === SHL14_ADDR) {
          shiftCount++;
          callLog.push({ step: stepCount, event: 'CALL Shl14', exp });
        }
        if (norm === DEC_EXP_ADDR) {
          callLog.push({ step: stepCount, event: 'CALL DecExp', exp });
        }
        if (norm === VALIDITY_CHECK_ADDR) {
          callLog.push({ step: stepCount, event: 'CALL ValidityChk', exp });
        }
        if (norm === LOOP_EXIT_ADDR) {
          callLog.push({ step: stepCount, event: 'JP LoopExit (0x07C9AF)', exp });
        }
        if (norm === FPDIV_ENTRY) {
          callLog.push({ step: stepCount, event: 'Entered FPDiv (0x07CAB9)!', exp });
        }

        if (norm === FAKE_RET) throw new Error('__RET__');
        if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');
      },
      onMissingBlock(pc, mode, step) {
        const norm = pc & 0xffffff;
        stepCount = noteStep(stepCount, step);
        lastMissingBlock = norm;

        console.log(
          `  Step ${String(stepCount).padStart(3)}: PC=${hex(norm)} [MISSING]${addrLabel(norm)}`
        );

        if (norm === FAKE_RET) throw new Error('__RET__');
        if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');
      },
    });
  } catch (error) {
    if (error?.message === '__RET__') {
      outcome = 'return';
    } else if (error?.message === '__ERR__') {
      outcome = 'error';
    } else {
      outcome = 'threw';
      thrownMessage = error?.stack || String(error);
    }
  }

  // Final state
  const finalOp1 = readBytes(mem, OP1_ADDR, 9);
  const finalExp = mem[OP1_ADDR + 1] & 0xff;
  const finalMantissa = readBytes(mem, OP1_ADDR + 2, 7);
  const mantissaPreserved = finalMantissa.some((b) => b !== 0);

  console.log('');
  console.log(`  --- Result ---`);
  console.log(`  Outcome: ${outcome}`);
  console.log(`  Steps: ${stepCount}`);
  console.log(`  Shift count (Shl14 calls): ${shiftCount}`);
  console.log(`  Final OP1: [${formatBytes(finalOp1)}] = ${decodeBcdRealBytes(finalOp1)}`);
  console.log(`  Final exp: ${hexByte(finalExp)}, mantissa: [${formatBytes(finalMantissa)}]`);
  console.log(`  Mantissa preserved: ${mantissaPreserved}`);
  console.log(`  errNo: ${hexByte(mem[ERR_NO_ADDR] & 0xff)} (${errName(mem[ERR_NO_ADDR] & 0xff)})`);

  if (callLog.length > 0) {
    console.log('');
    console.log('  Call/event log:');
    for (const entry of callLog) {
      console.log(`    Step ${entry.step}: ${entry.event} (exp=${hexByte(entry.exp)})`);
    }
  }

  if (lastMissingBlock !== null) {
    console.log(`  Last missing block: ${hex(lastMissingBlock)}`);
  }
  if (thrownMessage) {
    console.log(`  Thrown: ${thrownMessage.split('\n')[0]}`);
  }

  // Verify against expectations
  console.log('');
  const shiftOk = shiftCount === testCase.expectedShifts;
  const preserveOk = mantissaPreserved === testCase.expectedPreserved;
  console.log(`  Expected shifts: ${testCase.expectedShifts}, got: ${shiftCount} ${shiftOk ? 'OK' : 'MISMATCH'}`);
  console.log(`  Expected preserved: ${testCase.expectedPreserved}, got: ${mantissaPreserved} ${preserveOk ? 'OK' : 'MISMATCH'}`);

  return { shiftCount, mantissaPreserved, outcome, shiftOk, preserveOk };
}

// --- Dump 0x07C9AF disassembly ---

function dumpLoopExitTarget() {
  console.log(`\n${'='.repeat(70)}`);
  console.log('Disassembly of 0x07C9AF (loop exit target) — 16 bytes');
  console.log(`${'='.repeat(70)}`);

  const rawBytes = [];
  for (let i = 0; i < 16; i++) {
    rawBytes.push(hexByte(romBytes[LOOP_EXIT_ADDR + i] ?? 0));
  }
  console.log(`  Raw bytes: ${rawBytes.join(' ')}`);
  console.log('');

  const entries = decodeRange(LOOP_EXIT_ADDR, LOOP_EXIT_ADDR + 16);
  for (const entry of entries) {
    const ann = addrLabel(entry.pc);
    console.log(`  ${hex(entry.pc)}  ${entry.bytes.padEnd(20)}  ${entry.text}${ann}`);
  }
}

// --- Main ---

function main() {
  console.log('=== Phase 158: Standalone 0x07CA48 Normalization Loop Trace ===');
  console.log('');

  const runtime = createPreparedRuntime();

  if (!runtime.memInitOk) {
    console.log('MEM_INIT failed; aborting.');
    process.exitCode = 1;
    return;
  }

  console.log('Cold boot + MEM_INIT complete.');

  // Run all 4 test cases
  const results = [];
  for (let i = 0; i < TEST_CASES.length; i++) {
    const result = runTestCase(runtime, TEST_CASES[i], i);
    results.push(result);
  }

  // Dump loop exit target disassembly
  dumpLoopExitTarget();

  // Summary
  console.log(`\n${'='.repeat(70)}`);
  console.log('=== SUMMARY ===');
  console.log(`${'='.repeat(70)}`);

  for (let i = 0; i < TEST_CASES.length; i++) {
    const tc = TEST_CASES[i];
    const r = results[i];
    const status = (r.shiftOk && r.preserveOk) ? 'PASS' : 'FAIL';
    console.log(
      `  ${status} Test ${i + 1}: ${tc.name} — ` +
      `shifts=${r.shiftCount}, preserved=${r.mantissaPreserved}, outcome=${r.outcome}`
    );
  }

  // Analysis questions
  console.log('');
  console.log('=== Analysis ===');
  console.log('Q1: Does 0x07FD4A (validity check) set Z for any test values?');
  console.log('    -> Check the step traces above. If ValidityChk is called and the');
  console.log('       next step shows RET Z being taken, that test value triggers Z.');
  console.log('');
  console.log('Q2: What does 0x07C9AF (loop exit) do?');
  console.log('    -> See disassembly dump above.');
  console.log('');
  console.log('Q3: Is there a path where normalization PRESERVES the mantissa?');

  // Check test 4 (0.5) result
  const test4 = results[3];
  if (test4.mantissaPreserved && test4.shiftCount === 0) {
    console.log('    -> YES: Test 4 (OP1=0.5, exp=0x7F) preserves mantissa via RET C');
    console.log('       because SUB 0x80 on exp=0x7F sets carry (0xFF < 0x80 unsigned = false,');
    console.log('       but 0x7F - 0x80 = borrow = carry set).');
  } else {
    console.log(`    -> Test 4 result: shifts=${test4.shiftCount}, preserved=${test4.mantissaPreserved}`);
  }

  // Check if any exp=0x80 test preserves mantissa
  const test1 = results[0];
  if (test1.mantissaPreserved) {
    console.log('    -> Test 1 (exp=0x80): mantissa preserved despite entering loop.');
  } else {
    console.log('    -> NO path preserves mantissa for exp >= 0x80 — the shift always');
    console.log('       runs at least once, destroying leading BCD digits.');
  }

  console.log('\nDone.');
}

try {
  main();
} catch (error) {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
}
