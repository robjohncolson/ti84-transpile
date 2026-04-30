#!/usr/bin/env node

/**
 * Phase 168 - Instruction-level single-step through normalize 0x07CA48
 *
 * Traces every block during the first normalize call from compound 0x07C747
 * during gcd(12,8). For blocks containing RLD instructions (especially the
 * Shl14 RLD chain at 0x07FB50), captures memory state before and after,
 * simulates expected RLD behavior, and flags any mismatches.
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
const MAX_STEPS = 2000;

// Normalize and Shl14 address ranges
const NORM_ENTRY = 0x07ca48;
const NORM_END = 0x07cab8;
const SHL14_ENTRY = 0x07fb33;
const SHL14_END = 0x07fb65;
const SHL14_RLD_CHAIN = 0x07fb50; // Block with the 8 RLD instructions

// Mantissa bytes: OP1 at 0xD005FA-0xD00600 (7 bytes), exponent at 0xD005F9
const OP1_EXP_ADDR = 0xd005f9;
const OP1_MANT_START = 0xd005fa;
const OP1_MANT_END = 0xd00600;

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

// --- Simulated RLD ---
// RLD: high nibble of (HL) -> low nibble of A
//      low nibble of (HL) -> high nibble of (HL)
//      low nibble of A    -> low nibble of (HL)
function simulateRld(a, memByte) {
  const newMem = ((memByte << 4) | (a & 0x0f)) & 0xff;
  const newA = (a & 0xf0) | ((memByte >> 4) & 0x0f);
  return { a: newA, mem: newMem };
}

// --- Runtime setup (same as phase 167) ---

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
// Main probe
// ==========================================================================

function main() {
  console.log('=== Phase 168: Instruction-Level Single-Step Through Normalize ===');
  console.log('');

  const runtime = createPreparedRuntime();

  if (!runtime.memInitOk) {
    console.log('MEM_INIT failed; aborting.');
    process.exitCode = 1;
    return;
  }

  console.log('Cold boot + MEM_INIT complete.');
  console.log('');

  const { mem, executor, cpu } = runtime;

  // Set up gcd(12,8)
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

  // ---- Phase 1: Run until we enter normalize (0x07CA48) ----
  // The normalize function is called from compound 0x07C747.
  // We run gcd until the first time PC == 0x07CA48.

  let stepCount = 0;
  let outcome = 'budget';
  let enteredNormalize = false;

  // Trace log for blocks inside normalize/Shl14
  const normTrace = [];

  // RLD verification records
  const rldRecords = [];

  // Track each Shl14 call (there may be multiple normalize iterations)
  let shl14CallCount = 0;

  // State: are we inside the normalize function?
  let inNormalize = false;
  let normalizeCallCount = 0;
  let normalizeExitStep = 0;

  // For RLD chain blocks, we need to capture state BEFORE the block executes.
  // The onBlock callback fires before execution, so we can snapshot there.
  // But to see the AFTER state, we need to capture it at the NEXT onBlock call.
  let pendingRldSnapshot = null;

  try {
    executor.runFrom(GCD_ENTRY, 'adl', {
      maxSteps: MAX_STEPS,
      maxLoopIterations: MAX_LOOP_ITER,

      onBlock(pc, mode, meta, step) {
        const norm = pc & 0xffffff;
        stepCount = step + 1;

        if (norm === FAKE_RET) throw new Error('__RET__');
        if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');

        // If we had a pending RLD snapshot, capture the AFTER state now
        if (pendingRldSnapshot !== null) {
          const snap = pendingRldSnapshot;
          snap.afterA = cpu.a & 0xff;
          snap.afterHL = cpu.hl;
          snap.afterMantissa = readBytes(mem, OP1_MANT_START, 7);
          snap.afterExponent = mem[OP1_EXP_ADDR] & 0xff;
          snap.afterStep = stepCount;

          // Now simulate the RLD chain and compare
          rldRecords.push(snap);
          pendingRldSnapshot = null;
        }

        // Detect entering normalize
        if (norm === NORM_ENTRY) {
          normalizeCallCount++;
          inNormalize = true;
          console.log(`[step ${stepCount}] ENTERED normalize #${normalizeCallCount}`);
          console.log(`  OP1: [${formatBytes(readBytes(mem, OP1_ADDR, 9))}] = ${decodeBcdRealBytes(readBytes(mem, OP1_ADDR, 9))}`);
          console.log(`  A=${hexByte(cpu.a)} HL=${hex(cpu.hl)} SP=${hex(cpu.sp)}`);
        }

        // Log blocks inside normalize or Shl14
        const inNormRange = norm >= NORM_ENTRY && norm <= NORM_END;
        const inShl14Range = norm >= SHL14_ENTRY && norm <= SHL14_END;

        if (inNormalize && (inNormRange || inShl14Range)) {
          // Read opcode bytes at this PC (up to 4 bytes)
          const opcodeBytes = readBytes(mem, norm, 4);
          const mantissa = readBytes(mem, OP1_MANT_START, 7);
          const exponent = mem[OP1_EXP_ADDR] & 0xff;

          const entry = {
            step: stepCount,
            pc: norm,
            opcodes: formatBytes(opcodeBytes),
            a: cpu.a & 0xff,
            hl: cpu.hl,
            memAtHL: mem[cpu.hl] & 0xff,
            exponent,
            mantissa: [...mantissa],
            sp: cpu.sp,
          };
          normTrace.push(entry);

          // Check if this block starts an RLD chain (contains RLD instructions)
          // We identify RLD chain blocks by checking if the block body contains cpu.rld()
          const blockKey = norm.toString(16).padStart(6, '0') + ':adl';
          const block = BLOCKS[blockKey];
          if (block) {
            const blockBody = block.body ?? block.source ?? '';
            const rldCount = (blockBody.match(/cpu\.rld\(\)/g) || []).length;

            if (rldCount > 0) {
              shl14CallCount++;
              console.log(`[step ${stepCount}] RLD chain block at ${hex(norm)} (${rldCount} RLD instructions)`);
              console.log(`  BEFORE: A=${hexByte(cpu.a)} HL=${hex(cpu.hl)} mem[HL]=${hexByte(mem[cpu.hl])}`);
              console.log(`  Mantissa: [${formatBytes(mantissa)}]`);
              console.log(`  Exponent: ${hexByte(exponent)}`);

              // Snapshot state before block executes
              pendingRldSnapshot = {
                shl14Call: shl14CallCount,
                normalizeCall: normalizeCallCount,
                step: stepCount,
                pc: norm,
                rldCount,
                beforeA: cpu.a & 0xff,
                beforeHL: cpu.hl,
                beforeMantissa: [...mantissa],
                beforeExponent: exponent,
                // Snapshot the individual bytes that RLD will operate on
                // HL starts at some address and decrements after each RLD
                // We need to capture mem[HL], mem[HL-1], ..., mem[HL-(rldCount-1)]
                beforeMemBytes: [],
              };

              // Capture all memory bytes that the RLD chain will touch
              let hlVal = cpu.hl;
              for (let i = 0; i < rldCount; i++) {
                pendingRldSnapshot.beforeMemBytes.push({
                  addr: hlVal,
                  value: mem[hlVal] & 0xff,
                });
                hlVal = (hlVal - 1) & 0xffffff; // DEC HL between RLDs
              }
            }
          }
        }

        // Detect leaving normalize (PC outside normalize AND outside Shl14 AND outside other subroutines)
        // We track when PC returns to the caller of normalize
        if (inNormalize && !inNormRange && !inShl14Range) {
          // Could be inside another subroutine called by normalize
          // We'll consider normalize done when PC returns to the compound function range
          // Compound function is at 0x07C747. Return to caller would be the block after
          // the CALL normalize instruction.
          // For now, just track but don't exit - we'll track all normalize activity
        }
      },

      onMissingBlock(pc, mode, step) {
        const norm = pc & 0xffffff;
        stepCount = step + 1;
        if (norm === FAKE_RET) throw new Error('__RET__');
        if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');

        if (inNormalize) {
          normTrace.push({
            step: stepCount,
            pc: norm,
            opcodes: 'MISSING',
            a: cpu.a & 0xff,
            hl: cpu.hl,
            memAtHL: mem[cpu.hl] & 0xff,
            exponent: mem[OP1_EXP_ADDR] & 0xff,
            mantissa: readBytes(mem, OP1_MANT_START, 7),
            sp: cpu.sp,
            missing: true,
          });
        }
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

  // Handle any pending RLD snapshot that didn't get resolved
  if (pendingRldSnapshot !== null) {
    const snap = pendingRldSnapshot;
    snap.afterA = cpu.a & 0xff;
    snap.afterHL = cpu.hl;
    snap.afterMantissa = readBytes(mem, OP1_MANT_START, 7);
    snap.afterExponent = mem[OP1_EXP_ADDR] & 0xff;
    snap.afterStep = stepCount;
    rldRecords.push(snap);
    pendingRldSnapshot = null;
  }

  // ==========================================================================
  // Reports
  // ==========================================================================

  const errNo = mem[ERR_NO_ADDR] & 0xff;
  const finalOP1 = readBytes(mem, OP1_ADDR, 9);
  const finalOP2 = readBytes(mem, OP2_ADDR, 9);

  console.log('');
  console.log('='.repeat(80));
  console.log('EXECUTION RESULT');
  console.log('='.repeat(80));
  console.log(`  Outcome:       ${outcome}`);
  console.log(`  Steps:         ${stepCount}`);
  console.log(`  errNo:         ${hexByte(errNo)} (${errName(errNo)})`);
  console.log(`  Normalize calls: ${normalizeCallCount}`);
  console.log(`  Shl14 RLD chains: ${shl14CallCount}`);
  console.log(`  Final OP1:     [${formatBytes(finalOP1)}] = ${decodeBcdRealBytes(finalOP1)}`);
  console.log(`  Final OP2:     [${formatBytes(finalOP2)}] = ${decodeBcdRealBytes(finalOP2)}`);
  console.log('');

  // --- Part A: Full trace of blocks inside normalize ---
  console.log('='.repeat(80));
  console.log('PART A: BLOCK TRACE INSIDE NORMALIZE / SHL14');
  console.log('='.repeat(80));
  console.log('');
  console.log('step | PC       | Opcodes      | A  | HL       | (HL) | Exp | Mantissa');
  console.log('-'.repeat(100));

  for (const entry of normTrace) {
    const mantStr = formatBytes(entry.mantissa);
    const marker = entry.missing ? ' [MISSING]' : '';
    console.log(
      `${String(entry.step).padStart(4)} | ${hex(entry.pc)} | ${entry.opcodes.padEnd(12)} | ${hexByte(entry.a)} | ${hex(entry.hl)} | ${hexByte(entry.memAtHL)}   | ${hexByte(entry.exponent)}  | ${mantStr}${marker}`
    );
  }
  console.log('');

  // --- Part B: RLD chain verification ---
  console.log('='.repeat(80));
  console.log('PART B: RLD CHAIN VERIFICATION');
  console.log('='.repeat(80));
  console.log('');

  let anyBug = false;

  for (const rec of rldRecords) {
    console.log(`--- Shl14 call #${rec.shl14Call} (normalize #${rec.normalizeCall}) at step ${rec.step} ---`);
    console.log(`  Block PC: ${hex(rec.pc)}, ${rec.rldCount} RLD instructions`);
    console.log(`  BEFORE: A=${hexByte(rec.beforeA)} HL=${hex(rec.beforeHL)}`);
    console.log(`  BEFORE mantissa: [${formatBytes(rec.beforeMantissa)}]`);
    console.log(`  BEFORE exponent: ${hexByte(rec.beforeExponent)}`);
    console.log('');

    // Simulate the RLD chain step by step
    console.log('  Step-by-step RLD simulation:');
    let simA = rec.beforeA;
    let simHL = rec.beforeHL;

    for (let i = 0; i < rec.rldCount; i++) {
      const memInfo = rec.beforeMemBytes[i];
      const actualMemBefore = memInfo.value;

      // RLD operates on (HL)
      const result = simulateRld(simA, actualMemBefore);

      console.log(`    RLD #${i + 1}: addr=${hex(memInfo.addr)} mem_before=${hexByte(actualMemBefore)}`);
      console.log(`      A: ${hexByte(simA)} -> ${hexByte(result.a)}`);
      console.log(`      (HL): ${hexByte(actualMemBefore)} -> ${hexByte(result.mem)}`);

      simA = result.a;

      // After each RLD (except the last), there's a DEC HL
      if (i < rec.rldCount - 1) {
        simHL = (simHL - 1) & 0xffffff;
      }
    }

    console.log('');
    console.log(`  EXPECTED after chain: A=${hexByte(simA)} HL=${hex(simHL)}`);
    console.log(`  ACTUAL  after chain:  A=${hexByte(rec.afterA)} HL=${hex(rec.afterHL)}`);

    // Check A
    if (simA !== rec.afterA) {
      console.log(`  **BUG FOUND**: A mismatch! Expected ${hexByte(simA)}, got ${hexByte(rec.afterA)}`);
      anyBug = true;
    } else {
      console.log(`  A: MATCH`);
    }

    // Check HL
    // After the last RLD there's also a DEC HL (the block has RLD, DEC HL pairs for all 8),
    // plus the block may end with RET. Let's check what the block actually does.
    // From the disassembly: 8 pairs of (RLD, DEC HL) then RET.
    // So final HL = initial HL - 8
    const expectedFinalHL = (rec.beforeHL - rec.rldCount) & 0xffffff;
    if (expectedFinalHL !== rec.afterHL) {
      // The last instruction in the chain might also have a DEC HL
      // Let's check with rldCount decrements (one per RLD-DECHL pair)
      console.log(`  HL: Expected ${hex(expectedFinalHL)}, got ${hex(rec.afterHL)}`);
      if (rec.afterHL === ((rec.beforeHL - rec.rldCount) & 0xffffff)) {
        console.log(`  HL: MATCH (${rec.rldCount} decrements)`);
      } else {
        console.log(`  **HL MISMATCH**: unexpected final HL`);
      }
    } else {
      console.log(`  HL: MATCH (${rec.rldCount} decrements)`);
    }

    // Check mantissa bytes
    console.log(`  EXPECTED mantissa after: [${formatBytes(computeExpectedMantissa(rec))}]`);
    console.log(`  ACTUAL   mantissa after: [${formatBytes(rec.afterMantissa)}]`);

    const expectedMant = computeExpectedMantissa(rec);
    const mantMatch = expectedMant.every((b, i) => b === rec.afterMantissa[i]);
    if (!mantMatch) {
      console.log(`  **BUG FOUND**: Mantissa mismatch after RLD chain!`);
      for (let i = 0; i < 7; i++) {
        if (expectedMant[i] !== rec.afterMantissa[i]) {
          console.log(`    Byte ${i} (addr ${hex(OP1_MANT_START + i)}): expected ${hexByte(expectedMant[i])}, got ${hexByte(rec.afterMantissa[i])}`);
        }
      }
      anyBug = true;
    } else {
      console.log(`  Mantissa: MATCH`);
    }

    console.log('');
  }

  // --- Summary ---
  console.log('='.repeat(80));
  console.log('SUMMARY');
  console.log('='.repeat(80));
  console.log('');
  console.log(`  Normalize calls observed: ${normalizeCallCount}`);
  console.log(`  RLD chain blocks traced:  ${rldRecords.length}`);
  console.log(`  Any RLD bug found:        ${anyBug ? '**YES**' : 'No'}`);
  console.log(`  Outcome:                  ${outcome}`);
  console.log(`  Error code:               ${hexByte(errNo)} (${errName(errNo)})`);
  console.log('');

  if (anyBug) {
    console.log('>>> RLD MISMATCH DETECTED - check cpu-runtime.js rld() implementation <<<');
  } else {
    console.log('All RLD instructions produced expected results.');
    console.log('If normalize still zeros the mantissa, the bug is in the normalize');
    console.log('control flow (loop count, exponent decrement, exit conditions) rather');
    console.log('than in the RLD instruction itself.');
  }

  console.log('');
  console.log('Done.');
  process.exitCode = 0;
}

/**
 * Compute expected mantissa after an RLD chain, simulating each RLD + DEC HL.
 * The RLD chain operates on memory starting at HL and working downward.
 * For Shl14 called from normalize with entry at 07fb33:
 *   HL = 0xD00600 (set by the entry block), A = 0 (XOR A)
 *   Then 8 RLDs with DEC HL between each.
 *   This shifts the BCD mantissa left by one digit position.
 */
