#!/usr/bin/env node

/**
 * Phase 160 - Examine OP1toOP2 post-0x07CA48 code path.
 *
 * Questions answered:
 * 1. Part A: Full disassembly of OP1toOP2 (0x07C740-0x07C780) — what happens
 *    after CALL 0x07CA48 returns at 0x07C74F?
 * 2. Part B: Dynamic trace — log OP1/OP2 at every block between 0x07C740-0x07C780,
 *    plus at normalization entry (0x07CA48) and exit (0x07CA9F area).
 * 3. Part C: At 0x07CA48 entry, are OP1 and OP2 identical? After return, does
 *    OP1toOP2 use the zeroed OP1 or the preserved OP2?
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

// Key addresses from the spec
const OP1TOOP2_ENTRY = 0x07c747;
const CALL_NORM_ADDR = 0x07c74b;    // CALL 0x07CA48 inside OP1toOP2
const AFTER_CALL_ADDR = 0x07c74f;   // return address from CALL 0x07CA48
const NORM_ENTRY = 0x07ca48;
const NORM_RET_AREA = 0x07ca9f;     // RET instruction inside normalization

const GCD_ENTRY = 0x068d3d;
const GCD_CALLS_OP1TOOP2 = 0x068d61;
const GCD_CATEGORY = 0x28;

// Disassembly range: 0x07C740-0x07C780
const DISASM_START = 0x07c740;
const DISASM_END = 0x07c781;

// Dynamic trace window for OP1toOP2
const TRACE_LO = 0x07c740;
const TRACE_HI = 0x07c780;

const FAKE_RET = 0x7ffffe;
const ERR_CATCH_ADDR = 0x7ffffa;

const MEMINIT_BUDGET = 100000;
const MAX_LOOP_ITER = 8192;
const MAX_STEPS = 2000;

const FPS_CLEAN_AREA = 0xd1aa00;

const BCD_12 = Uint8Array.from([0x00, 0x81, 0x12, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
const BCD_8  = Uint8Array.from([0x00, 0x80, 0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

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

// --- Address labels ---

const ADDR_LABELS = new Map([
  [OP1TOOP2_ENTRY, 'OP1toOP2_entry'],
  [CALL_NORM_ADDR, 'OP1toOP2+4(CALL_NORM)'],
  [AFTER_CALL_ADDR, 'OP1toOP2+8(after_CALL)'],
  [NORM_ENTRY, 'NormEntry(0x07CA48)'],
  [NORM_RET_AREA, 'NormRET(0x07CA9F)'],
  [GCD_ENTRY, 'gcd_entry'],
  [GCD_CALLS_OP1TOOP2, 'gcd+calls_OP1toOP2'],
  [FAKE_RET, 'FAKE_RET'],
  [ERR_CATCH_ADDR, 'ERR_CATCH'],
]);

function addrLabel(addr) {
  const label = ADDR_LABELS.get(addr);
  return label ? ` [${label}]` : '';
}

// --- Instruction formatter (same as phase 159) ---

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
  if (tag === 'neg') return `${prefix}neg`;
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
  if (tag === 'ex-sp-hl') return `${prefix}ex (sp), hl`;
  if (tag === 'exx') return `${prefix}exx`;
  if (tag === 'ex-af') return `${prefix}ex af, af'`;
  if (tag === 'daa') return `${prefix}daa`;
  if (tag === 'reti') return `${prefix}reti`;
  if (tag === 'retn') return `${prefix}retn`;
  if (tag === 'cpir') return `${prefix}cpir`;
  if (tag === 'cpdr') return `${prefix}cpdr`;
  if (tag === 'lddr') return `${prefix}lddr`;
  if (tag === 'inir') return `${prefix}inir`;
  if (tag === 'otir') return `${prefix}otir`;
  if (tag === 'in') return `${prefix}in ${instr.dest}, (${instr.port ?? instr.src})`;
  if (tag === 'out') return `${prefix}out (${instr.port ?? instr.dest}), ${instr.src}`;
  if (tag === 'sbc-pair') return `${prefix}sbc ${instr.dest}, ${instr.src}`;
  if (tag === 'adc-pair') return `${prefix}adc ${instr.dest}, ${instr.src}`;
  if (tag === 'ld-mem-pair') return `${prefix}ld (${hex(instr.addr)}), ${instr.pair}`;
  if (tag === 'ld-pair-mem') return `${prefix}ld ${instr.pair}, (${hex(instr.addr)})`;

  return `${prefix}${tag}`;
}

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
      entries.push({ pc, bytes: bytes.join(' '), tag: instr.tag, text: formatInstructionSimple(instr), length, instr });
      pc += length;
    } catch (err) {
      entries.push({ pc, bytes: hexByte(romBytes[pc] ?? 0), tag: 'error', text: `decode-error: ${err?.message ?? err}`, length: 1, instr: null });
      pc += 1;
    }
  }

  return entries;
}

// --- Runtime setup (same pattern as phases 157/159) ---

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

// ==========================================================================
// Part A: Static disassembly of 0x07C740-0x07C780
// ==========================================================================

function partA_staticDisassembly() {
  console.log(`\n${'='.repeat(70)}`);
  console.log('PART A: Static disassembly of OP1toOP2 range 0x07C740-0x07C780 (65 bytes)');
  console.log(`${'='.repeat(70)}`);

  // Raw bytes dump
  const rawBytes = [];
  for (let i = 0; i < (DISASM_END - DISASM_START); i++) {
    rawBytes.push(hexByte(romBytes[DISASM_START + i] ?? 0));
  }
  console.log(`  Raw bytes: ${rawBytes.join(' ')}`);
  console.log('');

  const entries = decodeRange(DISASM_START, DISASM_END);

  for (const entry of entries) {
    const ann = addrLabel(entry.pc);
    const notes = [];

    if (entry.instr) {
      const tag = entry.instr.tag;

      // Annotate known CALL targets
      if (tag === 'call' || tag === 'call-conditional') {
        const target = entry.instr.target;
        const label = ADDR_LABELS.get(target);
        if (label) notes.push(`-> ${label}`);
      }

      // Flag OP register memory references
      if (tag === 'ld-reg-mem' || tag === 'ld-mem-reg' || tag === 'ld-mem-pair' || tag === 'ld-pair-mem') {
        const addr = entry.instr.addr;
        if (addr !== undefined) {
          if (addr >= OP1_ADDR && addr < OP1_ADDR + 9) notes.push(`OP1[${addr - OP1_ADDR}]`);
          else if (addr >= OP2_ADDR && addr < OP2_ADDR + 9) notes.push(`OP2[${addr - OP2_ADDR}]`);
          else notes.push(`mem@${hex(addr)}`);
        }
      }
    }

    const noteStr = notes.length > 0 ? `  ; ${notes.join(', ')}` : '';
    const highlight =
      entry.pc === OP1TOOP2_ENTRY ? ' <<<< OP1toOP2 ENTRY' :
      entry.pc === CALL_NORM_ADDR ? ' <<<< CALL 0x07CA48' :
      entry.pc === AFTER_CALL_ADDR ? ' <<<< AFTER_CALL (return from norm)' : '';

    console.log(
      `  ${hex(entry.pc)}  ${entry.bytes.padEnd(20)}  ${entry.text}${ann}${noteStr}${highlight}`
    );
  }

  return entries;
}

// ==========================================================================
// Part B + C: Dynamic trace of gcd -> OP1toOP2 -> normalization
// ==========================================================================

function partBC_dynamicTrace(runtime) {
  const { mem, executor, cpu } = runtime;

  console.log(`\n${'='.repeat(70)}`);
  console.log('PART B+C: Dynamic trace — gcd(12,8), logging OP1/OP2 at OP1toOP2 range and normalization');
  console.log(`${'='.repeat(70)}`);

  prepareCallState(cpu, mem);
  seedGcdFpState(mem);

  // Push OP2 (8.0) to FPS before gcd entry (same as phase 157)
  const fpsPtr = read24(mem, FPS_ADDR);
  const op2Bytes = readBytes(mem, OP2_ADDR, 9);
  for (let i = 0; i < 9; i++) {
    mem[fpsPtr + i] = op2Bytes[i];
  }
  write24(mem, FPS_ADDR, fpsPtr + 9);

  seedErrFrame(cpu, mem, FAKE_RET, ERR_CATCH_ADDR, 0);

  console.log(`  Entry: gcd at ${hex(GCD_ENTRY)}`);
  console.log(`  OP1: [${formatBytes(readBytes(mem, OP1_ADDR, 9))}] = ${decodeBcdRealBytes(readBytes(mem, OP1_ADDR, 9))}`);
  console.log(`  OP2: [${formatBytes(readBytes(mem, OP2_ADDR, 9))}] = ${decodeBcdRealBytes(readBytes(mem, OP2_ADDR, 9))}`);
  console.log(`  FPS ptr: ${hex(read24(mem, FPS_ADDR))}`);
  console.log(`  SP: ${hex(cpu.sp)}`);
  console.log('');

  let stepCount = 0;
  let outcome = 'budget';

  // Collected snapshots for Part C analysis
  const normEntrySnaps = [];   // OP1/OP2 each time we enter 0x07CA48
  const afterCallSnaps = [];   // OP1/OP2 each time we reach 0x07C74F (after norm returns)
  let firstNormEntry = null;
  let firstAfterCall = null;
  let normCount = 0;

  console.log('  --- OP1toOP2-range and norm events (blocks in 0x07C740-0x07C780, 0x07CA48, 0x07CA9F) ---');

  try {
    executor.runFrom(GCD_ENTRY, 'adl', {
      maxSteps: MAX_STEPS,
      maxLoopIterations: MAX_LOOP_ITER,

      onBlock(pc, mode, meta, step) {
        const norm = pc & 0xffffff;
        stepCount = noteStep(stepCount, step);

        const inWindow = norm >= TRACE_LO && norm <= TRACE_HI;
        const isNormEntry = norm === NORM_ENTRY;
        const isNormRet = norm === NORM_RET_AREA;
        const isAfterCall = norm === AFTER_CALL_ADDR;

        if (inWindow || isNormEntry || isNormRet) {
          const op1 = readBytes(mem, OP1_ADDR, 9);
          const op2 = readBytes(mem, OP2_ADDR, 9);
          const label = addrLabel(norm);

          console.log(
            `  Step ${String(stepCount).padStart(4)}: PC=${hex(norm)}${label}`
          );
          console.log(
            `    OP1=[${formatBytes(op1)}] = ${decodeBcdRealBytes(op1)}`
          );
          console.log(
            `    OP2=[${formatBytes(op2)}] = ${decodeBcdRealBytes(op2)}`
          );

          if (isNormEntry) {
            normCount++;
            const snap = { step: stepCount, op1: [...op1], op2: [...op2] };
            normEntrySnaps.push(snap);
            if (!firstNormEntry) firstNormEntry = snap;
            console.log(`    *** NORMALIZATION ENTRY #${normCount} ***`);
          }

          if (isNormRet) {
            console.log('    *** NORMALIZATION RET ***');
          }

          if (isAfterCall) {
            const snap = { step: stepCount, op1: [...op1], op2: [...op2] };
            afterCallSnaps.push(snap);
            if (!firstAfterCall) firstAfterCall = snap;
            console.log('    *** AFTER CALL 0x07CA48 (0x07C74F) ***');
          }
        }

        if (norm === FAKE_RET) throw new Error('__RET__');
        if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');
      },

      onMissingBlock(pc, mode, step) {
        const norm = pc & 0xffffff;
        stepCount = noteStep(stepCount, step);

        const inWindow = norm >= TRACE_LO && norm <= TRACE_HI;
        const isNormEntry = norm === NORM_ENTRY;
        const isAfterCall = norm === AFTER_CALL_ADDR;

        if (inWindow || isNormEntry) {
          console.log(
            `  Step ${String(stepCount).padStart(4)}: PC=${hex(norm)} [MISSING]${addrLabel(norm)}`
          );
          if (isNormEntry) {
            normCount++;
            console.log(`    *** NORMALIZATION ENTRY #${normCount} (MISSING BLOCK) ***`);
          }
        }

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

  const finalOp1 = readBytes(mem, OP1_ADDR, 9);
  const finalOp2 = readBytes(mem, OP2_ADDR, 9);

  console.log('');
  console.log('  --- Result ---');
  console.log(`  Outcome: ${outcome}`);
  console.log(`  Steps: ${stepCount}`);
  console.log(`  Normalization entries: ${normCount}`);
  console.log(`  Final OP1: [${formatBytes(finalOp1)}] = ${decodeBcdRealBytes(finalOp1)}`);
  console.log(`  Final OP2: [${formatBytes(finalOp2)}] = ${decodeBcdRealBytes(finalOp2)}`);
  console.log(`  errNo: ${hexByte(mem[ERR_NO_ADDR] & 0xff)} (${errName(mem[ERR_NO_ADDR] & 0xff)})`);

  return { normEntrySnaps, afterCallSnaps, firstNormEntry, firstAfterCall, normCount };
}

// ==========================================================================
// Part C: Verdict — OP1 == OP2 at norm entry? Does OP1toOP2 use zeroed OP1?
// ==========================================================================

function partC_verdict({ normEntrySnaps, afterCallSnaps, firstNormEntry, firstAfterCall, normCount }) {
  console.log(`\n${'='.repeat(70)}`);
  console.log('PART C: Verdict — OP1/OP2 identity at normalization entry + post-return behavior');
  console.log(`${'='.repeat(70)}`);

  if (normEntrySnaps.length === 0) {
    console.log('  Normalization (0x07CA48) was NOT reached. Cannot determine answer.');
    return;
  }

  // Check OP1 == OP2 at first norm entry
  const snap = firstNormEntry;
  const op1Str = formatBytes(snap.op1);
  const op2Str = formatBytes(snap.op2);
  const identical = op1Str === op2Str;

  console.log(`  At first 0x07CA48 entry (step ${snap.step}):`);
  console.log(`    OP1 = [${op1Str}] = ${decodeBcdRealBytes(snap.op1)}`);
  console.log(`    OP2 = [${op2Str}] = ${decodeBcdRealBytes(snap.op2)}`);
  console.log(`    OP1 == OP2: ${identical ? 'YES — OP2 holds a pre-copy of OP1 (as expected)' : 'NO — OP2 differs from OP1 at norm entry'}`);
  console.log('');

  if (afterCallSnaps.length === 0) {
    console.log('  0x07C74F (after CALL 0x07CA48) was NOT reached within budget.');
    console.log('  Cannot determine whether OP1toOP2 uses zeroed OP1 or preserved OP2.');
    return;
  }

  // At 0x07C74F, is OP1 zeroed? Is OP2 the original value?
  const afterSnap = firstAfterCall;
  const op1After = decodeBcdRealBytes(afterSnap.op1);
  const op2After = decodeBcdRealBytes(afterSnap.op2);
  const op1IsZero = afterSnap.op1.every((b) => b === 0) || op1After === '0';
  const op1BytesAfter = formatBytes(afterSnap.op1);
  const op2BytesAfter = formatBytes(afterSnap.op2);

  console.log(`  At 0x07C74F (after CALL 0x07CA48 returns, step ${afterSnap.step}):`);
  console.log(`    OP1 = [${op1BytesAfter}] = ${op1After}`);
  console.log(`    OP2 = [${op2BytesAfter}] = ${op2After}`);
  console.log(`    OP1 zeroed by normalization: ${op1IsZero ? 'YES' : 'NO (still valid)'}`);
  console.log('');

  // Summary verdict
  console.log('  --- VERDICT ---');
  if (identical && op1IsZero) {
    console.log('  CONFIRMED: OP2 held the original value before normalization zeroed OP1.');
    console.log('  After CALL 0x07CA48, OP1 is zeroed. OP2 still holds the pre-copy.');
    console.log('  Whether OP1toOP2 then uses OP2 (correct) or OP1 (bug) depends on');
    console.log('  instructions at 0x07C74F — see Part A disassembly for the answer.');
  } else if (identical && !op1IsZero) {
    console.log('  SURPRISE: OP1 == OP2 at norm entry, but OP1 was NOT zeroed by normalization.');
    console.log('  Normalization may not zero the mantissa for this input.');
  } else if (!identical) {
    console.log('  NOTE: OP1 != OP2 at norm entry — OP2 was NOT copied from OP1 before CALL.');
    console.log('  This contradicts session 157. Further investigation needed.');
  }

  if (normCount > 1) {
    console.log(`\n  ALSO: Normalization was called ${normCount} times (multiple iterations in gcd loop).`);
    console.log('  All norm-entry snapshots:');
    for (const s of normEntrySnaps) {
      console.log(
        `    step ${s.step}: OP1=[${formatBytes(s.op1)}]=${decodeBcdRealBytes(s.op1)}  ` +
        `OP2=[${formatBytes(s.op2)}]=${decodeBcdRealBytes(s.op2)}`
      );
    }
  }
}

// --- Main ---

function main() {
  console.log('=== Phase 160: OP1toOP2 flow after 0x07CA48 normalization ===');
  console.log('');

  const runtime = createPreparedRuntime();

  if (!runtime.memInitOk) {
    console.log('MEM_INIT failed; aborting.');
    process.exitCode = 1;
    return;
  }

  console.log('Cold boot + MEM_INIT complete.');

  // Part A: Static disassembly of 0x07C740-0x07C780
  partA_staticDisassembly();

  // Part B + C: Dynamic trace
  const traceResult = partBC_dynamicTrace(runtime);

  // Part C: Verdict
  partC_verdict(traceResult);

  console.log('\nDone.');
}

try {
  main();
} catch (err) {
  console.error(err?.stack || String(err));
  process.exitCode = 1;
}
