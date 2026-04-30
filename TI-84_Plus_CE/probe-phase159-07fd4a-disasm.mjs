#!/usr/bin/env node

/**
 * Phase 159 - Disassemble and trace 0x07FD4A (validity check routine).
 *
 * Part A: Static ROM disassembly of 0x07FD4A
 * Part B: Dynamic trace with gcd-relevant inputs (OP1 = 1200, exp 0x83)
 * Part C: Compare Z flag behavior across multiple OP1 values
 *
 * Goal: understand what 0x07FD4A checks, and when (if ever) it sets Z.
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

const VALIDITY_CHECK_ADDR = 0x07fd4a;

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

function noteStep(stepCount, step) {
  if (typeof step === 'number') {
    return Math.max(stepCount, step + 1);
  }
  return stepCount + 1;
}

// --- Disassembly formatting ---

function formatInstructionSimple(instr) {
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
  if (tag === 'bit') return `${prefix}bit ${instr.bit}, ${instr.reg}`;
  if (tag === 'set') return `${prefix}set ${instr.bit}, ${instr.reg}`;
  if (tag === 'res') return `${prefix}res ${instr.bit}, ${instr.reg}`;
  if (tag === 'sla') return `${prefix}sla ${instr.reg}`;
  if (tag === 'sra') return `${prefix}sra ${instr.reg}`;
  if (tag === 'srl') return `${prefix}srl ${instr.reg}`;
  if (tag === 'rl') return `${prefix}rl ${instr.reg}`;
  if (tag === 'rr') return `${prefix}rr ${instr.reg}`;
  if (tag === 'rlc') return `${prefix}rlc ${instr.reg}`;
  if (tag === 'rrc') return `${prefix}rrc ${instr.reg}`;
  if (tag === 'daa') return `${prefix}daa`;
  if (tag === 'neg') return `${prefix}neg`;
  if (tag === 'im') return `${prefix}im ${instr.mode}`;
  if (tag === 'reti') return `${prefix}reti`;
  if (tag === 'retn') return `${prefix}retn`;
  if (tag === 'cpir') return `${prefix}cpir`;
  if (tag === 'cpdr') return `${prefix}cpdr`;
  if (tag === 'lddr') return `${prefix}lddr`;
  if (tag === 'inir') return `${prefix}inir`;
  if (tag === 'otir') return `${prefix}otir`;
  if (tag === 'in-reg-c') return `${prefix}in ${instr.reg}, (c)`;
  if (tag === 'out-c-reg') return `${prefix}out (c), ${instr.reg}`;
  if (tag === 'ex-sp-hl') return `${prefix}ex (sp), hl`;
  if (tag === 'ex-af-af') return `${prefix}ex af, af'`;
  if (tag === 'exx') return `${prefix}exx`;
  if (tag === 'cp-imm') return `${prefix}cp ${hexByte(instr.value)}`;

  return `${prefix}${tag}`;
}

// --- Disassembly range ---

function decodeRange(startAddr, count) {
  const entries = [];
  let pc = startAddr;
  let instrCount = 0;

  while (instrCount < count) {
    try {
      const instr = decodeInstruction(romBytes, pc, 'adl');
      const length = Math.max(instr.length || 1, 1);
      const bytes = [];
      for (let i = 0; i < length; i++) {
        bytes.push(hexByte(romBytes[pc + i] ?? 0));
      }
      const text = formatInstructionSimple(instr);
      entries.push({ pc, bytes: bytes.join(' '), tag: instr.tag, text, length });
      pc += length;
      instrCount++;

      // Stop at unconditional RET or JP (function boundary)
      if (instr.tag === 'ret' || instr.tag === 'jp') {
        // Continue a few more to show what follows
        if (instrCount >= count - 5) break;
      }
    } catch (error) {
      entries.push({
        pc,
        bytes: hexByte(romBytes[pc] ?? 0),
        tag: 'error',
        text: `decode-error: ${error?.message ?? error}`,
        length: 1,
      });
      pc += 1;
      instrCount++;
    }
  }

  return entries;
}

// --- Runtime setup (from phase 158) ---

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

// --- Part A: Static disassembly of 0x07FD4A ---

function partA() {
  console.log('='.repeat(70));
  console.log('PART A: Static ROM disassembly of 0x07FD4A');
  console.log('='.repeat(70));
  console.log('');

  // Show raw bytes first
  const rawLen = 64;
  const rawBytes = [];
  for (let i = 0; i < rawLen; i++) {
    rawBytes.push(hexByte(romBytes[VALIDITY_CHECK_ADDR + i] ?? 0));
  }
  console.log(`  Raw bytes at ${hex(VALIDITY_CHECK_ADDR)} (${rawLen} bytes):`);
  for (let i = 0; i < rawLen; i += 16) {
    const slice = rawBytes.slice(i, i + 16);
    console.log(`    ${hex(VALIDITY_CHECK_ADDR + i)}:  ${slice.join(' ')}`);
  }
  console.log('');

  // Disassemble
  const entries = decodeRange(VALIDITY_CHECK_ADDR, 40);
  console.log('  Disassembly:');
  console.log('  ' + '-'.repeat(66));
  for (const entry of entries) {
    const addr = hex(entry.pc);
    const bytes = entry.bytes.padEnd(24);
    const annot = annotateInstruction(entry);
    console.log(`  ${addr}  ${bytes}  ${entry.text}${annot}`);
  }
  console.log('');

  return entries;
}

function annotateInstruction(entry) {
  const notes = [];
  if (entry.tag === 'ret') notes.push('<-- unconditional RET');
  if (entry.tag === 'ret-conditional') notes.push('<-- conditional RET');
  if (entry.tag === 'jp' || entry.tag === 'jp-conditional') notes.push('<-- branch');
  if (entry.tag === 'jr' || entry.tag === 'jr-conditional') notes.push('<-- branch');
  if (entry.tag === 'call' || entry.tag === 'call-conditional') notes.push('<-- call');
  if (entry.text.includes('cp ') || entry.text.includes('or ') || entry.text.includes('and ') ||
      entry.text.includes('xor ') || entry.text.includes('bit ') || entry.text.includes('sub ')) {
    notes.push('<-- sets flags');
  }
  if (notes.length === 0) return '';
  return '    ; ' + notes.join(', ');
}

// --- Part B: Dynamic trace of 0x07FD4A with gcd inputs ---

function partB(runtime) {
  const { mem, executor, cpu } = runtime;

  console.log('='.repeat(70));
  console.log('PART B: Dynamic trace of 0x07FD4A with gcd inputs (1200)');
  console.log('='.repeat(70));
  console.log('');

  // Seed OP1 = 1200 (type=0x00, exp=0x83, mantissa=[12 00 00 00 00 00 00])
  prepareCallState(cpu, mem);
  seedAllocator(mem);
  mem.fill(0x00, FPS_CLEAN_AREA, FPS_CLEAN_AREA + 0x40);
  write24(mem, FPSBASE_ADDR, FPS_CLEAN_AREA);
  write24(mem, FPS_ADDR, FPS_CLEAN_AREA);
  mem[FP_CATEGORY_ADDR] = 0x00;

  const op1Bytes = Uint8Array.from([0x00, 0x83, 0x12, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
  seedRealRegister(mem, OP1_ADDR, op1Bytes);

  // Push FAKE_RET
  seedErrFrame(cpu, mem, FAKE_RET, ERR_CATCH_ADDR, 0);

  // Log entry state
  console.log('  OP1 = 1200 (type=0x00, exp=0x83, mantissa=[12 00 00 00 00 00 00])');
  console.log(`  Entry registers:`);
  console.log(`    A=${hexByte(cpu.a)} F=${hexByte(cpu.f)} BC=${hex(cpu._bc)} DE=${hex(cpu._de)} HL=${hex(cpu._hl)}`);
  console.log(`    SP=${hex(cpu.sp)} PC will be set to ${hex(VALIDITY_CHECK_ADDR)}`);
  console.log(`    OP1 bytes: [${formatBytes(readBytes(mem, OP1_ADDR, 9))}]`);
  console.log('');

  // Track memory reads/writes
  const memAccesses = [];
  let stepCount = 0;
  let outcome = 'budget';

  try {
    executor.runFrom(VALIDITY_CHECK_ADDR, 'adl', {
      maxSteps: MAX_STEPS,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc, mode, meta, step) {
        const norm = pc & 0xffffff;
        stepCount = noteStep(stepCount, step);

        const a = cpu.a & 0xff;
        const f = cpu.f & 0xff;
        const bc = (cpu._bc ?? 0) & 0xffffff;
        const de = (cpu._de ?? 0) & 0xffffff;
        const hl = (cpu._hl ?? 0) & 0xffffff;

        const flagStr = [
          (f & 0x80) ? 'S' : '-',
          (f & 0x40) ? 'Z' : '-',
          (f & 0x10) ? 'H' : '-',
          (f & 0x04) ? 'P' : '-',
          (f & 0x02) ? 'N' : '-',
          (f & 0x01) ? 'C' : '-',
        ].join('');

        console.log(
          `  Step ${String(stepCount).padStart(3)}: PC=${hex(norm)}  ` +
          `A=${hexByte(a)} F=${flagStr}  BC=${hex(bc)} DE=${hex(de)} HL=${hex(hl)}  SP=${hex(cpu.sp)}`
        );

        if (norm === FAKE_RET) throw new Error('__RET__');
        if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');
      },
      onMissingBlock(pc, mode, step) {
        const norm = pc & 0xffffff;
        stepCount = noteStep(stepCount, step);
        console.log(`  Step ${String(stepCount).padStart(3)}: PC=${hex(norm)} [MISSING BLOCK]`);
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
      console.log(`  THREW: ${error?.message}`);
    }
  }

  // Log exit state
  const f = cpu.f & 0xff;
  const zFlag = (f & 0x40) !== 0;
  console.log('');
  console.log('  Exit state:');
  console.log(`    Outcome: ${outcome}`);
  console.log(`    A=${hexByte(cpu.a)} F=${hexByte(f)} (Z=${zFlag ? '1' : '0'}, C=${(f & 0x01) ? '1' : '0'}, S=${(f & 0x80) ? '1' : '0'})`);
  console.log(`    BC=${hex(cpu._bc)} DE=${hex(cpu._de)} HL=${hex(cpu._hl)}`);
  console.log(`    Steps: ${stepCount}`);
  console.log(`    Z FLAG AT EXIT: ${zFlag ? 'SET (normalization would be SKIPPED)' : 'CLEAR (normalization proceeds)'}`);
  console.log(`    OP1 after: [${formatBytes(readBytes(mem, OP1_ADDR, 9))}]`);
  console.log('');
}

// --- Part C: Compare with different inputs ---

function partC(runtime) {
  const { mem, executor, cpu } = runtime;

  console.log('='.repeat(70));
  console.log('PART C: Z flag behavior across multiple OP1 values');
  console.log('='.repeat(70));
  console.log('');

  const testCases = [
    {
      name: 'OP1 = 0.5 (exp 0x7F)',
      bytes: Uint8Array.from([0x00, 0x7f, 0x50, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
    },
    {
      name: 'OP1 = 0.0 (exp 0x80, mantissa all zeros)',
      bytes: Uint8Array.from([0x00, 0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
    },
    {
      name: 'OP1 = 1.0 (exp 0x80)',
      bytes: Uint8Array.from([0x00, 0x80, 0x10, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
    },
    {
      name: 'OP1 = 1200 (exp 0x83) [gcd input]',
      bytes: Uint8Array.from([0x00, 0x83, 0x12, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
    },
    {
      name: 'OP1 = -5.0 (type 0x80, exp 0x80)',
      bytes: Uint8Array.from([0x80, 0x80, 0x50, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
    },
    {
      name: 'OP1 = complex (type 0x0C, exp 0x80)',
      bytes: Uint8Array.from([0x0c, 0x80, 0x10, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
    },
    {
      name: 'OP1 = list (type 0x01)',
      bytes: Uint8Array.from([0x01, 0x80, 0x10, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
    },
    {
      name: 'OP1 = zero special (type 0x00, exp 0x00, mantissa zeros)',
      bytes: Uint8Array.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
    },
  ];

  const results = [];

  for (let i = 0; i < testCases.length; i++) {
    const tc = testCases[i];

    // Reset state
    prepareCallState(cpu, mem);
    seedAllocator(mem);
    mem.fill(0x00, FPS_CLEAN_AREA, FPS_CLEAN_AREA + 0x40);
    write24(mem, FPSBASE_ADDR, FPS_CLEAN_AREA);
    write24(mem, FPS_ADDR, FPS_CLEAN_AREA);
    mem[FP_CATEGORY_ADDR] = 0x00;

    seedRealRegister(mem, OP1_ADDR, tc.bytes);
    seedErrFrame(cpu, mem, FAKE_RET, ERR_CATCH_ADDR, 0);

    let stepCount = 0;
    let outcome = 'budget';
    const blocksVisited = [];

    try {
      executor.runFrom(VALIDITY_CHECK_ADDR, 'adl', {
        maxSteps: MAX_STEPS,
        maxLoopIterations: MAX_LOOP_ITER,
        onBlock(pc, mode, meta, step) {
          const norm = pc & 0xffffff;
          stepCount = noteStep(stepCount, step);
          blocksVisited.push(norm);

          if (norm === FAKE_RET) throw new Error('__RET__');
          if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');
        },
        onMissingBlock(pc, mode, step) {
          const norm = pc & 0xffffff;
          stepCount = noteStep(stepCount, step);
          blocksVisited.push(norm);
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
      }
    }

    const f = cpu.f & 0xff;
    const a = cpu.a & 0xff;
    const zFlag = (f & 0x40) !== 0;
    const cFlag = (f & 0x01) !== 0;

    results.push({ name: tc.name, zFlag, cFlag, a, f, outcome, stepCount, blocksVisited });

    console.log(
      `  Test ${i + 1}: ${tc.name}`
    );
    console.log(
      `    A=${hexByte(a)} F=${hexByte(f)} Z=${zFlag ? '1' : '0'} C=${cFlag ? '1' : '0'}  ` +
      `outcome=${outcome} steps=${stepCount}  blocks=[${blocksVisited.map(b => hex(b)).join(', ')}]`
    );
    console.log(`    Z FLAG: ${zFlag ? 'SET --> normalization SKIPPED' : 'CLEAR --> normalization PROCEEDS'}`);
    console.log('');
  }

  // Summary table
  console.log('  ' + '-'.repeat(66));
  console.log('  SUMMARY:');
  console.log('  ' + '-'.repeat(66));
  console.log('  Input                                    | Z | C | A    | Outcome');
  console.log('  ' + '-'.repeat(66));
  for (const r of results) {
    const nameStr = r.name.padEnd(42);
    console.log(`  ${nameStr} | ${r.zFlag ? '1' : '0'} | ${r.cFlag ? '1' : '0'} | ${hexByte(r.a)}   | ${r.outcome}`);
  }
  console.log('');

  // Analysis
  const zSetCases = results.filter(r => r.zFlag);
  if (zSetCases.length > 0) {
    console.log('  FINDING: Z is SET for these inputs:');
    for (const r of zSetCases) {
      console.log(`    - ${r.name}`);
    }
    console.log('  These inputs would cause normalization to be SKIPPED (RET Z at 0x07CA4C).');
  } else {
    console.log('  FINDING: Z is NEVER set for any tested input.');
    console.log('  The validity check does NOT skip normalization for any of these cases.');
  }
  console.log('');
}

// --- Main ---

function main() {
  console.log('=== Phase 159: Disassemble and trace 0x07FD4A (validity check) ===');
  console.log('');

  // Part A: Static disassembly (no runtime needed)
  const disasm = partA();

  // Prepare runtime for dynamic tests
  const runtime = createPreparedRuntime();
  if (!runtime.memInitOk) {
    console.log('MEM_INIT failed; aborting.');
    process.exitCode = 1;
    return;
  }
  console.log('Cold boot + MEM_INIT complete.');
  console.log('');

  // Part B: Dynamic trace with gcd inputs
  partB(runtime);

  // Part C: Compare across multiple inputs
  partC(runtime);

  console.log('Done.');
}

try {
  main();
} catch (error) {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
}
