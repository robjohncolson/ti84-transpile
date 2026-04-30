#!/usr/bin/env node

/**
 * Phase 169 - gcd_helper at 0x068D20: Full Disassembly + Dynamic Trace
 *
 * Two goals:
 * 1. Static disassembly of 0x068D20-0x068D3C (29 bytes)
 * 2. Dynamic trace of gcd_helper during gcd(12,8) — log every call,
 *    inputs/outputs, mantissa changes, and call count.
 * 3. Standalone test of gcd_helper with various inputs.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_BIN_PATH = path.join(__dirname, 'ROM.rom');
const ROM_TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');
const ROM_TRANSPILED_GZ_PATH = path.join(__dirname, 'ROM.transpiled.js.gz');

if (!fs.existsSync(ROM_BIN_PATH)) {
  throw new Error(`ROM binary not found: ${ROM_BIN_PATH}`);
}

if (!fs.existsSync(ROM_TRANSPILED_PATH)) {
  if (!fs.existsSync(ROM_TRANSPILED_GZ_PATH)) {
    throw new Error('ROM.transpiled.js and ROM.transpiled.js.gz both missing.');
  }
  console.log('ROM.transpiled.js not found — gunzipping...');
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
const OP1_EXP_ADDR = 0xd005f9;
const OP1_MANT_START = 0xd005fa;

const GCD_ENTRY = 0x068d3d;
const GCD_HELPER = 0x068d20;
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

// --- Runtime setup (same as phase 168) ---

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

function seedGcdFpState(mem, op1Bytes, op2Bytes) {
  seedAllocator(mem);
  mem.fill(0x00, FPS_CLEAN_AREA, FPS_CLEAN_AREA + 0x40);
  write24(mem, FPSBASE_ADDR, FPS_CLEAN_AREA);
  write24(mem, FPS_ADDR, FPS_CLEAN_AREA);
  seedRealRegister(mem, OP1_ADDR, op1Bytes);
  seedRealRegister(mem, OP2_ADDR, op2Bytes);
  mem[FP_CATEGORY_ADDR] = GCD_CATEGORY;
}

function createPreparedRuntime() {
  const runtime = createRuntime();
  coldBoot(runtime.executor, runtime.cpu, runtime.mem);

  const { executor, cpu, mem } = runtime;
  prepareCallState(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEMINIT_RET);

  let memInitOk = false;
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
    if (err?.message === '__RET__') memInitOk = true;
    else throw err;
  }

  return { ...runtime, memInitOk };
}

// ==========================================================================
// PART 1: Static Disassembly
// ==========================================================================

function printStaticDisassembly() {
  console.log('='.repeat(80));
  console.log('PART 1: STATIC DISASSEMBLY OF gcd_helper 0x068D20-0x068D3C');
  console.log('='.repeat(80));
  console.log('');

  // Two distinct routines live in this range:
  //
  // Routine A: gcd_helper (0x068D20-0x068D26)
  //   0x068D20:  21 F9 05 D0  LD HL, 0xD005F9    ; HL = OP1 exponent address
  //   0x068D24:  34           INC (HL)            ; exponent += 1
  //   0x068D25:  34           INC (HL)            ; exponent += 1 (total +2)
  //   0x068D26:  C9           RET
  //
  // Routine B: gcd_domain_check (0x068D27-0x068D3C)
  //   0x068D27:  CD 61 29 08  CALL 0x082961       ; PushRealO1
  //   0x068D2B:  CD 46 FA 07  CALL 0x07FA46       ; OP1Set1
  //   0x068D2F:  CD 61 29 08  CALL 0x082961       ; PushRealO1
  //   0x068D33:  CD 68 F9 07  CALL 0x07F968       ; OP2ToOP1
  //   0x068D37:  CD 88 01 08  CALL 0x080188       ; Errd_OP1_le_0
  //   0x068D3B:  18 AB        JR 0x068CE8         ; jump back (offset=-85)

  const lines = [
    ['0x068D20', '21 F9 05 D0', 'LD HL, 0xD005F9', 'HL = OP1 exponent byte address'],
    ['0x068D24', '34',          'INC (HL)',         'exponent += 1'],
    ['0x068D25', '34',          'INC (HL)',         'exponent += 1 (total +2, i.e. multiply by 100)'],
    ['0x068D26', 'C9',          'RET',              'return'],
    ['-----',    '',            '',                  'gcd_domain_check (separate routine)'],
    ['0x068D27', 'CD 61 29 08', 'CALL PushRealO1',  'push OP1 to FP stack (0x082961)'],
    ['0x068D2B', 'CD 46 FA 07', 'CALL OP1Set1',     'OP1 = 1.0 (0x07FA46)'],
    ['0x068D2F', 'CD 61 29 08', 'CALL PushRealO1',  'push 1.0 to FP stack (0x082961)'],
    ['0x068D33', 'CD 68 F9 07', 'CALL OP2ToOP1',    'OP1 = OP2 (0x07F968)'],
    ['0x068D37', 'CD 88 01 08', 'CALL Errd_OP1_le_0', 'error if OP1 <= 0 (0x080188)'],
    ['0x068D3B', '18 AB',       'JR 0x068CE8',      'jump back -85 bytes'],
  ];

  console.log('Addr     | Bytes       | Instruction          | Comment');
  console.log('-'.repeat(80));
  for (const [addr, bytes, instr, comment] of lines) {
    console.log(`${addr.padEnd(9)}| ${bytes.padEnd(12)}| ${instr.padEnd(21)}| ${comment}`);
  }

  console.log('');
  console.log('KEY FINDING: gcd_helper (0x068D20) is only 7 bytes:');
  console.log('  LD HL, &D005F9 ; INC (HL) ; INC (HL) ; RET');
  console.log('  It increments the OP1 exponent byte by 2 (multiply by 100).');
  console.log('  It does NOT touch the mantissa at all.');
  console.log('');
  console.log('  The code at 0x068D27 is a SEPARATE routine (gcd_domain_check)');
  console.log('  that saves OP1, sets OP1=1.0, checks OP2>0, then jumps to 0x068CE8.');
  console.log('');
}

// ==========================================================================
// PART 2: Dynamic Trace of gcd_helper During gcd(12,8)
// ==========================================================================

function runGcdTrace(runtime) {
  console.log('='.repeat(80));
  console.log('PART 2: DYNAMIC TRACE OF gcd_helper DURING gcd(12,8)');
  console.log('='.repeat(80));
  console.log('');

  const { mem, executor, cpu } = runtime;

  const op1Bytes = Uint8Array.from([0x00, 0x81, 0x12, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]); // 12.0
  const op2Bytes = Uint8Array.from([0x00, 0x80, 0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]); // 8.0

  prepareCallState(cpu, mem);
  seedGcdFpState(mem, op1Bytes, op2Bytes);

  // Push OP2 to FPS before gcd entry
  const fpsPtr = read24(mem, FPS_ADDR);
  const op2Copy = readBytes(mem, OP2_ADDR, 9);
  for (let i = 0; i < 9; i++) {
    mem[fpsPtr + i] = op2Copy[i];
  }
  write24(mem, FPS_ADDR, fpsPtr + 9);

  seedErrFrame(cpu, mem, FAKE_RET, ERR_CATCH_ADDR, 0);

  console.log(`Entry OP1: [${formatBytes(readBytes(mem, OP1_ADDR, 9))}] = ${decodeBcdRealBytes(readBytes(mem, OP1_ADDR, 9))}`);
  console.log(`Entry OP2: [${formatBytes(readBytes(mem, OP2_ADDR, 9))}] = ${decodeBcdRealBytes(readBytes(mem, OP2_ADDR, 9))}`);
  console.log('');

  // Track gcd_helper calls
  const helperCalls = [];
  let helperCallCount = 0;
  let pendingHelperEntry = null;

  // Track all blocks for general flow
  const blockLog = [];
  let stepCount = 0;
  let outcome = 'budget';

  try {
    executor.runFrom(GCD_ENTRY, 'adl', {
      maxSteps: MAX_STEPS,
      maxLoopIterations: MAX_LOOP_ITER,

      onBlock(pc, mode, meta, step) {
        const norm = pc & 0xffffff;
        stepCount = step + 1;

        if (norm === FAKE_RET) throw new Error('__RET__');
        if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');

        // If we just exited gcd_helper, capture the after state
        if (pendingHelperEntry !== null && norm !== GCD_HELPER) {
          pendingHelperEntry.afterOP1 = readBytes(mem, OP1_ADDR, 9);
          pendingHelperEntry.afterOP2 = readBytes(mem, OP2_ADDR, 9);
          pendingHelperEntry.afterA = cpu.a & 0xff;
          pendingHelperEntry.exitPC = norm;
          helperCalls.push(pendingHelperEntry);
          pendingHelperEntry = null;
        }

        // Detect gcd_helper entry
        if (norm === GCD_HELPER) {
          helperCallCount++;
          pendingHelperEntry = {
            callNum: helperCallCount,
            step: stepCount,
            beforeOP1: readBytes(mem, OP1_ADDR, 9),
            beforeOP2: readBytes(mem, OP2_ADDR, 9),
            beforeA: cpu.a & 0xff,
            beforeHL: cpu.hl,
            beforeSP: cpu.sp,
          };
        }

        // Log blocks in the gcd range (0x068D00-0x068DFF) for context
        if (norm >= 0x068D00 && norm <= 0x068DFF) {
          blockLog.push({
            step: stepCount,
            pc: norm,
            a: cpu.a & 0xff,
            hl: cpu.hl,
            sp: cpu.sp,
            op1exp: mem[OP1_EXP_ADDR] & 0xff,
          });
        }
      },

      onMissingBlock(pc, mode, step) {
        const norm = pc & 0xffffff;
        stepCount = step + 1;
        if (norm === FAKE_RET) throw new Error('__RET__');
        if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');
      },
    });
  } catch (err) {
    if (err?.message === '__RET__') outcome = 'return';
    else if (err?.message === '__ERR__') outcome = 'error';
    else {
      outcome = 'threw';
      console.log(`Thrown: ${(err?.stack || String(err)).split('\n')[0]}`);
    }
  }

  // Flush any pending helper entry
  if (pendingHelperEntry !== null) {
    pendingHelperEntry.afterOP1 = readBytes(mem, OP1_ADDR, 9);
    pendingHelperEntry.afterOP2 = readBytes(mem, OP2_ADDR, 9);
    pendingHelperEntry.afterA = cpu.a & 0xff;
    pendingHelperEntry.exitPC = 0;
    helperCalls.push(pendingHelperEntry);
  }

  const errNo = mem[ERR_NO_ADDR] & 0xff;
  const finalOP1 = readBytes(mem, OP1_ADDR, 9);
  const finalOP2 = readBytes(mem, OP2_ADDR, 9);

  console.log(`Outcome: ${outcome}, steps: ${stepCount}`);
  console.log(`Error: ${hexByte(errNo)} (${errName(errNo)})`);
  console.log(`Final OP1: [${formatBytes(finalOP1)}] = ${decodeBcdRealBytes(finalOP1)}`);
  console.log(`Final OP2: [${formatBytes(finalOP2)}] = ${decodeBcdRealBytes(finalOP2)}`);
  console.log('');

  // Report gcd_helper calls
  console.log(`gcd_helper called ${helperCalls.length} time(s):`);
  console.log('');

  for (const call of helperCalls) {
    const beforeVal = decodeBcdRealBytes(call.beforeOP1);
    const afterVal = decodeBcdRealBytes(call.afterOP1);
    const beforeExp = hexByte(call.beforeOP1[1]);
    const afterExp = hexByte(call.afterOP1[1]);

    const mantBefore = call.beforeOP1.slice(2);
    const mantAfter = call.afterOP1.slice(2);
    const mantChanged = !mantBefore.every((b, i) => b === mantAfter[i]);

    console.log(`  Call #${call.callNum} at step ${call.step}:`);
    console.log(`    BEFORE OP1: [${formatBytes(call.beforeOP1)}] = ${beforeVal} (exp=${beforeExp})`);
    console.log(`    AFTER  OP1: [${formatBytes(call.afterOP1)}] = ${afterVal} (exp=${afterExp})`);
    console.log(`    Exponent change: ${beforeExp} -> ${afterExp} (delta=${(call.afterOP1[1] - call.beforeOP1[1])})`);
    console.log(`    Mantissa changed: ${mantChanged ? '**YES**' : 'No'}`);
    if (mantChanged) {
      console.log(`    BEFORE mantissa: [${formatBytes(mantBefore)}]`);
      console.log(`    AFTER  mantissa: [${formatBytes(mantAfter)}]`);
    }
    console.log(`    A: ${hexByte(call.beforeA)} -> ${hexByte(call.afterA)}`);
    console.log(`    Return to: ${hex(call.exitPC)}`);
    console.log('');
  }

  // Block log for gcd range
  console.log('Block trace in gcd range (0x068D00-0x068DFF):');
  console.log('  step | PC       | A  | HL       | SP       | OP1.exp');
  console.log('  ' + '-'.repeat(60));
  for (const entry of blockLog) {
    console.log(`  ${String(entry.step).padStart(4)} | ${hex(entry.pc)} | ${hexByte(entry.a)} | ${hex(entry.hl)} | ${hex(entry.sp)} | ${hexByte(entry.op1exp)}`);
  }
  console.log('');
}

// ==========================================================================
// PART 3: Standalone Tests of gcd_helper
// ==========================================================================

function runStandaloneTest(runtime, label, op1Bytes) {
  const { mem, executor, cpu } = runtime;

  prepareCallState(cpu, mem);
  seedAllocator(mem);
  seedRealRegister(mem, OP1_ADDR, op1Bytes);

  // Push a return address
  cpu.sp -= 3;
  write24(mem, cpu.sp, FAKE_RET);

  const before = readBytes(mem, OP1_ADDR, 9);
  let outcome = 'budget';
  let stepCount = 0;

  try {
    executor.runFrom(GCD_HELPER, 'adl', {
      maxSteps: 50,
      maxLoopIterations: 32,
      onBlock(pc, mode, meta, step) {
        stepCount = step + 1;
        if ((pc & 0xffffff) === FAKE_RET) throw new Error('__RET__');
      },
      onMissingBlock(pc, mode, step) {
        stepCount = step + 1;
        if ((pc & 0xffffff) === FAKE_RET) throw new Error('__RET__');
      },
    });
  } catch (err) {
    if (err?.message === '__RET__') outcome = 'return';
    else {
      outcome = 'threw';
      console.log(`  Thrown: ${(err?.stack || String(err)).split('\n')[0]}`);
    }
  }

  const after = readBytes(mem, OP1_ADDR, 9);
  const mantBefore = before.slice(2);
  const mantAfter = after.slice(2);
  const mantChanged = !mantBefore.every((b, i) => b === mantAfter[i]);

  console.log(`  ${label}:`);
  console.log(`    BEFORE: [${formatBytes(before)}] = ${decodeBcdRealBytes(before)}`);
  console.log(`    AFTER:  [${formatBytes(after)}] = ${decodeBcdRealBytes(after)}`);
  console.log(`    Exp: ${hexByte(before[1])} -> ${hexByte(after[1])} (delta=${after[1] - before[1]})`);
  console.log(`    Mantissa changed: ${mantChanged ? '**YES**' : 'No'}`);
  console.log(`    Outcome: ${outcome}, steps: ${stepCount}`);
  console.log('');
}

function runStandaloneTests(runtime) {
  console.log('='.repeat(80));
  console.log('PART 3: STANDALONE TESTS OF gcd_helper (0x068D20)');
  console.log('='.repeat(80));
  console.log('');

  // OP1 = 12.0: [00 81 12 00 00 00 00 00 00]
  runStandaloneTest(runtime, 'OP1=12', Uint8Array.from([0x00, 0x81, 0x12, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]));

  // OP1 = 8.0: [00 80 80 00 00 00 00 00 00]
  runStandaloneTest(runtime, 'OP1=8', Uint8Array.from([0x00, 0x80, 0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]));

  // OP1 = 100.0: [00 82 10 00 00 00 00 00 00]
  runStandaloneTest(runtime, 'OP1=100', Uint8Array.from([0x00, 0x82, 0x10, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]));

  // OP1 = 1200.0: [00 83 12 00 00 00 00 00 00]
  runStandaloneTest(runtime, 'OP1=1200', Uint8Array.from([0x00, 0x83, 0x12, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]));

  // OP1 = 0.12: [00 7F 12 00 00 00 00 00 00]
  runStandaloneTest(runtime, 'OP1=0.12', Uint8Array.from([0x00, 0x7F, 0x12, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]));

  // OP1 = 1.0: [00 80 10 00 00 00 00 00 00]
  runStandaloneTest(runtime, 'OP1=1', Uint8Array.from([0x00, 0x80, 0x10, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]));
}

// ==========================================================================
// Main
// ==========================================================================

function main() {
  console.log('=== Phase 169: gcd_helper Disassembly + Dynamic Trace ===');
  console.log('');

  // Part 1: Static disassembly (no runtime needed)
  printStaticDisassembly();

  // Part 2 & 3: Need runtime
  const runtime = createPreparedRuntime();

  if (!runtime.memInitOk) {
    console.log('MEM_INIT failed; aborting.');
    process.exitCode = 1;
    return;
  }

  console.log('Cold boot + MEM_INIT complete.');
  console.log('');

  // Part 2: Dynamic trace during gcd(12,8)
  runGcdTrace(runtime);

  // Part 3: Standalone tests
  runStandaloneTests(runtime);

  // Summary
  console.log('='.repeat(80));
  console.log('SUMMARY');
  console.log('='.repeat(80));
  console.log('');
  console.log('gcd_helper at 0x068D20 is a 7-byte function:');
  console.log('  LD HL, 0xD005F9  ; point to OP1 exponent byte');
  console.log('  INC (HL)         ; exponent += 1');
  console.log('  INC (HL)         ; exponent += 1');
  console.log('  RET              ; total effect: multiply OP1 by 100');
  console.log('');
  console.log('It modifies ONLY the exponent. Mantissa is untouched.');
  console.log('');

  console.log('Done.');
  process.exitCode = 0;
}

try {
  main();
} catch (err) {
  console.error(err?.stack || String(err));
  process.exitCode = 1;
}
