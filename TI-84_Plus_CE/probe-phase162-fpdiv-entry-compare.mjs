#!/usr/bin/env node

/**
 * Phase 162 - Compare FPDiv entry state: gcd context vs direct call.
 *
 * Questions answered:
 *   1. Is FPDiv (0x07CAB9) ever entered during gcd(12,8)?
 *   2. If yes: what are OP1/OP2 at entry, how does result differ from direct call?
 *   3. If no: what mechanism does gcd use instead for division?
 *   4. State comparison between gcd-context and direct-call FPDiv entry.
 *
 * Also watches: FPDiv JT slot (0x0201F4), JmpThru (0x080188),
 *   gcd body range (0x068D95-0x068DEA).
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
const OP3_ADDR = 0xd0060e + 1; // OP3 is at OP2 + 11 = 0xd0060e... wait
// OP registers are 11 bytes apart: OP1=0xd005f8, OP2=0xd00603, OP3=0xd0060e, OP4=0xd00619, OP5=0xd00624
const OP3_ADDR_REAL = 0xd0060e;
const OP5_ADDR = 0xd00624;

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

// Watch addresses
const FPDIV_IMPL = 0x07cab9;
const FPDIV_JT = 0x0201f4;
const JMPTHRU = 0x080188;
const GCD_BODY_LO = 0x068d95;
const GCD_BODY_HI = 0x068dea;

const BCD_12 = Uint8Array.from([0x00, 0x81, 0x12, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
const BCD_8  = Uint8Array.from([0x00, 0x80, 0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
const BCD_1200 = Uint8Array.from([0x00, 0x83, 0x12, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

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
  [0x07c747, 'OP1toOP2_entry'],
  [0x07c74b, 'OP1toOP2+4(CALL_NORM)'],
  [0x07c74f, 'OP1toOP2+8(after_CALL)'],
  [0x07c755, 'OP1toOP2_no_norm'],
  [0x07c77f, 'FPAdd'],
  [0x07c771, 'FPSub'],
  [0x07c783, 'FPAdd+4'],
  [0x07ca06, 'InvOP1S'],
  [0x07ca48, 'Normalize'],
  [0x07ca9f, 'Normalize_RET'],
  [0x07cab9, 'FPDiv_impl'],
  [0x07cc36, 'FPAddSub_core'],
  [0x07f8fa, 'Mov9_OP1toOP2'],
  [0x07fa86, 'ConstLoader_1.0'],
  [0x07fb33, 'Shl14'],
  [0x07fb50, 'Shl14_alt'],
  [0x07fac2, 'BigShift'],
  [0x07fd4a, 'ValidityCheck_OP1'],
  [0x068d3d, 'gcd_entry'],
  [0x068d61, 'gcd_call_OP1toOP2'],
  [0x068d82, 'gcd_algo_body'],
  [0x068d8d, 'gcd_OP1toOP3'],
  [0x068d91, 'gcd_OP1toOP5'],
  [0x068d95, 'gcd_body_0x68D95'],
  [0x068da1, 'gcd_error_check'],
  [0x0201f4, 'FPDiv_JT_slot'],
  [0x080188, 'JmpThru'],
]);

function addrLabel(addr) {
  const label = ADDR_LABELS.get(addr);
  return label ? ` [${label}]` : '';
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

// --- Snapshot helper ---

function captureState(cpu, mem) {
  return {
    a: cpu.a & 0xff,
    f: cpu.f & 0xff,
    b: cpu.b & 0xff,
    c: cpu.c & 0xff,
    d: cpu.d & 0xff,
    e: cpu.e & 0xff,
    h: cpu.h & 0xff,
    l: cpu.l & 0xff,
    hl: (cpu._hl ?? ((cpu.h << 8) | cpu.l)) & 0xffffff,
    de: (cpu._de ?? ((cpu.d << 8) | cpu.e)) & 0xffffff,
    bc: (cpu._bc ?? ((cpu.b << 8) | cpu.c)) & 0xffffff,
    ix: (cpu._ix ?? 0) & 0xffffff,
    iy: (cpu._iy ?? 0) & 0xffffff,
    sp: cpu.sp & 0xffffff,
    op1: readBytes(mem, OP1_ADDR, 9),
    op2: readBytes(mem, OP2_ADDR, 9),
    fps: read24(mem, FPS_ADDR),
    fpsBase: read24(mem, FPSBASE_ADDR),
    errNo: mem[ERR_NO_ADDR] & 0xff,
    stack: readBytes(mem, cpu.sp & 0xffffff, 12),
  };
}

function printState(label, state) {
  console.log(`  ${label}:`);
  console.log(`    A=${hexByte(state.a)} F=${hexByte(state.f)} BC=${hex(state.bc)} DE=${hex(state.de)} HL=${hex(state.hl)}`);
  console.log(`    IX=${hex(state.ix)} IY=${hex(state.iy)} SP=${hex(state.sp)}`);
  console.log(`    OP1=[${formatBytes(state.op1)}] = ${decodeBcdRealBytes(state.op1)}`);
  console.log(`    OP2=[${formatBytes(state.op2)}] = ${decodeBcdRealBytes(state.op2)}`);
  console.log(`    FPS=${hex(state.fps)} FPS_BASE=${hex(state.fpsBase)} errNo=${hexByte(state.errNo)}`);
  console.log(`    Stack[SP..SP+11]=[${formatBytes(state.stack)}]`);
}

function compareStates(stateA, stateB) {
  console.log('');
  console.log('  COMPARISON TABLE (gcd-context vs direct-call):');
  console.log('  ' + '-'.repeat(65));
  console.log('  ' + 'Register/Field'.padEnd(20) + 'gcd-context'.padEnd(20) + 'direct-call'.padEnd(20) + 'Match?');
  console.log('  ' + '-'.repeat(65));

  const fields = [
    ['A', s => hexByte(s.a)],
    ['F', s => hexByte(s.f)],
    ['BC', s => hex(s.bc)],
    ['DE', s => hex(s.de)],
    ['HL', s => hex(s.hl)],
    ['IX', s => hex(s.ix)],
    ['IY', s => hex(s.iy)],
    ['SP', s => hex(s.sp)],
    ['OP1', s => decodeBcdRealBytes(s.op1)],
    ['OP2', s => decodeBcdRealBytes(s.op2)],
    ['OP1 raw', s => formatBytes(s.op1)],
    ['OP2 raw', s => formatBytes(s.op2)],
    ['FPS', s => hex(s.fps)],
    ['FPS_BASE', s => hex(s.fpsBase)],
    ['errNo', s => hexByte(s.errNo)],
  ];

  for (const [name, fn] of fields) {
    const valA = fn(stateA);
    const valB = fn(stateB);
    const match = valA === valB ? 'YES' : '*** NO ***';
    console.log('  ' + name.padEnd(20) + valA.padEnd(20) + valB.padEnd(20) + match);
  }
  console.log('  ' + '-'.repeat(65));
}

// ==========================================================================
// Part A: gcd(12,8) with watch addresses
// ==========================================================================

function partA_gcdTrace(runtime) {
  const { mem, executor, cpu } = runtime;

  console.log(`\n${'='.repeat(70)}`);
  console.log('Part A: gcd(12,8) — trace FPDiv entries, JmpThru, gcd body');
  console.log(`${'='.repeat(70)}`);

  prepareCallState(cpu, mem);
  seedGcdFpState(mem);

  // Push OP2 (8.0) to FPS before gcd entry (same as phase 157/160/161)
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
  const MAX_STEPS_A = 1500;

  // Collected events
  const fpdivImplHits = [];
  const fpdivJtHits = [];
  const jmpThruHits = [];
  const gcdBodyHits = [];
  let firstFpdivState = null;

  // Also log every block for completeness (but not verbose — just watch addresses)
  const allBlocks = [];

  try {
    executor.runFrom(GCD_ENTRY, 'adl', {
      maxSteps: MAX_STEPS_A,
      maxLoopIterations: MAX_LOOP_ITER,

      onBlock(pc, mode, meta, step) {
        const norm = pc & 0xffffff;
        stepCount = noteStep(stepCount, step);

        allBlocks.push({ step: stepCount, pc: norm });

        // Watch: FPDiv implementation
        if (norm === FPDIV_IMPL) {
          const state = captureState(cpu, mem);
          fpdivImplHits.push({ step: stepCount, state });
          if (!firstFpdivState) firstFpdivState = state;
          console.log(`  >>> Step ${stepCount}: FPDiv IMPL entered (${hex(FPDIV_IMPL)}) <<<`);
          printState('FPDiv impl entry', state);
        }

        // Watch: FPDiv JT slot
        if (norm === FPDIV_JT) {
          const state = captureState(cpu, mem);
          fpdivJtHits.push({ step: stepCount, state });
          console.log(`  >>> Step ${stepCount}: FPDiv JT slot entered (${hex(FPDIV_JT)}) <<<`);
          printState('FPDiv JT entry', state);
        }

        // Watch: JmpThru
        if (norm === JMPTHRU) {
          const state = captureState(cpu, mem);
          jmpThruHits.push({ step: stepCount, state });
          // Try to read what JmpThru jumps to: the byte at [HL] or the 3-byte addr at the call site
          const hlVal = state.hl;
          const jumpTarget = read24(mem, hlVal);
          console.log(`  >>> Step ${stepCount}: JmpThru entered (${hex(JMPTHRU)}) HL=${hex(hlVal)} -> target=${hex(jumpTarget)} <<<`);
          console.log(`    OP1=[${formatBytes(state.op1)}] = ${decodeBcdRealBytes(state.op1)}`);
          console.log(`    OP2=[${formatBytes(state.op2)}] = ${decodeBcdRealBytes(state.op2)}`);
        }

        // Watch: gcd body range 0x068D95-0x068DEA
        if (norm >= GCD_BODY_LO && norm <= GCD_BODY_HI) {
          const op1 = readBytes(mem, OP1_ADDR, 9);
          const op2 = readBytes(mem, OP2_ADDR, 9);
          gcdBodyHits.push({ step: stepCount, pc: norm });
          console.log(`  >>> Step ${stepCount}: gcd body ${hex(norm)}${addrLabel(norm)} <<<`);
          console.log(`    OP1=[${formatBytes(op1)}] = ${decodeBcdRealBytes(op1)}`);
          console.log(`    OP2=[${formatBytes(op2)}] = ${decodeBcdRealBytes(op2)}`);
        }

        if (norm === FAKE_RET) throw new Error('__RET__');
        if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');
      },

      onMissingBlock(pc, mode, step) {
        const norm = pc & 0xffffff;
        stepCount = noteStep(stepCount, step);

        allBlocks.push({ step: stepCount, pc: norm, missing: true });

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
  console.log(`  ${'='.repeat(60)}`);
  console.log('  PART A SUMMARY');
  console.log(`  ${'='.repeat(60)}`);
  console.log(`  Outcome: ${outcome}`);
  console.log(`  Total steps: ${stepCount}`);
  console.log(`  Final OP1: [${formatBytes(finalOp1)}] = ${decodeBcdRealBytes(finalOp1)}`);
  console.log(`  Final OP2: [${formatBytes(finalOp2)}] = ${decodeBcdRealBytes(finalOp2)}`);
  console.log(`  errNo: ${hexByte(mem[ERR_NO_ADDR] & 0xff)} (${errName(mem[ERR_NO_ADDR] & 0xff)})`);
  console.log('');
  console.log(`  FPDiv impl (0x07CAB9) hits: ${fpdivImplHits.length}`);
  console.log(`  FPDiv JT   (0x0201F4) hits: ${fpdivJtHits.length}`);
  console.log(`  JmpThru    (0x080188) hits: ${jmpThruHits.length}`);
  console.log(`  gcd body   (0x068D95-0x068DEA) hits: ${gcdBodyHits.length}`);

  if (fpdivImplHits.length === 0) {
    console.log('');
    console.log('  *** FPDiv impl NEVER REACHED during gcd(12,8) ***');
    console.log('  The gcd body does NOT enter 0x07CAB9 within 1500 steps.');
    console.log('');
    console.log('  All unique PCs visited during gcd:');
    const uniquePCs = [...new Set(allBlocks.map(b => b.pc))].sort((a, b) => a - b);
    for (const pc of uniquePCs) {
      const count = allBlocks.filter(b => b.pc === pc).length;
      const missing = allBlocks.find(b => b.pc === pc && b.missing) ? ' [MISSING]' : '';
      console.log(`    ${hex(pc)}${addrLabel(pc)}${missing}  (${count}x)`);
    }
  }

  return { firstFpdivState, fpdivImplHits, outcome, stepCount };
}

// ==========================================================================
// Part B: Direct FPDiv(1200,1200)
// ==========================================================================

function partB_directFpDiv(runtime) {
  const { mem, executor, cpu } = runtime;

  console.log(`\n${'='.repeat(70)}`);
  console.log('Part B: Direct FPDiv(1200,1200) at 0x07CAB9');
  console.log(`${'='.repeat(70)}`);

  prepareCallState(cpu, mem);
  seedAllocator(mem);
  mem.fill(0x00, FPS_CLEAN_AREA, FPS_CLEAN_AREA + 0x40);
  write24(mem, FPSBASE_ADDR, FPS_CLEAN_AREA);
  write24(mem, FPS_ADDR, FPS_CLEAN_AREA);

  seedRealRegister(mem, OP1_ADDR, BCD_1200);
  seedRealRegister(mem, OP2_ADDR, BCD_1200);

  seedErrFrame(cpu, mem, FAKE_RET, ERR_CATCH_ADDR, 0);

  const entryState = captureState(cpu, mem);
  console.log('  Entry state for direct FPDiv(1200,1200):');
  printState('Direct FPDiv entry', entryState);

  let stepCount = 0;
  let outcome = 'budget';
  const MAX_STEPS_B = 300;

  try {
    executor.runFrom(FPDIV_IMPL, 'adl', {
      maxSteps: MAX_STEPS_B,
      maxLoopIterations: MAX_LOOP_ITER,

      onBlock(pc, mode, meta, step) {
        const norm = pc & 0xffffff;
        stepCount = noteStep(stepCount, step);

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

  const finalOp1 = readBytes(mem, OP1_ADDR, 9);
  const finalOp2 = readBytes(mem, OP2_ADDR, 9);

  console.log('');
  console.log(`  ${'='.repeat(60)}`);
  console.log('  PART B SUMMARY');
  console.log(`  ${'='.repeat(60)}`);
  console.log(`  Outcome: ${outcome}`);
  console.log(`  Total steps: ${stepCount}`);
  console.log(`  Result OP1: [${formatBytes(finalOp1)}] = ${decodeBcdRealBytes(finalOp1)}`);
  console.log(`  Result OP2: [${formatBytes(finalOp2)}] = ${decodeBcdRealBytes(finalOp2)}`);
  console.log(`  errNo: ${hexByte(mem[ERR_NO_ADDR] & 0xff)} (${errName(mem[ERR_NO_ADDR] & 0xff)})`);

  return { entryState, outcome, stepCount };
}

// ==========================================================================
// Part C: Comparison
// ==========================================================================

function partC_compare(partAResult, partBResult) {
  console.log(`\n${'='.repeat(70)}`);
  console.log('Part C: State comparison — gcd-context FPDiv entry vs direct call');
  console.log(`${'='.repeat(70)}`);

  if (!partAResult.firstFpdivState) {
    console.log('');
    console.log('  *** CANNOT COMPARE: FPDiv impl was never entered during gcd(12,8) ***');
    console.log('  This means the gcd algorithm does NOT route through 0x07CAB9.');
    console.log('  The division must happen via a different mechanism.');
    console.log('  Check the JmpThru targets and gcd body blocks above for clues.');
    return;
  }

  compareStates(partAResult.firstFpdivState, partBResult.entryState);
}

// --- Main ---

function main() {
  console.log('=== Phase 162: FPDiv entry state comparison — gcd context vs direct call ===');
  console.log('');

  const runtime = createPreparedRuntime();

  if (!runtime.memInitOk) {
    console.log('MEM_INIT failed; aborting.');
    process.exitCode = 1;
    return;
  }

  console.log('Cold boot + MEM_INIT complete.');

  // Part A: gcd trace
  const partAResult = partA_gcdTrace(runtime);

  // Re-create runtime for clean Part B
  const runtime2 = createPreparedRuntime();
  if (!runtime2.memInitOk) {
    console.log('MEM_INIT failed for Part B; aborting.');
    process.exitCode = 1;
    return;
  }

  // Part B: direct FPDiv
  const partBResult = partB_directFpDiv(runtime2);

  // Part C: comparison
  partC_compare(partAResult, partBResult);

  console.log('\nDone.');
  process.exitCode = 0;
}

try {
  main();
} catch (err) {
  console.error(err?.stack || String(err));
  process.exitCode = 1;
}