function computeExpectedMantissa(rec) {
  // We simulate the entire chain on a copy of the mantissa area
  // The RLD chain operates on mem[HL], mem[HL-1], ..., mem[HL-(n-1)]
  // We need the full memory region that the chain touches

  // Create a memory snapshot for the addresses the chain touches
  const memSnapshot = new Map();
  for (const info of rec.beforeMemBytes) {
    memSnapshot.set(info.addr, info.value);
  }

  let a = rec.beforeA;
  let hl = rec.beforeHL;

  for (let i = 0; i < rec.rldCount; i++) {
    const addr = hl;
    const memVal = memSnapshot.get(addr) ?? 0;
    const result = simulateRld(a, memVal);
    a = result.a;
    memSnapshot.set(addr, result.mem);
    // DEC HL after each RLD (even the last one in the block)
    hl = (hl - 1) & 0xffffff;
  }

  // Read back the mantissa bytes (0xD005FA - 0xD00600)
  const mantissa = [];
  for (let addr = OP1_MANT_START; addr <= OP1_MANT_END; addr++) {
    mantissa.push(memSnapshot.has(addr) ? memSnapshot.get(addr) : rec.beforeMantissa[addr - OP1_MANT_START]);
  }
  return mantissa;
}

try {
  main();
} catch (err) {
  console.error(err?.stack || String(err));
  process.exitCode = 1;
}
