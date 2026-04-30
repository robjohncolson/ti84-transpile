#!/usr/bin/env node

/**
 * Phase 165 - Verify ROM bytes at 0x068D82 inner body call sequence
 *
 * Part A: Static ROM byte verification of the inner body call sequence at 0x068D82-0x068DA1
 * Part B: Check if 0x07C747 has alternate interpretations by reading ROM bytes there
 * Part C: Dynamic trace of what 0x07C747 computes for gcd(12,8) by logging all OP registers at entry/exit
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
const ROM_TRANSPILED_GZ_PATH = path.join(__dirname, 'ROM.transpiled.js.gz');

if (!fs.existsSync(ROM_BIN_PATH)) {
  throw new Error(`ROM binary not found: ${ROM_BIN_PATH}`);
}

if (!fs.existsSync(ROM_TRANSPILED_PATH)) {
  if (!fs.existsSync(ROM_TRANSPILED_GZ_PATH)) {
    throw new Error('ROM.transpiled.js and ROM.transpiled.js.gz both missing. Run `node scripts/transpile-ti84-rom.mjs` first.');
  }
  console.log('ROM.transpiled.js not found — gunzipping from ROM.transpiled.js.gz ...');
  const { execSync } = await import('node:child_process');
  execSync(`gunzip -kf "${ROM_TRANSPILED_GZ_PATH}"`, { stdio: 'inherit' });
  console.log('Gunzip done.');
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
const OP2_ADDR = 0xd00603;
const OP3_ADDR = 0xd0060e;
const OP4_ADDR = 0xd00619;
const OP5_ADDR = 0xd00624;
const OP6_ADDR = 0xd0062f;

const GCD_ENTRY = 0x068d3d;
const GCD_CATEGORY = 0x28;
const FP_CATEGORY_ADDR = 0xd0060e;

const ERR_NO_ADDR = 0xd008df;
const ERR_SP_ADDR = 0xd008e0;

const FPS_ADDR = 0xd0258d;
const FPSBASE_ADDR = 0xd0258a;
const OPS_ADDR = 0xd02593;
const OPBASE_ADDR = 0xd02590;
const PTEMPCNT_ADDR = 0xd02596;
const PTEMP_ADDR = 0xd0259a;
const PROGPTR_ADDR = 0xd0259d;
const NEWDATA_PTR_ADDR = 0xd025a0;

const FAKE_RET = 0x7ffffe;
const ERR_CATCH_ADDR = 0x7ffffa;
const FPS_CLEAN_AREA = 0xd1aa00;

const MEMINIT_BUDGET = 100000;
const MAX_LOOP_ITER = 8192;
const MAX_STEPS = 5000;

const BCD_12 = Uint8Array.from([0x00, 0x81, 0x12, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
const BCD_8  = Uint8Array.from([0x00, 0x80, 0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

// Inner body call sequence
const INNER_BODY_START = 0x068D82;
const INNER_BODY_END   = 0x068DA2; // one past the last byte we care about

// Known function table for cross-referencing
const KNOWN_FUNCTIONS = new Map([
  [0x07F8A2, 'OP1->OP4 (Mov9 copy)'],
  [0x07C747, 'compound (OP1->OP2 + normalize + InvOP1S + FPAdd)'],
  [0x07C74F, 'InvSub (negate OP1 then FPAdd)'],
  [0x07F95E, 'OP1->OP3 (Mov9 copy)'],
  [0x07F8B6, 'OP4->OP2 (Mov9 copy)'],
  [0x07F8FA, 'OP1->OP2 (Mov9 copy)'],
  [0x07CA48, 'Normalize'],
  [0x07CA06, 'InvOP1S'],
]);

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
  return Array.from(mem.subarray(addr, addr + len), (b) => b & 0xff);
}

function formatBytes(bytes) {
  return bytes.map((b) => hexByte(b)).join(' ');
}

function decodeBcdRealBytes(bytes) {
  const type = bytes[0] & 0xff;
  const exponentByte = bytes[1] & 0xff;
  const digits = [];

  for (let i = 2; i < 9; i++) {
    const byte = bytes[i] & 0xff;
    digits.push((byte >> 4) & 0x0f, byte & 0x0f);
  }

  if (digits.every((d) => d === 0)) return '0';
  if (digits.some((d) => d > 9)) {
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
  if (rendered.startsWith('.')) rendered = `0${rendered}`;
  if (rendered === '') rendered = '0';
  if ((type & 0x80) !== 0 && rendered !== '0') rendered = `-${rendered}`;

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
  if (typeof step === 'number') return Math.max(stepCount, step + 1);
  return stepCount + 1;
}

// --- Instruction formatter ---

function formatInstruction(instr) {
  const prefix = instr.modePrefix ? `.${instr.modePrefix} ` : '';
  const tag = instr.tag;

  if (tag === 'call')             return `${prefix}call ${hex(instr.target)}`;
  if (tag === 'call-conditional') return `${prefix}call ${instr.condition}, ${hex(instr.target)}`;
  if (tag === 'jp')               return `${prefix}jp ${hex(instr.target)}`;
  if (tag === 'jp-conditional')   return `${prefix}jp ${instr.condition}, ${hex(instr.target)}`;
  if (tag === 'jp-indirect')      return `${prefix}jp (${instr.indirectRegister})`;
  if (tag === 'jr')               return `${prefix}jr ${hex(instr.target)}`;
  if (tag === 'jr-conditional')   return `${prefix}jr ${instr.condition}, ${hex(instr.target)}`;
  if (tag === 'ret')              return `${prefix}ret`;
  if (tag === 'ret-conditional')  return `${prefix}ret ${instr.condition}`;
  if (tag === 'ld-reg-mem')       return `${prefix}ld ${instr.dest}, (${hex(instr.addr)})`;
  if (tag === 'ld-mem-reg')       return `${prefix}ld (${hex(instr.addr)}), ${instr.src}`;
  if (tag === 'ld-reg-imm')       return `${prefix}ld ${instr.dest}, ${hexByte(instr.value)}`;
  if (tag === 'ld-reg-reg')       return `${prefix}ld ${instr.dest}, ${instr.src}`;
  if (tag === 'ld-pair-imm')      return `${prefix}ld ${instr.pair}, ${hex(instr.value)}`;
  if (tag === 'ld-reg-ind')       return `${prefix}ld ${instr.dest}, (${instr.src})`;
  if (tag === 'ld-ind-reg')       return `${prefix}ld (${instr.dest}), ${instr.src}`;
  if (tag === 'alu-imm')          return `${prefix}${instr.op} ${hexByte(instr.value)}`;
  if (tag === 'alu-reg')          return `${prefix}${instr.op} ${instr.src}`;
  if (tag === 'push')             return `${prefix}push ${instr.pair}`;
  if (tag === 'pop')              return `${prefix}pop ${instr.pair}`;
  if (tag === 'inc-reg')          return `${prefix}inc ${instr.reg}`;
  if (tag === 'dec-reg')          return `${prefix}dec ${instr.reg}`;
  if (tag === 'inc-pair')         return `${prefix}inc ${instr.pair}`;
  if (tag === 'dec-pair')         return `${prefix}dec ${instr.pair}`;
  if (tag === 'add-pair')         return `${prefix}add ${instr.dest}, ${instr.src}`;
  if (tag === 'ex-de-hl')         return `${prefix}ex de, hl`;
  if (tag === 'ldir')             return `${prefix}ldir`;
  if (tag === 'ldi')              return `${prefix}ldi`;
  if (tag === 'nop')              return `${prefix}nop`;
  if (tag === 'djnz')             return `${prefix}djnz ${hex(instr.target)}`;
  if (tag === 'rst')              return `${prefix}rst ${hex(instr.target)}`;
  if (tag === 'scf')              return `${prefix}scf`;
  if (tag === 'ccf')              return `${prefix}ccf`;
  if (tag === 'cpl')              return `${prefix}cpl`;
  if (tag === 'rla')              return `${prefix}rla`;
  if (tag === 'rra')              return `${prefix}rra`;
  if (tag === 'rlca')             return `${prefix}rlca`;
  if (tag === 'rrca')             return `${prefix}rrca`;
  if (tag === 'halt')             return `${prefix}halt`;
  if (tag === 'di')               return `${prefix}di`;
  if (tag === 'ei')               return `${prefix}ei`;
  if (tag === 'neg')              return `${prefix}neg`;
  if (tag === 'bit')              return `${prefix}bit ${instr.bit}, ${instr.reg}`;
  if (tag === 'set')              return `${prefix}set ${instr.bit}, ${instr.reg}`;
  if (tag === 'res')              return `${prefix}res ${instr.bit}, ${instr.reg}`;
  if (tag === 'sla')              return `${prefix}sla ${instr.reg}`;
  if (tag === 'sra')              return `${prefix}sra ${instr.reg}`;
  if (tag === 'srl')              return `${prefix}srl ${instr.reg}`;
  if (tag === 'rl')               return `${prefix}rl ${instr.reg}`;
  if (tag === 'rr')               return `${prefix}rr ${instr.reg}`;
  if (tag === 'rlc')              return `${prefix}rlc ${instr.reg}`;
  if (tag === 'rrc')              return `${prefix}rrc ${instr.reg}`;
  if (tag === 'ex-sp-hl')        return `${prefix}ex (sp), hl`;
  if (tag === 'exx')              return `${prefix}exx`;
  if (tag === 'ex-af')            return `${prefix}ex af, af'`;
  if (tag === 'daa')              return `${prefix}daa`;
  if (tag === 'reti')             return `${prefix}reti`;
  if (tag === 'retn')             return `${prefix}retn`;
  if (tag === 'cpir')             return `${prefix}cpir`;
  if (tag === 'cpdr')             return `${prefix}cpdr`;
  if (tag === 'lddr')             return `${prefix}lddr`;
  if (tag === 'inir')             return `${prefix}inir`;
  if (tag === 'otir')             return `${prefix}otir`;
  if (tag === 'in')               return `${prefix}in ${instr.dest}, (${instr.port ?? instr.src})`;
  if (tag === 'out')              return `${prefix}out (${instr.port ?? instr.dest}), ${instr.src}`;
  if (tag === 'sbc-pair')         return `${prefix}sbc ${instr.dest}, ${instr.src}`;
  if (tag === 'adc-pair')         return `${prefix}adc ${instr.dest}, ${instr.src}`;
  if (tag === 'ld-mem-pair')      return `${prefix}ld (${hex(instr.addr)}), ${instr.pair}`;
  if (tag === 'ld-pair-mem')      return `${prefix}ld ${instr.pair}, (${hex(instr.addr)})`;

  return `${prefix}${tag}`;
}

// --- Disassembly helper ---

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
        text: formatInstruction(instr),
        length,
        instr,
      });
      pc += length;
    } catch (error) {
      entries.push({
        pc,
        bytes: hexByte(romBytes[pc] ?? 0),
        tag: 'error',
        text: `decode-error: ${error?.message ?? error}`,
        length: 1,
        instr: null,
      });
      pc += 1;
    }
  }

  return entries;
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

  executor.runFrom(KERNEL_INIT_ENTRY, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });

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

function seedGcdFpState(mem) {
  seedAllocator(mem);
  mem.fill(0x00, FPS_CLEAN_AREA, FPS_CLEAN_AREA + 0x40);
  write24(mem, FPSBASE_ADDR, FPS_CLEAN_AREA);
  write24(mem, FPS_ADDR, FPS_CLEAN_AREA);
  seedRealRegister(mem, OP1_ADDR, BCD_12);
  seedRealRegister(mem, OP2_ADDR, BCD_8);
  mem[FP_CATEGORY_ADDR] = GCD_CATEGORY;
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
  } catch (err) {
    if (err?.message === '__RET__') ok = true;
    else throw err;
  }

  return ok;
}

function createPreparedRuntime() {
  const runtime = createRuntime();
  coldBoot(runtime.executor, runtime.cpu, runtime.mem);
  const memInitOk = runMemInit(runtime.executor, runtime.cpu, runtime.mem);
  return { ...runtime, memInitOk };
}

// --- OP register dump helper ---

function dumpAllOPs(mem, label) {
  const ops = [
    { name: 'OP1', addr: OP1_ADDR },
    { name: 'OP2', addr: OP2_ADDR },
    { name: 'OP3', addr: OP3_ADDR },
    { name: 'OP4', addr: OP4_ADDR },
    { name: 'OP5', addr: OP5_ADDR },
    { name: 'OP6', addr: OP6_ADDR },
  ];
  console.log(`    ${label}:`);
  for (const op of ops) {
    const bytes = readBytes(mem, op.addr, 9);
    console.log(`      ${op.name}: [${formatBytes(bytes)}] = ${decodeBcdRealBytes(bytes)}`);
  }
}

// ==========================================================================
// Part A: Static ROM byte verification of inner body at 0x068D82-0x068DA1
// ==========================================================================

function partA() {
  console.log(`${'='.repeat(80)}`);
  console.log('PART A: Static ROM byte verification — inner body call sequence 0x068D82-0x068DA1');
  console.log(`${'='.repeat(80)}`);
  console.log('');

  // Raw bytes dump
  const dumpStart = INNER_BODY_START;
  const dumpLen = INNER_BODY_END - INNER_BODY_START;
  console.log(`  Raw ROM bytes from ${hex(dumpStart)} to ${hex(INNER_BODY_END - 1)} (${dumpLen} bytes):`);
  for (let row = 0; row < dumpLen; row += 16) {
    const addr = dumpStart + row;
    const chunks = [];
    for (let i = 0; i < 16 && (row + i) < dumpLen; i++) {
      chunks.push(hexByte(romBytes[addr + i] ?? 0));
    }
    console.log(`    ${hex(addr)}  ${chunks.join(' ')}`);
  }
  console.log('');

  // Decode every instruction
  const entries = decodeRange(INNER_BODY_START, INNER_BODY_END);

  console.log(`  Instruction-by-instruction disassembly (${entries.length} instructions):`);
  console.log('');

  let callIndex = 0;
  for (const entry of entries) {
    const tag = entry.instr?.tag ?? '';

    // For CALL instructions, extract and verify the raw 3-byte target
    let verification = '';
    if (tag === 'call' || tag === 'call-conditional') {
      callIndex++;
      const opcodeAddr = entry.pc;
      // eZ80 CALL in ADL mode: CD LL MM HH (4 bytes total)
      const opcode = romBytes[opcodeAddr];
      const ll = romBytes[opcodeAddr + 1];
      const mm = romBytes[opcodeAddr + 2];
      const hh = romBytes[opcodeAddr + 3];
      const rawTarget = (ll | (mm << 8) | (hh << 16)) >>> 0;
      const decodedTarget = entry.instr.target;
      const knownName = KNOWN_FUNCTIONS.get(rawTarget) || '(unknown)';
      const match = rawTarget === decodedTarget ? 'MATCH' : 'MISMATCH';

      verification = `\n      Step ${callIndex}: Raw bytes [${hexByte(opcode)} ${hexByte(ll)} ${hexByte(mm)} ${hexByte(hh)}]`;
      verification += `\n        Raw 24-bit target (LE): ${hex(rawTarget)}`;
      verification += `\n        Decoder target:         ${hex(decodedTarget)}`;
      verification += `\n        Verification:           ${match}`;
      verification += `\n        Known function:         ${knownName}`;
    }

    // For JR instructions, verify the target
    if (tag === 'jr' || tag === 'jr-conditional') {
      const opcodeAddr = entry.pc;
      const opcode = romBytes[opcodeAddr];
      const offset = romBytes[opcodeAddr + 1];
      const signedOffset = offset >= 128 ? offset - 256 : offset;
      const rawTarget = (opcodeAddr + 2 + signedOffset) & 0xffffff;
      const decodedTarget = entry.instr.target;
      const match = rawTarget === decodedTarget ? 'MATCH' : 'MISMATCH';
      const knownName = KNOWN_FUNCTIONS.get(rawTarget) || '';

      verification = `\n      JR: Raw bytes [${hexByte(opcode)} ${hexByte(offset)}]`;
      verification += `\n        Signed offset: ${signedOffset}`;
      verification += `\n        Computed target: ${hex(rawTarget)}`;
      verification += `\n        Decoder target:  ${hex(decodedTarget)}`;
      verification += `\n        Verification:    ${match}`;
      if (knownName) verification += `\n        Known function:  ${knownName}`;
    }

    console.log(`  ${hex(entry.pc)}  ${entry.bytes.padEnd(24)}  ${entry.text}${verification}`);
  }

  console.log('');

  // Summary of the 5-step call sequence
  console.log('  EXPECTED call sequence verification:');
  console.log('    Step 1: CALL 0x07F8A2 (OP1->OP4)');
  console.log('    Step 2: CALL 0x07C747 (compound: OP1->OP2 + normalize + InvOP1S + FPAdd)');
  console.log('    Step 3: CALL 0x07F95E (OP1->OP3)');
  console.log('    Step 4: CALL 0x07F8B6 (OP4->OP2)');
  console.log('    Step 5: CALL 0x07C74F (InvSub = negate OP1 then add)');
  console.log('');

  const callEntries = entries.filter(e => e.instr && (e.instr.tag === 'call' || e.instr.tag === 'call-conditional'));
  const expectedTargets = [0x07F8A2, 0x07C747, 0x07F95E, 0x07F8B6, 0x07C74F];
  const expectedNames = ['OP1->OP4', 'compound', 'OP1->OP3', 'OP4->OP2', 'InvSub'];

  console.log('  ACTUAL vs EXPECTED:');
  for (let i = 0; i < Math.max(callEntries.length, expectedTargets.length); i++) {
    const actual = callEntries[i];
    const expected = expectedTargets[i];
    const expName = expectedNames[i] || '?';

    if (!actual) {
      console.log(`    Step ${i + 1}: MISSING (expected ${hex(expected)} ${expName})`);
    } else if (!expected) {
      console.log(`    Step ${i + 1}: EXTRA call to ${hex(actual.instr.target)} at ${hex(actual.pc)}`);
    } else {
      const ok = actual.instr.target === expected;
      console.log(`    Step ${i + 1}: ${ok ? 'OK' : 'WRONG'} — actual=${hex(actual.instr.target)} expected=${hex(expected)} (${expName}) at ${hex(actual.pc)}`);
    }
  }

  console.log('');
}

// ==========================================================================
// Part B: Check alternate interpretations of 0x07C747
// ==========================================================================

function partB() {
  console.log(`${'='.repeat(80)}`);
  console.log('PART B: Alternate interpretations of 0x07C747 — ROM bytes at the compound function');
  console.log(`${'='.repeat(80)}`);
  console.log('');

  // Disassemble from 0x07C740 to 0x07C790 to see context around the compound function
  const DISASM_START = 0x07C740;
  const DISASM_END = 0x07C790;

  // Raw bytes dump
  console.log(`  Raw ROM bytes from ${hex(DISASM_START)} to ${hex(DISASM_END - 1)}:`);
  for (let row = 0; row < (DISASM_END - DISASM_START); row += 16) {
    const addr = DISASM_START + row;
    const chunks = [];
    for (let i = 0; i < 16 && (row + i) < (DISASM_END - DISASM_START); i++) {
      chunks.push(hexByte(romBytes[addr + i] ?? 0));
    }
    console.log(`    ${hex(addr)}  ${chunks.join(' ')}`);
  }
  console.log('');

  // Decode instructions
  const entries = decodeRange(DISASM_START, DISASM_END);

  console.log(`  Disassembly of ${hex(DISASM_START)}-${hex(DISASM_END)}:`);
  console.log('');

  for (const entry of entries) {
    const knownName = KNOWN_FUNCTIONS.get(entry.pc) || '';
    const knownStr = knownName ? `  <<< ENTRY: ${knownName}` : '';

    // For CALL instructions, show target name
    let targetNote = '';
    if (entry.instr && (entry.instr.tag === 'call' || entry.instr.tag === 'call-conditional')) {
      const tgtName = KNOWN_FUNCTIONS.get(entry.instr.target);
      if (tgtName) targetNote = `  ; -> ${tgtName}`;
    }
    if (entry.instr && (entry.instr.tag === 'jr' || entry.instr.tag === 'jr-conditional')) {
      const tgtName = KNOWN_FUNCTIONS.get(entry.instr.target);
      if (tgtName) targetNote = `  ; -> ${tgtName}`;
    }

    console.log(`  ${hex(entry.pc)}  ${entry.bytes.padEnd(24)}  ${entry.text}${targetNote}${knownStr}`);
  }
  console.log('');

  // Check specific entry points
  console.log('  Entry point analysis:');
  console.log('');

  const checkAddrs = [0x07C745, 0x07C746, 0x07C747, 0x07C748, 0x07C749, 0x07C74B, 0x07C74D, 0x07C74F];
  for (const addr of checkAddrs) {
    try {
      const instr = decodeInstruction(romBytes, addr, 'adl');
      const bytes = [];
      for (let i = 0; i < (instr.length || 1); i++) {
        bytes.push(hexByte(romBytes[addr + i] ?? 0));
      }
      const knownName = KNOWN_FUNCTIONS.get(addr) || '';
      const knownStr = knownName ? ` [${knownName}]` : '';
      console.log(`    ${hex(addr)}: [${bytes.join(' ')}] => ${formatInstruction(instr)}${knownStr}`);
    } catch (error) {
      console.log(`    ${hex(addr)}: decode error: ${error?.message}`);
    }
  }
  console.log('');

  // Verify the expected sequence at 0x07C747
  console.log('  Expected sequence at 0x07C747:');
  console.log('    0x07C747: CALL 0x07F8FA (OP1->OP2 copy)');
  console.log('    then:     CALL 0x07CA48 (normalize)');
  console.log('    then:     CALL 0x07CA06 (InvOP1S)');
  console.log('    then:     JR   0x07C77F (FPAdd)');
  console.log('');

  // Verify by decoding from 0x07C747 forward
  console.log('  Actual sequence from 0x07C747:');
  const seqEntries = decodeRange(0x07C747, 0x07C760);
  for (const entry of seqEntries) {
    let note = '';
    if (entry.instr && entry.instr.tag === 'call') {
      const n = KNOWN_FUNCTIONS.get(entry.instr.target);
      if (n) note = `  ; ${n}`;
    }
    if (entry.instr && entry.instr.tag === 'jr') {
      note = `  ; -> FPAdd?`;
    }
    console.log(`    ${hex(entry.pc)}  [${entry.bytes}]  ${entry.text}${note}`);
  }
  console.log('');

  // Also check 0x07C74F (InvSub)
  console.log('  Sequence from 0x07C74F (InvSub):');
  const invSubEntries = decodeRange(0x07C74F, 0x07C760);
  for (const entry of invSubEntries) {
    let note = '';
    if (entry.instr && entry.instr.tag === 'call') {
      const n = KNOWN_FUNCTIONS.get(entry.instr.target);
      if (n) note = `  ; ${n}`;
    }
    console.log(`    ${hex(entry.pc)}  [${entry.bytes}]  ${entry.text}${note}`);
  }
  console.log('');
}

// ==========================================================================
// Part C: Dynamic trace — what does 0x07C747 compute for gcd(12,8)?
// ==========================================================================

function partC(runtime) {
  const { mem, executor, cpu } = runtime;

  console.log(`${'='.repeat(80)}`);
  console.log('PART C: Dynamic trace — what 0x07C747 computes during gcd(12,8)');
  console.log(`${'='.repeat(80)}`);
  console.log('');

  prepareCallState(cpu, mem);
  seedGcdFpState(mem);

  // Push OP2 (8.0) to FPS before gcd entry (matches session 163 setup)
  const fpsPtr = read24(mem, FPS_ADDR);
  const op2Bytes = readBytes(mem, OP2_ADDR, 9);
  for (let i = 0; i < 9; i++) {
    mem[fpsPtr + i] = op2Bytes[i];
  }
  write24(mem, FPS_ADDR, fpsPtr + 9);

  seedErrFrame(cpu, mem, FAKE_RET, ERR_CATCH_ADDR, 0);

  console.log(`  Entry: gcd at ${hex(GCD_ENTRY)}`);
  dumpAllOPs(mem, 'Initial OP state');
  console.log('');

  let stepCount = 0;
  let outcome = 'budget';

  // Track entry/exit of 0x07C747
  const COMPOUND_FUNC = 0x07C747;
  const COMPOUND_RET = 0x068D8D; // return address after the CALL 0x07C747 at 0x068D89 (4-byte CALL)

  // We need to figure out the actual return address. The CALL 0x07C747 instruction
  // is somewhere in the inner body. Let's compute it from Part A's data.
  // From the call sequence: step 1 is CALL at 0x068D82 (4 bytes -> next at 0x068D86)
  // step 2 is CALL at 0x068D86 (4 bytes -> next at 0x068D8A)
  // But we should verify. Let's decode to find the actual address.
  const innerEntries = decodeRange(INNER_BODY_START, INNER_BODY_END);
  let compoundCallAddr = null;
  let compoundRetAddr = null;
  for (const entry of innerEntries) {
    if (entry.instr && entry.instr.tag === 'call' && entry.instr.target === COMPOUND_FUNC) {
      compoundCallAddr = entry.pc;
      compoundRetAddr = entry.pc + entry.length;
      break;
    }
  }

  console.log(`  CALL 0x07C747 is at ${hex(compoundCallAddr)}, return address = ${hex(compoundRetAddr)}`);
  console.log('');

  let inside07C747 = false;
  let callNum07C747 = 0;

  try {
    executor.runFrom(GCD_ENTRY, 'adl', {
      maxSteps: MAX_STEPS,
      maxLoopIterations: MAX_LOOP_ITER,

      onBlock(pc, mode, meta, step) {
        const norm = pc & 0xffffff;
        stepCount = noteStep(stepCount, step);

        // Detect entry to 0x07C747
        if (norm === COMPOUND_FUNC && !inside07C747) {
          inside07C747 = true;
          callNum07C747++;

          console.log(`  --- ENTRY to 0x07C747 (call #${callNum07C747}) at step ${stepCount} ---`);
          console.log(`    SP=${hex(cpu.sp)}  A=${hexByte(cpu.a & 0xff)}  F=${hexByte(cpu.f & 0xff)}`);
          dumpAllOPs(mem, 'OP state on ENTRY');
          console.log('');
        }

        // Detect return from 0x07C747
        if (inside07C747 && compoundRetAddr && norm === compoundRetAddr) {
          console.log(`  --- EXIT from 0x07C747 (call #${callNum07C747}) at step ${stepCount} ---`);
          console.log(`    SP=${hex(cpu.sp)}  A=${hexByte(cpu.a & 0xff)}  F=${hexByte(cpu.f & 0xff)}`);
          dumpAllOPs(mem, 'OP state on EXIT');
          console.log('');

          inside07C747 = false;
        }

        if (norm === FAKE_RET) throw new Error('__RET__');
        if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');
      },

      onMissingBlock(pc, mode, step) {
        const norm = pc & 0xffffff;
        stepCount = noteStep(stepCount, step);

        if (norm === FAKE_RET) throw new Error('__RET__');
        if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');
      },
    });
  } catch (err) {
    if (err?.message === '__RET__') outcome = 'return';
    else if (err?.message === '__ERR__') outcome = 'error';
    else {
      outcome = 'threw';
      console.log(`  Thrown: ${(err?.stack || String(err)).split('\n')[0]}`);
    }
  }

  console.log(`  Outcome: ${outcome}`);
  console.log(`  Total steps: ${stepCount}`);
  console.log(`  Total calls to 0x07C747: ${callNum07C747}`);
  console.log(`  errNo: ${hexByte(mem[ERR_NO_ADDR] & 0xff)} (${errName(mem[ERR_NO_ADDR] & 0xff)})`);
  console.log('');

  // Final OP state
  dumpAllOPs(mem, 'Final OP state');
  console.log('');

  // Analysis
  console.log('  ANALYSIS:');
  console.log('    Question: What does 0x07C747 compute? Is the result in OP1? OP2? Both?');
  console.log('    Answer: See the ENTRY vs EXIT dumps above for each call.');
  console.log('    If OP1_exit == OP1_entry and OP2_exit == OP1_entry, then 0x07C747 copies OP1->OP2.');
  console.log('    If OP1_exit != OP1_entry, then 0x07C747 also modifies OP1.');
  console.log('');
}

// ==========================================================================
// Main
// ==========================================================================

function main() {
  console.log('=== Phase 165: ROM Bytes Verification at 0x068D82 ===');
  console.log('');

  // Part A: static ROM byte verification (no runtime needed)
  partA();

  // Part B: check alternate interpretations (no runtime needed)
  partB();

  // Part C: dynamic trace (needs full runtime)
  const runtime = createPreparedRuntime();

  if (!runtime.memInitOk) {
    console.log('MEM_INIT failed; aborting.');
    process.exitCode = 1;
    return;
  }

  console.log('Cold boot + MEM_INIT complete.');
  console.log('');

  partC(runtime);

  console.log('Done.');
  process.exitCode = 0;
}

try {
  main();
} catch (err) {
  console.error(err?.stack || String(err));
  process.exitCode = 1;
}
