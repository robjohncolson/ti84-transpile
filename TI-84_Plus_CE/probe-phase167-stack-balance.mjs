#!/usr/bin/env node

/**
 * Phase 167 - Stack depth (PUSH/POP balance) trace through gcd inner body
 *
 * Tracks SP at every block during gcd(12,8) execution.
 * For each of the 7 CALLs in the inner body (0x068D82-0x068DA1),
 * records SP before CALL, SP at callee entry, SP after RET.
 * Also tracks the PUSH AF at 0x068D84 and any matching POP AF.
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
const OP3_ADDR = 0xd0060e;
const OP4_ADDR = 0xd00619;

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

// gcd inner body addresses (the 7 CALL targets)
const CALL_TARGETS = {
  '0x07F8A2': { name: 'OP1->OP4', callSite: 0x068d85 },
  '0x07C747': { name: 'compound OP1->OP2', callSite: 0x068d89 },
  '0x07F95E': { name: 'OP1->OP3', callSite: 0x068d8d },
  '0x07F8B6': { name: 'OP4->OP2', callSite: 0x068d91 },
  '0x07C74F': { name: 'InvSub (OP2-OP1)', callSite: 0x068d95 },
  '0x068D20': { name: 'gcd_helper', callSite: 0x068d99 },
  '0x07FD69': { name: 'exponent check', callSite: 0x068d9d },
};

// CALL site PCs (the PC of the block containing the CALL instruction)
// After CALL executes, PC goes to target, SP decreases by 3 (ADL mode)
const CALL_SITE_PCS = [0x068d85, 0x068d89, 0x068d8d, 0x068d91, 0x068d95, 0x068d99, 0x068d9d];
const CALL_TARGET_PCS = [0x07f8a2, 0x07c747, 0x07f95e, 0x07f8b6, 0x07c74f, 0x068d20, 0x07fd69];

// The instruction AFTER each CALL (where execution resumes after RET)
const CALL_RETURN_PCS = [0x068d89, 0x068d8d, 0x068d91, 0x068d95, 0x068d99, 0x068d9d, 0x068da1];

const ADDR_PUSH_AF = 0x068d84;
const ADDR_BIT_0_B = 0x068d82;
const ADDR_LOOP_TOP = 0x068d5d;

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

function flagsString(f) {
  const s = (f & 0x80) ? 'S' : '-';
  const z = (f & 0x40) ? 'Z' : '-';
  const h = (f & 0x10) ? 'H' : '-';
  const p = (f & 0x04) ? 'P' : '-';
  const n = (f & 0x02) ? 'N' : '-';
  const c = (f & 0x01) ? 'C' : '-';
  return `${s}${z}${h}${p}${n}${c}`;
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

  // Run MEM_INIT
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
  console.log('=== Phase 167: Stack Balance Trace through gcd(12,8) Inner Body ===');
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

  const entrySP = cpu.sp;

  console.log(`Entry OP1: [${formatBytes(readBytes(mem, OP1_ADDR, 9))}] = ${decodeBcdRealBytes(readBytes(mem, OP1_ADDR, 9))}`);
  console.log(`Entry OP2: [${formatBytes(readBytes(mem, OP2_ADDR, 9))}] = ${decodeBcdRealBytes(readBytes(mem, OP2_ADDR, 9))}`);
  console.log(`Entry SP: ${hex(entrySP)}`);
  console.log(`ADL mode: cpu.adl=${cpu.adl}, cpu.madl=${cpu.madl}`);
  console.log('');

  // --- Part A: Full SP trace ---
  // We track SP at every block, and specifically watch for the 7 CALL boundaries.

  let stepCount = 0;
  let outcome = 'budget';
  let lastPC = 0;
  let iterationCount = 0;

  // Full trace log (step, pc, sp)
  const fullTrace = [];

  // CALL tracking: for each of the 7 calls, record SP before/at entry/after RET
  // We detect CALLs by watching for transitions:
  //   Block at CALL_SITE_PC -> next block at CALL_TARGET_PC (entry)
  //   Block at CALL_RETURN_PC appearing after being inside a callee (return)

  // State machine for call tracking
  const callRecords = []; // {callIndex, target, spBeforeCall, spAtEntry, spAfterRet}
  let pendingCallIndex = -1; // which call we're about to enter
  let lastBlockPC = 0;
  let lastBlockSP = 0;

  // Track PUSH AF / POP AF
  const pushAfEvents = [];
  const popAfEvents = [];

  // Stack watermark
  let minSP = cpu.sp;
  let spAtPushAf = null;

  // Track which inner-body iteration we're in
  let innerBodyIteration = 0;
  let inInnerBody = false;

  try {
    executor.runFrom(GCD_ENTRY, 'adl', {
      maxSteps: MAX_STEPS,
      maxLoopIterations: MAX_LOOP_ITER,

      onBlock(pc, mode, meta, step) {
        const norm = pc & 0xffffff;
        stepCount = step + 1;
        lastPC = norm;

        if (norm === FAKE_RET) throw new Error('__RET__');
        if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');

        const currentSP = cpu.sp;

        // Track min SP
        if (currentSP < minSP) minSP = currentSP;

        // Log to full trace
        fullTrace.push({ step: stepCount, pc: norm, sp: currentSP });

        // Detect loop top
        if (norm === ADDR_LOOP_TOP) {
          iterationCount++;
        }

        // Detect entry to inner body (BIT 0,B at 0x068D82)
        if (norm === ADDR_BIT_0_B) {
          innerBodyIteration++;
          inInnerBody = true;
        }

        // Detect PUSH AF at 0x068D84
        if (norm === ADDR_PUSH_AF) {
          spAtPushAf = currentSP;
          pushAfEvents.push({
            step: stepCount,
            iteration: innerBodyIteration,
            sp: currentSP,
            a: cpu.a & 0xff,
            f: cpu.f & 0xff,
            flags: flagsString(cpu.f),
            adl: cpu.adl,
            madl: cpu.madl,
          });
        }

        // Detect POP AF (opcode 0xF1) at any address
        if (norm < 0x400000) {
          const opcode = romBytes[norm] & 0xff;
          if (opcode === 0xf1) {
            popAfEvents.push({
              step: stepCount,
              pc: norm,
              sp_before_pop: currentSP,
              a_before: cpu.a & 0xff,
              f_before: cpu.f & 0xff,
              flags_before: flagsString(cpu.f),
              // We'll fill in a_after/f_after by checking the next block
            });
          }
        }

        // Detect CALL site -> target transitions
        // The previous block was a CALL site, and now we're at the target
        for (let i = 0; i < CALL_SITE_PCS.length; i++) {
          if (lastBlockPC === CALL_SITE_PCS[i] && norm === CALL_TARGET_PCS[i]) {
            // We just entered a CALL
            callRecords.push({
              callIndex: i,
              target: hex(CALL_TARGET_PCS[i]),
              targetName: Object.values(CALL_TARGETS)[i].name,
              spBeforeCall: lastBlockSP,
              spAtEntry: currentSP,
              spAfterRet: null, // filled when we return
              iteration: innerBodyIteration,
            });
            pendingCallIndex = callRecords.length - 1;
          }
        }

        // Detect return from CALL: we're at a CALL_RETURN_PC and the last
        // call record for that return target hasn't been filled yet
        for (let i = 0; i < CALL_RETURN_PCS.length; i++) {
          if (norm === CALL_RETURN_PCS[i]) {
            // Find the most recent unfilled call record for this call index
            for (let j = callRecords.length - 1; j >= 0; j--) {
              if (callRecords[j].callIndex === i && callRecords[j].spAfterRet === null) {
                callRecords[j].spAfterRet = currentSP;
                break;
              }
            }
          }
        }

        lastBlockPC = norm;
        lastBlockSP = currentSP;
      },

      onMissingBlock(pc, mode, step) {
        const norm = pc & 0xffffff;
        stepCount = step + 1;
        lastPC = norm;
        if (norm === FAKE_RET) throw new Error('__RET__');
        if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');

        fullTrace.push({ step: stepCount, pc: norm, sp: cpu.sp, missing: true });
        lastBlockPC = norm;
        lastBlockSP = cpu.sp;
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

  const finalOP1 = readBytes(mem, OP1_ADDR, 9);
  const finalOP2 = readBytes(mem, OP2_ADDR, 9);
  const errNo = mem[ERR_NO_ADDR] & 0xff;

  // ==========================================================================
  // Reports
  // ==========================================================================

  console.log('='.repeat(80));
  console.log('EXECUTION RESULT');
  console.log('='.repeat(80));
  console.log(`  Outcome:       ${outcome}`);
  console.log(`  Steps:         ${stepCount}`);
  console.log(`  Last PC:       ${hex(lastPC)}`);
  console.log(`  Loop iters:    ${iterationCount}`);
  console.log(`  Inner iters:   ${innerBodyIteration}`);
  console.log(`  errNo:         ${hexByte(errNo)} (${errName(errNo)})`);
  console.log(`  Final OP1:     [${formatBytes(finalOP1)}] = ${decodeBcdRealBytes(finalOP1)}`);
  console.log(`  Final OP2:     [${formatBytes(finalOP2)}] = ${decodeBcdRealBytes(finalOP2)}`);
  console.log('');

  // --- Part A: CALL balance table ---
  console.log('='.repeat(80));
  console.log('PART A: CALL SP BALANCE TABLE');
  console.log('='.repeat(80));
  console.log('');
  console.log('Call target    | Name                    | Iter | SP before CALL | SP at entry    | SP after RET   | Balanced?');
  console.log('-'.repeat(120));

  for (const rec of callRecords) {
    const balanced = rec.spAfterRet !== null
      ? (rec.spBeforeCall === rec.spAfterRet ? 'YES' : `NO (delta=${rec.spAfterRet - rec.spBeforeCall})`)
      : 'n/a (no return)';
    console.log(
      `${rec.target.padEnd(14)} | ${rec.targetName.padEnd(23)} | ${String(rec.iteration).padEnd(4)} | ${hex(rec.spBeforeCall).padEnd(14)} | ${hex(rec.spAtEntry).padEnd(14)} | ${(rec.spAfterRet !== null ? hex(rec.spAfterRet) : 'n/a').padEnd(14)} | ${balanced}`
    );
  }
  console.log('');

  // Check SP delta at entry (should be -3 for ADL CALL)
  console.log('SP delta at CALL entry (should be -3 for ADL mode CALL):');
  for (const rec of callRecords) {
    const delta = rec.spAtEntry - rec.spBeforeCall;
    const ok = delta === -3 ? 'OK' : `UNEXPECTED (expected -3, got ${delta})`;
    console.log(`  ${rec.target} (${rec.targetName}): delta=${delta} ${ok}`);
  }
  console.log('');

  // --- Part B: PUSH AF / POP AF tracking ---
  console.log('='.repeat(80));
  console.log('PART B: PUSH AF / POP AF TRACKING');
  console.log('='.repeat(80));
  console.log('');

  console.log('PUSH AF events (at 0x068D84):');
  for (const ev of pushAfEvents) {
    const pushSize = ev.adl ? 3 : 2;
    console.log(`  iter=${ev.iteration} step=${ev.step} SP=${hex(ev.sp)} A=${hexByte(ev.a)} F=${hexByte(ev.f)} [${ev.flags}] ADL=${ev.adl} MADL=${ev.madl} (push size=${pushSize} bytes)`);
    console.log(`    After PUSH AF: SP should become ${hex(ev.sp - pushSize)}`);
  }
  console.log('');

  console.log('POP AF events (opcode F1 anywhere):');
  for (const ev of popAfEvents) {
    console.log(`  step=${ev.step} PC=${hex(ev.pc)} SP_before_pop=${hex(ev.sp_before_pop)} A_before=${hexByte(ev.a_before)} F_before=${hexByte(ev.f_before)} [${ev.flags_before}]`);
  }
  console.log('');

  // Match PUSH to POP
  if (pushAfEvents.length > 0) {
    console.log('PUSH AF <-> POP AF matching:');
    for (const push of pushAfEvents) {
      const pushSize = push.adl ? 3 : 2;
      const expectedPopSP = push.sp - pushSize; // SP after push = where POP should find it
      // Look for a POP AF whose sp_before_pop matches expectedPopSP (stack returns to push point)
      const matchingPop = popAfEvents.find(p => p.sp_before_pop === expectedPopSP && p.step > push.step);
      if (matchingPop) {
        console.log(`  PUSH at step=${push.step} SP=${hex(push.sp)} -> POP at step=${matchingPop.step} PC=${hex(matchingPop.pc)} SP=${hex(matchingPop.sp_before_pop)}`);
        console.log(`    Pushed: A=${hexByte(push.a)} F=${hexByte(push.f)} [${push.flags}]`);
        // Check what's on the stack at the POP point
        const stackA = mem[matchingPop.sp_before_pop + (push.adl ? 2 : 1)] & 0xff;
        const stackF = mem[matchingPop.sp_before_pop] & 0xff;
        console.log(`    Stack at POP: F=${hexByte(stackF)} A=${hexByte(stackA)} (at SP=${hex(matchingPop.sp_before_pop)})`);
        const zPushed = (push.f & 0x40) ? 1 : 0;
        const zOnStack = (stackF & 0x40) ? 1 : 0;
        console.log(`    Z flag: pushed=${zPushed}, on stack at POP time=${zOnStack}, ${zPushed === zOnStack ? 'MATCH' : 'MISMATCH'}`);
      } else {
        console.log(`  PUSH at step=${push.step} SP=${hex(push.sp)} -> NO MATCHING POP FOUND`);
        console.log(`    Expected POP with SP_before_pop=${hex(expectedPopSP)}`);
      }
    }
    console.log('');
  }

  // --- Part C: Stack watermark ---
  console.log('='.repeat(80));
  console.log('PART C: STACK WATERMARK');
  console.log('='.repeat(80));
  console.log('');
  console.log(`  Entry SP:       ${hex(entrySP)}`);
  console.log(`  Min SP reached: ${hex(minSP)}`);
  console.log(`  Max depth:      ${entrySP - minSP} bytes (${Math.floor((entrySP - minSP) / 3)} 24-bit words)`);
  if (spAtPushAf !== null) {
    console.log(`  SP at PUSH AF:  ${hex(spAtPushAf)}`);
    console.log(`  Depth below PUSH AF: ${spAtPushAf - minSP} bytes`);
  }
  console.log('');

  // --- Full SP trace for the inner body region ---
  console.log('='.repeat(80));
  console.log('FULL SP TRACE (inner body blocks only: 0x068D00-0x068E00 range)');
  console.log('='.repeat(80));
  const innerBlocks = fullTrace.filter(t => t.pc >= 0x068d00 && t.pc <= 0x068e00);
  for (const t of innerBlocks) {
    const marker = t.pc === ADDR_PUSH_AF ? ' <-- PUSH AF'
      : t.pc === ADDR_BIT_0_B ? ' <-- BIT 0,B'
      : t.pc === ADDR_LOOP_TOP ? ' <-- LOOP TOP'
      : '';
    console.log(`  step=${String(t.step).padStart(4)} PC=${hex(t.pc)} SP=${hex(t.sp)}${marker}`);
  }
  console.log('');

  // --- SP at each block in first inner body iteration ---
  if (innerBodyIteration >= 1) {
    console.log('='.repeat(80));
    console.log('SP AT EVERY BLOCK DURING INNER BODY ITERATION 1');
    console.log('='.repeat(80));

    // Find the step range for iteration 1
    const bit0bStep = fullTrace.find(t => t.pc === ADDR_BIT_0_B);
    if (bit0bStep) {
      const startStep = bit0bStep.step;
      // End at the next loop top or BIT 0,B or end
      const nextLoopTop = fullTrace.find(t => t.step > startStep && (t.pc === ADDR_LOOP_TOP || t.pc === ADDR_BIT_0_B));
      const endStep = nextLoopTop ? nextLoopTop.step : fullTrace[fullTrace.length - 1].step + 1;

      const iter1Blocks = fullTrace.filter(t => t.step >= startStep && t.step < endStep);
      for (const t of iter1Blocks) {
        const isCallSite = CALL_SITE_PCS.includes(t.pc);
        const isCallTarget = CALL_TARGET_PCS.includes(t.pc);
        const isReturnPC = CALL_RETURN_PCS.includes(t.pc);
        let marker = '';
        if (t.pc === ADDR_PUSH_AF) marker = ' <-- PUSH AF';
        else if (t.pc === ADDR_BIT_0_B) marker = ' <-- BIT 0,B';
        else if (isCallSite) {
          const idx = CALL_SITE_PCS.indexOf(t.pc);
          marker = ` <-- CALL ${hex(CALL_TARGET_PCS[idx])}`;
        } else if (isCallTarget) {
          const idx = CALL_TARGET_PCS.indexOf(t.pc);
          marker = ` <-- ENTRY (${Object.values(CALL_TARGETS)[idx].name})`;
        } else if (isReturnPC) {
          const idx = CALL_RETURN_PCS.indexOf(t.pc);
          marker = ` <-- RET from ${hex(CALL_TARGET_PCS[idx])}`;
        }
        console.log(`  step=${String(t.step).padStart(4)} PC=${hex(t.pc)} SP=${hex(t.sp)}${marker}`);
      }
    }
  }
  console.log('');

  // --- Analysis ---
  console.log('='.repeat(80));
  console.log('ANALYSIS');
  console.log('='.repeat(80));
  console.log('');

  // Check overall balance
  const allBalanced = callRecords.every(r => r.spAfterRet !== null && r.spBeforeCall === r.spAfterRet);
  console.log(`All 7 CALLs balanced: ${allBalanced ? 'YES' : 'NO'}`);

  const unbalanced = callRecords.filter(r => r.spAfterRet !== null && r.spBeforeCall !== r.spAfterRet);
  if (unbalanced.length > 0) {
    console.log('');
    console.log('UNBALANCED CALLS:');
    for (const rec of unbalanced) {
      console.log(`  ${rec.target} (${rec.targetName}): before=${hex(rec.spBeforeCall)} after=${hex(rec.spAfterRet)} delta=${rec.spAfterRet - rec.spBeforeCall}`);
    }
  }

  const noReturn = callRecords.filter(r => r.spAfterRet === null);
  if (noReturn.length > 0) {
    console.log('');
    console.log('CALLS WITHOUT OBSERVED RETURN:');
    for (const rec of noReturn) {
      console.log(`  ${rec.target} (${rec.targetName}): entered at step with SP=${hex(rec.spAtEntry)}`);
    }
  }

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
