#!/usr/bin/env node

/**
 * Phase 149 - gcd sign corruption trace.
 *
 * Runs gcd(12,8) via direct handler at 0x068D3D and captures OP1/OP2
 * snapshots at EVERY block execution. Finds the exact instruction that
 * corrupts the type byte from 0x00 to 0x80.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

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
const GCD_DIRECT_ADDR = 0x068d3d;

const TYPE_VALIDATOR_ADDR = 0x07f831;
const CONST_LOADER_ADDR = 0x07fa74;
const REAL_FP_POP_ADDR = 0x0828fc;
const FPS_DEC9_ADDR = 0x082912;

const FAKE_RET = 0x7ffffe;
const ERR_CATCH_ADDR = 0x7ffffa;

const MEMINIT_BUDGET = 100000;
const MAX_STEPS = 5000;
const MAX_LOOP_ITER = 8192;

const FPS_CLEAN_AREA = 0xd1aa00;
const FPS_ENTRY_SIZE = 9;
const GCD_CATEGORY = 0x28;

const BCD_12 = Uint8Array.from([0x00, 0x81, 0x12, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
const BCD_8 = Uint8Array.from([0x00, 0x80, 0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

const hex = (v, w = 6) =>
  v === undefined || v === null
    ? 'n/a'
    : `0x${(Number(v) >>> 0).toString(16).toUpperCase().padStart(w, '0')}`;

const read24 = (m, a) =>
  ((m[a] & 0xff) | ((m[a + 1] & 0xff) << 8) | ((m[a + 2] & 0xff) << 16)) >>> 0;

function write24(m, a, v) {
  m[a] = v & 0xff;
  m[a + 1] = (v >>> 8) & 0xff;
  m[a + 2] = (v >>> 16) & 0xff;
}

function hexBytes(m, a, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push((m[a + i] & 0xff).toString(16).toUpperCase().padStart(2, '0'));
  }
  return out.join(' ');
}

function snapshotBytes(m, a, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push(m[a + i] & 0xff);
  }
  return out;
}

function decodeBCDFloat(mem, addr) {
  const type = mem[addr] & 0xff;
  const exp = mem[addr + 1] & 0xff;
  const digits = [];
  for (let i = 2; i < 9; i++) {
    const b = mem[addr + i] & 0xff;
    digits.push((b >> 4) & 0xf, b & 0xf);
  }
  const sign = (type & 0x80) ? -1 : 1;
  const exponent = (exp & 0x7f) - 0x40;
  if (digits.every((d) => d === 0)) return '0';
  let mantissa = '';
  for (let i = 0; i < digits.length; i++) {
    if (i === exponent + 1) mantissa += '.';
    mantissa += digits[i];
  }
  return `${sign < 0 ? '-' : ''}${mantissa.replace(/\.?0+$/, '') || '0'} (exp=${exponent})`;
}

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
  return base;
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
  } catch (e) {
    if (e?.message === '__RET__') ok = true;
    else throw e;
  }
  return ok;
}

function seedGcdState(mem) {
  seedAllocator(mem);

  write24(mem, FPSBASE_ADDR, FPS_CLEAN_AREA);
  mem.fill(0x00, FPS_CLEAN_AREA, FPS_CLEAN_AREA + 32);
  mem.set(BCD_12, FPS_CLEAN_AREA);
  mem.set(BCD_8, FPS_CLEAN_AREA + FPS_ENTRY_SIZE);
  write24(mem, FPS_ADDR, FPS_CLEAN_AREA + (2 * FPS_ENTRY_SIZE));

  mem.set(BCD_12, OP1_ADDR);
  mem.fill(0x00, OP1_ADDR + 9, OP1_ADDR + 11);
  mem.set(BCD_8, OP2_ADDR);
  mem.fill(0x00, OP2_ADDR + 9, OP2_ADDR + 11);
  mem[FP_CATEGORY_ADDR] = GCD_CATEGORY;
}

function main() {
  console.log('=== Phase 149: gcd sign corruption trace ===');
  console.log('');

  // --- Build runtime ---
  const { mem, executor, cpu } = createRuntime();
  coldBoot(executor, cpu, mem);
  const memInitOk = runMemInit(executor, cpu, mem);
  console.log(`MEM_INIT: ${memInitOk ? 'OK' : 'FAILED'}`);
  if (!memInitOk) {
    console.log('ABORT: MEM_INIT failed');
    process.exitCode = 1;
    return;
  }

  // --- Seed gcd state ---
  seedGcdState(mem);
  prepareCallState(cpu, mem);
  seedErrFrame(cpu, mem, FAKE_RET, ERR_CATCH_ADDR, 0);

  console.log(`Initial OP1: [${hexBytes(mem, OP1_ADDR, 9)}]  = ${decodeBCDFloat(mem, OP1_ADDR)}`);
  console.log(`Initial OP2: [${hexBytes(mem, OP2_ADDR, 9)}]  = ${decodeBCDFloat(mem, OP2_ADDR)}`);
  console.log('');

  // --- Run with per-block OP1/OP2 snapshots ---
  const snapshots = [];
  let stepCount = 0;
  let outcome = 'budget';

  // Notable PCs to flag
  const NOTABLE = {
    [TYPE_VALIDATOR_ADDR]: 'TypeValidator',
    [CONST_LOADER_ADDR]: '1.0_ConstLoader',
    [REAL_FP_POP_ADDR]: 'RealFpPop',
    [FPS_DEC9_ADDR]: 'FPS-=9',
    [GCD_DIRECT_ADDR]: 'GcdDirect',
  };

  try {
    executor.runFrom(GCD_DIRECT_ADDR, 'adl', {
      maxSteps: MAX_STEPS,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc) {
        const norm = pc & 0xffffff;
        stepCount++;
        const op1 = snapshotBytes(mem, OP1_ADDR, 9);
        const op2 = snapshotBytes(mem, OP2_ADDR, 9);
        snapshots.push({ step: stepCount, pc: norm, op1, op2 });
        if (norm === FAKE_RET) throw new Error('__RET__');
        if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');
      },
      onMissingBlock(pc) {
        const norm = pc & 0xffffff;
        stepCount++;
        const op1 = snapshotBytes(mem, OP1_ADDR, 9);
        const op2 = snapshotBytes(mem, OP2_ADDR, 9);
        snapshots.push({ step: stepCount, pc: norm, op1, op2, missing: true });
        if (norm === FAKE_RET) throw new Error('__RET__');
        if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');
      },
    });
  } catch (e) {
    if (e?.message === '__RET__') {
      outcome = 'return';
    } else if (e?.message === '__ERR__') {
      outcome = 'error';
    } else {
      outcome = 'threw';
      console.log(`EXCEPTION: ${e?.stack || String(e)}`);
    }
  }

  console.log(`Outcome: ${outcome}`);
  console.log(`Total steps: ${stepCount}`);
  console.log(`Total snapshots: ${snapshots.length}`);
  console.log(`Final OP1: [${hexBytes(mem, OP1_ADDR, 9)}]  = ${decodeBCDFloat(mem, OP1_ADDR)}`);
  console.log(`Final OP2: [${hexBytes(mem, OP2_ADDR, 9)}]  = ${decodeBCDFloat(mem, OP2_ADDR)}`);
  console.log(`errNo: ${hex(mem[ERR_NO_ADDR] & 0xff, 2)}`);
  console.log('');

  // --- Find OP1[0] and OP2[0] transitions ---
  console.log('========================================================================');
  console.log('OP1[0] (type byte) transitions:');
  console.log('========================================================================');
  let prevOp1_0 = BCD_12[0]; // initial seeded value = 0x00
  let transitionCount = 0;
  for (const snap of snapshots) {
    if (snap.op1[0] !== prevOp1_0) {
      transitionCount++;
      const tag = NOTABLE[snap.pc] || '';
      console.log(
        `  step ${snap.step} @ ${hex(snap.pc)} ${tag ? `[${tag}]` : ''}: ` +
        `OP1[0] ${hex(prevOp1_0, 2)} -> ${hex(snap.op1[0], 2)}  ` +
        `OP1=[${snap.op1.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ')}]`
      );
      prevOp1_0 = snap.op1[0];
    }
  }
  if (transitionCount === 0) console.log('  (no transitions)');
  console.log('');

  console.log('========================================================================');
  console.log('OP2[0] (type byte) transitions:');
  console.log('========================================================================');
  let prevOp2_0 = BCD_8[0]; // initial seeded value = 0x00
  transitionCount = 0;
  for (const snap of snapshots) {
    if (snap.op2[0] !== prevOp2_0) {
      transitionCount++;
      const tag = NOTABLE[snap.pc] || '';
      console.log(
        `  step ${snap.step} @ ${hex(snap.pc)} ${tag ? `[${tag}]` : ''}: ` +
        `OP2[0] ${hex(prevOp2_0, 2)} -> ${hex(snap.op2[0], 2)}  ` +
        `OP2=[${snap.op2.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ')}]`
      );
      prevOp2_0 = snap.op2[0];
    }
  }
  if (transitionCount === 0) console.log('  (no transitions)');
  console.log('');

  // --- Check state at type validator ---
  console.log('========================================================================');
  console.log('State at type validator (0x07F831):');
  console.log('========================================================================');
  const validatorSnaps = snapshots.filter(s => s.pc === TYPE_VALIDATOR_ADDR);
  if (validatorSnaps.length === 0) {
    console.log('  Type validator was NOT reached');
  } else {
    for (const snap of validatorSnaps) {
      console.log(
        `  step ${snap.step}: OP1=[${snap.op1.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ')}]` +
        `  OP2=[${snap.op2.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ')}]`
      );
      console.log(
        `    OP1[0]=${hex(snap.op1[0], 2)} OP2[0]=${hex(snap.op2[0], 2)}`
      );
      // Analyze the type byte
      for (const [label, typeByte] of [['OP1', snap.op1[0]], ['OP2', snap.op2[0]]]) {
        const signBit = (typeByte & 0x80) !== 0;
        const baseType = typeByte & 0x7f;
        if (typeByte === 0x00) {
          console.log(`    ${label}: type=0x00 -> positive Real`);
        } else if (typeByte === 0x80) {
          console.log(`    ${label}: type=0x80 -> bit7 set. If sign bit: negative Real. If type code: invalid.`);
        } else {
          console.log(`    ${label}: type=${hex(typeByte, 2)} sign=${signBit ? 'neg' : 'pos'} baseType=${hex(baseType, 2)}`);
        }
      }
    }
  }
  console.log('');

  // --- Dump surrounding context for first 0x80 appearance ---
  console.log('========================================================================');
  console.log('Context around first type byte corruption:');
  console.log('========================================================================');
  const firstCorruptIdx = snapshots.findIndex(
    s => s.op1[0] === 0x80 || s.op2[0] === 0x80
  );
  if (firstCorruptIdx === -1) {
    console.log('  No 0x80 type byte found in any snapshot');
  } else {
    const start = Math.max(0, firstCorruptIdx - 5);
    const end = Math.min(snapshots.length, firstCorruptIdx + 6);
    for (let i = start; i < end; i++) {
      const snap = snapshots[i];
      const marker = i === firstCorruptIdx ? ' <<<' : '';
      const tag = NOTABLE[snap.pc] ? ` [${NOTABLE[snap.pc]}]` : '';
      const miss = snap.missing ? ' MISSING' : '';
      console.log(
        `  [${snap.step}] ${hex(snap.pc)}${tag}${miss}: ` +
        `OP1[0]=${hex(snap.op1[0], 2)} OP2[0]=${hex(snap.op2[0], 2)}` +
        `  OP1=[${snap.op1.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ')}]` +
        `  OP2=[${snap.op2.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ')}]` +
        marker
      );
    }
  }
  console.log('');

  // --- Notable PCs hit summary ---
  console.log('========================================================================');
  console.log('Notable PC hit counts:');
  console.log('========================================================================');
  for (const [addrStr, label] of Object.entries(NOTABLE)) {
    const addr = Number(addrStr);
    const hits = snapshots.filter(s => s.pc === addr);
    console.log(`  ${hex(addr)} ${label}: ${hits.length} hits`);
    for (const h of hits) {
      console.log(
        `    step ${h.step}: OP1[0]=${hex(h.op1[0], 2)} OP2[0]=${hex(h.op2[0], 2)}`
      );
    }
  }
  console.log('');

  // --- FPS state at end ---
  console.log(`Final FPS ptr: ${hex(read24(mem, FPS_ADDR))}`);
  console.log(`Final FPS base: ${hex(read24(mem, FPSBASE_ADDR))}`);

  process.exitCode = outcome === 'return' ? 0 : 1;
}

try {
  main();
} catch (error) {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
}
