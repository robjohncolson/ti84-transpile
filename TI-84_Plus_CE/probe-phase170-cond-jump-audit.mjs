#!/usr/bin/env node

/**
 * Phase 170 - Conditional Jump Audit During gcd(12,8)
 *
 * Logs every conditional branch during gcd(12,8), showing the condition,
 * flag state, whether taken, and the resulting PC. Helps identify where
 * incorrect flag state causes the wrong branch path.
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
const MAX_STEPS = 2000;

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

// --- Flag decoding ---

function decodeFlags(f) {
  return {
    S: (f >> 7) & 1,
    Z: (f >> 6) & 1,
    H: (f >> 4) & 1,
    P: (f >> 2) & 1,  // P/V
    N: (f >> 1) & 1,
    C: f & 1,
  };
}

function formatFlags(f) {
  const fl = decodeFlags(f);
  return `S=${fl.S} Z=${fl.Z} H=${fl.H} P=${fl.P} N=${fl.N} C=${fl.C}`;
}

// --- Conditional branch opcode identification ---

// Map of conditional branch opcodes to their names and the condition they test.
// For JR opcodes, offset is a signed byte following the opcode.
// For JP/CALL opcodes, target is a 3-byte address (little-endian) following the opcode.
// For RET opcodes, no operand.

const COND_OPCODES = new Map([
  // JR cc, offset (2 bytes)
  [0x20, { name: 'JR NZ', cond: 'NZ', flag: 'Z', sense: 0, size: 2, type: 'jr' }],
  [0x28, { name: 'JR Z',  cond: 'Z',  flag: 'Z', sense: 1, size: 2, type: 'jr' }],
  [0x30, { name: 'JR NC', cond: 'NC', flag: 'C', sense: 0, size: 2, type: 'jr' }],
  [0x38, { name: 'JR C',  cond: 'C',  flag: 'C', sense: 1, size: 2, type: 'jr' }],

  // JP cc, addr (4 bytes in ADL mode: opcode + 3-byte addr)
  [0xC2, { name: 'JP NZ', cond: 'NZ', flag: 'Z', sense: 0, size: 4, type: 'jp' }],
  [0xCA, { name: 'JP Z',  cond: 'Z',  flag: 'Z', sense: 1, size: 4, type: 'jp' }],
  [0xD2, { name: 'JP NC', cond: 'NC', flag: 'C', sense: 0, size: 4, type: 'jp' }],
  [0xDA, { name: 'JP C',  cond: 'C',  flag: 'C', sense: 1, size: 4, type: 'jp' }],
  [0xE2, { name: 'JP PO', cond: 'PO', flag: 'P', sense: 0, size: 4, type: 'jp' }],
  [0xEA, { name: 'JP PE', cond: 'PE', flag: 'P', sense: 1, size: 4, type: 'jp' }],
  [0xF2, { name: 'JP P',  cond: 'P',  flag: 'S', sense: 0, size: 4, type: 'jp' }],
  [0xFA, { name: 'JP M',  cond: 'M',  flag: 'S', sense: 1, size: 4, type: 'jp' }],

  // CALL cc, addr (4 bytes in ADL mode)
  [0xC4, { name: 'CALL NZ', cond: 'NZ', flag: 'Z', sense: 0, size: 4, type: 'call' }],
  [0xCC, { name: 'CALL Z',  cond: 'Z',  flag: 'Z', sense: 1, size: 4, type: 'call' }],
  [0xD4, { name: 'CALL NC', cond: 'NC', flag: 'C', sense: 0, size: 4, type: 'call' }],
  [0xDC, { name: 'CALL C',  cond: 'C',  flag: 'C', sense: 1, size: 4, type: 'call' }],
  [0xE4, { name: 'CALL PO', cond: 'PO', flag: 'P', sense: 0, size: 4, type: 'call' }],
  [0xEC, { name: 'CALL PE', cond: 'PE', flag: 'P', sense: 1, size: 4, type: 'call' }],
  [0xF4, { name: 'CALL P',  cond: 'P',  flag: 'S', sense: 0, size: 4, type: 'call' }],
  [0xFC, { name: 'CALL M',  cond: 'M',  flag: 'S', sense: 1, size: 4, type: 'call' }],

  // RET cc (1 byte)
  [0xC0, { name: 'RET NZ', cond: 'NZ', flag: 'Z', sense: 0, size: 1, type: 'ret' }],
  [0xC8, { name: 'RET Z',  cond: 'Z',  flag: 'Z', sense: 1, size: 1, type: 'ret' }],
  [0xD0, { name: 'RET NC', cond: 'NC', flag: 'C', sense: 0, size: 1, type: 'ret' }],
  [0xD8, { name: 'RET C',  cond: 'C',  flag: 'C', sense: 1, size: 1, type: 'ret' }],
  [0xE0, { name: 'RET PO', cond: 'PO', flag: 'P', sense: 0, size: 1, type: 'ret' }],
  [0xE8, { name: 'RET PE', cond: 'PE', flag: 'P', sense: 1, size: 1, type: 'ret' }],
  [0xF0, { name: 'RET P',  cond: 'P',  flag: 'S', sense: 0, size: 1, type: 'ret' }],
  [0xF8, { name: 'RET M',  cond: 'M',  flag: 'S', sense: 1, size: 1, type: 'ret' }],
]);

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
// Conditional Jump Audit
// ==========================================================================

function findCondBranchesInBlock(blockMeta, key, mem) {
  const meta = blockMeta[key];
  if (!meta || !meta.instructions) return [];

  const results = [];
  for (const instr of meta.instructions) {
    const pc = instr.pc & 0xffffff;
    // Read the first byte of the instruction from ROM
    const opcode = mem[pc] & 0xff;
    const info = COND_OPCODES.get(opcode);
    if (!info) continue;

    // Compute the branch target from the ROM bytes
    let target = null;
    if (info.type === 'jr') {
      // JR: signed offset from (pc + 2)
      const offset = mem[pc + 1] & 0xff;
      const signed = offset >= 128 ? offset - 256 : offset;
      target = (pc + 2 + signed) & 0xffffff;
    } else if (info.type === 'jp' || info.type === 'call') {
      // JP/CALL: 3-byte little-endian address
      target = ((mem[pc + 1] & 0xff) | ((mem[pc + 2] & 0xff) << 8) | ((mem[pc + 3] & 0xff) << 16)) >>> 0;
    }
    // RET: target is from stack, we'll determine it dynamically

    const notTakenTarget = (pc + info.size) & 0xffffff;

    results.push({
      pc,
      opcode,
      info,
      target,
      notTakenTarget,
      dasm: instr.dasm || `${info.name} ???`,
    });
  }
  return results;
}

function runCondJumpAudit() {
  console.log('='.repeat(80));
  console.log('CONDITIONAL JUMP AUDIT DURING gcd(12,8)');
  console.log('='.repeat(80));
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

  // Access blockMeta from executor
  const blockMeta = executor.blockMeta;

  // Track conditional branches
  const branchLog = [];
  // Track per-address statistics
  const branchStats = new Map(); // pc -> { taken: count, notTaken: count, flagStates: [] }

  let stepCount = 0;
  let outcome = 'budget';

  // Pending conditional branches from the current block
  let pendingBranches = [];
  let pendingBlockPC = null;
  let pendingF = 0;

  try {
    executor.runFrom(GCD_ENTRY, 'adl', {
      maxSteps: MAX_STEPS,
      maxLoopIterations: MAX_LOOP_ITER,

      onBlock(pc, mode, meta, step) {
        const norm = pc & 0xffffff;
        stepCount = step + 1;

        if (norm === FAKE_RET) throw new Error('__RET__');
        if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');

        // Resolve previous block's conditional branches
        if (pendingBranches.length > 0) {
          // The last conditional branch in the previous block determined the exit.
          // The current PC tells us where we ended up.
          const lastBranch = pendingBranches[pendingBranches.length - 1];
          const taken = lastBranch.target !== null && norm === lastBranch.target;
          const notTaken = norm === lastBranch.notTakenTarget;

          // For all branches in the block, we can only definitively resolve the last one
          // (it's the one that determined control flow). Earlier conditional branches in the
          // same block were already resolved by the compiled block internally.
          // We log them all but mark the last one with the actual outcome.
          for (let i = 0; i < pendingBranches.length; i++) {
            const br = pendingBranches[i];
            const isLast = i === pendingBranches.length - 1;

            let brTaken;
            let resultPC;
            if (isLast) {
              brTaken = taken;
              resultPC = norm;
            } else {
              // For non-last branches in the block, we can't determine from the exit PC alone.
              // The compiled block handled them internally. We'll mark as "INTERNAL".
              brTaken = null;
              resultPC = null;
            }

            const entry = {
              step: br.step,
              pc: br.pc,
              opcode: br.opcode,
              name: br.info.name,
              cond: br.info.cond,
              flag: br.info.flag,
              sense: br.info.sense,
              fBefore: br.fBefore,
              flagValue: (decodeFlags(br.fBefore))[br.info.flag],
              taken: brTaken,
              resultPC,
              target: br.target,
              notTakenTarget: br.notTakenTarget,
              dasm: br.dasm,
            };
            branchLog.push(entry);

            // Update stats
            const key = br.pc;
            if (!branchStats.has(key)) {
              branchStats.set(key, { taken: 0, notTaken: 0, internal: 0, flagStates: [], name: br.info.name, dasm: br.dasm });
            }
            const stats = branchStats.get(key);
            if (brTaken === true) stats.taken++;
            else if (brTaken === false) stats.notTaken++;
            else stats.internal++;
            stats.flagStates.push({ f: br.fBefore, taken: brTaken });
          }
        }

        // Find conditional branches in this block
        const key2 = norm.toString(16).padStart(6, '0') + ':adl';
        const branches = findCondBranchesInBlock(blockMeta, key2, mem);

        if (branches.length > 0) {
          const currentF = cpu.f & 0xff;
          pendingBranches = branches.map((br) => ({
            ...br,
            step: stepCount,
            fBefore: currentF,
          }));
          pendingBlockPC = norm;
          pendingF = currentF;
        } else {
          pendingBranches = [];
          pendingBlockPC = null;
        }
      },

      onMissingBlock(pc, mode, step) {
        const norm = pc & 0xffffff;
        stepCount = step + 1;
        if (norm === FAKE_RET) throw new Error('__RET__');
        if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');

        // Resolve pending if we land on a missing block
        if (pendingBranches.length > 0) {
          const lastBranch = pendingBranches[pendingBranches.length - 1];
          const taken = lastBranch.target !== null && norm === lastBranch.target;
          for (let i = 0; i < pendingBranches.length; i++) {
            const br = pendingBranches[i];
            const isLast = i === pendingBranches.length - 1;
            const entry = {
              step: br.step,
              pc: br.pc,
              opcode: br.opcode,
              name: br.info.name,
              cond: br.info.cond,
              flag: br.info.flag,
              sense: br.info.sense,
              fBefore: br.fBefore,
              flagValue: (decodeFlags(br.fBefore))[br.info.flag],
              taken: isLast ? taken : null,
              resultPC: isLast ? norm : null,
              target: br.target,
              notTakenTarget: br.notTakenTarget,
              dasm: br.dasm,
            };
            branchLog.push(entry);
          }
          pendingBranches = [];
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

  // Flush any remaining pending branches
  if (pendingBranches.length > 0) {
    for (const br of pendingBranches) {
      const entry = {
        step: br.step,
        pc: br.pc,
        opcode: br.opcode,
        name: br.info.name,
        cond: br.info.cond,
        flag: br.info.flag,
        sense: br.info.sense,
        fBefore: br.fBefore,
        flagValue: (decodeFlags(br.fBefore))[br.info.flag],
        taken: null,
        resultPC: null,
        target: br.target,
        notTakenTarget: br.notTakenTarget,
        dasm: br.dasm,
      };
      branchLog.push(entry);
    }
  }

  const errNo = mem[ERR_NO_ADDR] & 0xff;
  const finalOP1 = readBytes(mem, OP1_ADDR, 9);
  const finalOP2 = readBytes(mem, OP2_ADDR, 9);

  // --- Print detailed log ---
  console.log('='.repeat(80));
  console.log('DETAILED CONDITIONAL BRANCH LOG');
  console.log('='.repeat(80));
  console.log('');

  let takenCount = 0;
  let notTakenCount = 0;
  let internalCount = 0;

  for (const entry of branchLog) {
    const fHex = hexByte(entry.fBefore);
    const flags = formatFlags(entry.fBefore);
    const flagVal = entry.flagValue;

    let outcome2;
    if (entry.taken === true) {
      outcome2 = `TAKEN to ${hex(entry.resultPC)}`;
      takenCount++;
    } else if (entry.taken === false) {
      outcome2 = `NOT TAKEN -> ${hex(entry.resultPC)}`;
      notTakenCount++;
    } else {
      outcome2 = 'INTERNAL (mid-block)';
      internalCount++;
    }

    const targetStr = entry.target !== null ? hex(entry.target) : 'stack';
    console.log(
      `Step ${String(entry.step).padStart(4)}: PC=${hex(entry.pc)}  ${entry.dasm.padEnd(28)} ` +
      `F=${fHex} (${flags})  ${entry.flag}=${flagVal}  -> ${outcome2}`
    );
  }

  console.log('');

  // --- Summary ---
  console.log('='.repeat(80));
  console.log('SUMMARY');
  console.log('='.repeat(80));
  console.log('');
  console.log(`Outcome: ${outcome}, steps: ${stepCount}`);
  console.log(`Error code: ${hexByte(errNo)} (${errName(errNo)})`);
  console.log(`Final OP1: [${formatBytes(finalOP1)}] = ${decodeBcdRealBytes(finalOP1)}`);
  console.log(`Final OP2: [${formatBytes(finalOP2)}] = ${decodeBcdRealBytes(finalOP2)}`);
  console.log('');
  console.log(`Total conditional branches: ${branchLog.length}`);
  console.log(`  TAKEN:     ${takenCount}`);
  console.log(`  NOT TAKEN: ${notTakenCount}`);
  console.log(`  INTERNAL:  ${internalCount}`);
  console.log('');

  // --- Per-address grouping ---
  console.log('='.repeat(80));
  console.log('PER-ADDRESS BRANCH STATISTICS');
  console.log('='.repeat(80));
  console.log('');

  const sortedAddrs = [...branchStats.entries()].sort((a, b) => a[0] - b[0]);
  for (const [pc, stats] of sortedAddrs) {
    const total = stats.taken + stats.notTaken + stats.internal;
    console.log(`  ${hex(pc)}  ${stats.dasm.padEnd(30)} hits=${total}  taken=${stats.taken}  notTaken=${stats.notTaken}  internal=${stats.internal}`);

    // Check for inconsistent flag states leading to different outcomes
    const takenFStates = new Set();
    const notTakenFStates = new Set();
    for (const fs2 of stats.flagStates) {
      if (fs2.taken === true) takenFStates.add(fs2.f);
      else if (fs2.taken === false) notTakenFStates.add(fs2.f);
    }

    // Highlight if same flag state led to different outcomes at different visits
    const allFStates = stats.flagStates.filter((s) => s.taken !== null);
    const stateOutcomeMap = new Map();
    for (const s of allFStates) {
      const key2 = s.f;
      if (!stateOutcomeMap.has(key2)) {
        stateOutcomeMap.set(key2, new Set());
      }
      stateOutcomeMap.get(key2).add(s.taken);
    }

    let inconsistent = false;
    for (const [fVal, outcomes] of stateOutcomeMap) {
      if (outcomes.size > 1) {
        console.log(`    *** INCONSISTENT: F=${hexByte(fVal)} (${formatFlags(fVal)}) -> both TAKEN and NOT TAKEN ***`);
        inconsistent = true;
      }
    }

    if (takenFStates.size > 0 || notTakenFStates.size > 0) {
      if (takenFStates.size > 0) {
        console.log(`    TAKEN with F: ${[...takenFStates].map((f) => `${hexByte(f)} (${formatFlags(f)})`).join(', ')}`);
      }
      if (notTakenFStates.size > 0) {
        console.log(`    NOT TAKEN with F: ${[...notTakenFStates].map((f) => `${hexByte(f)} (${formatFlags(f)})`).join(', ')}`);
      }
    }
  }

  console.log('');
  console.log('Done.');
  process.exitCode = 0;
}

// ==========================================================================
// Main
// ==========================================================================

try {
  runCondJumpAudit();
} catch (err) {
  console.error(err?.stack || String(err));
  process.exitCode = 1;
}
