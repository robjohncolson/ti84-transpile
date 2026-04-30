#!/usr/bin/env node

/**
 * Phase 164 - OP2 Source Trace
 *
 * Traces OP2 (0xD00603, 9 bytes) mutations between steps 330-540 during gcd(12,8)
 * to definitively identify where OP2=12 comes from at step 535 (InvSub entry).
 *
 * Part A: Dense OP2 trace — log every OP2 mutation with PC
 * Part B: FPS pointer tracking — detect pushes/pops
 * Part C: OP register copy function detection
 * Part D: Summary — where did OP2=12 come from?
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
const MAX_STEPS = 2000;

const BCD_12 = Uint8Array.from([0x00, 0x81, 0x12, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
const BCD_8 = Uint8Array.from([0x00, 0x80, 0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

// --- OP register copy function addresses ---

const OP_COPY_FUNCS = new Map([
  [0x07f8b6, 'OP4toOP2'],
  [0x07f8c0, 'OP3toOP2'],
  [0x07f8d8, 'OP5toOP2'],
  [0x07f8fa, 'OP1toOP2'],
  [0x07f904, 'OP6toOP2'],
]);

// --- Address labels ---

const ADDR_LABELS = new Map([
  [0x068d3d, 'gcd_entry'],
  [0x068d61, 'gcd_call_OP1toOP2'],
  [0x068d82, 'gcd_algo_body'],
  [0x068d8d, 'gcd_OP1toOP3'],
  [0x068d91, 'gcd_OP1toOP5'],
  [0x068d95, 'gcd_after_OP1toOP5'],
  [0x068da1, 'gcd_error_check'],
  [0x068dea, 'gcd_JP_NC_ErrDomain'],
  [0x07c747, 'OP1toOP2_entry'],
  [0x07c771, 'FPSub'],
  [0x07c77f, 'FPAdd'],
  [0x07ca06, 'InvOP1S'],
  [0x07ca48, 'Normalize'],
  [0x07cab9, 'FPDiv_entry'],
  [0x07cc36, 'FPAddSub_core'],
  [0x07f8a2, 'OP1toOP4'],
  [0x07f8b6, 'OP4toOP2'],
  [0x07f8c0, 'OP3toOP2'],
  [0x07f8d8, 'OP5toOP2'],
  [0x07f8fa, 'Mov9_OP1toOP2'],
  [0x07f904, 'OP6toOP2'],
  [0x07f95e, 'OP1toOP3'],
  [0x07fa86, 'ConstLoader_1.0'],
  [0x07fb33, 'Shl14'],
  [0x07fd4a, 'ValidityCheck_OP1'],
  [0x07fdf1, 'DecExp'],
  [0x080188, 'JmpThru'],
  [0x07c738, 'FPSub_entry'],
  [0x07c74b, 'FPAdd_entry'],
  [0x080846, 'PushRealO1'],
  [0x080856, 'PushRealO2'],
  [0x080866, 'PushRealO3'],
  [0x080896, 'PopRealO1'],
  [0x0808a6, 'PopRealO2'],
  [0x0808b6, 'PopRealO3'],
]);

function addrLabel(addr) {
  const label = ADDR_LABELS.get(addr);
  return label ? ` [${label}]` : '';
}

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

function bytesEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
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

// --- Main probe ---

function main() {
  console.log('=== Phase 164: OP2 Source Trace (steps 330-540) during gcd(12,8) ===');
  console.log('');

  const runtime = createPreparedRuntime();

  if (!runtime.memInitOk) {
    console.log('MEM_INIT failed; aborting.');
    process.exitCode = 1;
    return;
  }

  console.log('Cold boot + MEM_INIT complete.');

  const { mem, executor, cpu } = runtime;
  prepareCallState(cpu, mem);
  seedGcdFpState(mem);
  seedErrFrame(cpu, mem, FAKE_RET, ERR_CATCH_ADDR, 0);

  console.log(`Entry: ${hex(GCD_ENTRY)}`);
  console.log(`OP1: [${formatBytes(readBytes(mem, OP1_ADDR, 9))}] = ${decodeBcdRealBytes(readBytes(mem, OP1_ADDR, 9))}`);
  console.log(`OP2: [${formatBytes(readBytes(mem, OP2_ADDR, 9))}] = ${decodeBcdRealBytes(readBytes(mem, OP2_ADDR, 9))}`);
  console.log(`FPS ptr: ${hex(read24(mem, FPS_ADDR))}`);
  console.log(`SP: ${hex(cpu.sp)}`);
  console.log('');

  // Tracking state
  let prevOp2 = readBytes(mem, OP2_ADDR, 9);
  let prevFps = read24(mem, FPS_ADDR);

  const op2Changes = [];
  const fpsChanges = [];
  const copyFuncHits = [];

  // Also snapshot all OP registers at each OP2 change for cross-reference
  let stepCount = 0;
  let outcome = 'budget';

  // Full step log for the range of interest (330-540)
  const rangeLog = [];

  try {
    executor.runFrom(GCD_ENTRY, 'adl', {
      maxSteps: MAX_STEPS,
      maxLoopIterations: MAX_LOOP_ITER,

      onBlock(pc, mode, meta, step) {
        const norm = pc & 0xffffff;
        stepCount = noteStep(stepCount, step);

        // Part C: Detect OP register copy functions
        const copyName = OP_COPY_FUNCS.get(norm);
        if (copyName && stepCount >= 330 && stepCount <= 540) {
          copyFuncHits.push({
            step: stepCount,
            pc: norm,
            func: copyName,
            op1: readBytes(mem, OP1_ADDR, 9),
            op2: readBytes(mem, OP2_ADDR, 9),
            op3: readBytes(mem, OP3_ADDR, 9),
            op4: readBytes(mem, OP4_ADDR, 9),
            op5: readBytes(mem, OP5_ADDR, 9),
            op6: readBytes(mem, OP6_ADDR, 9),
          });
        }

        // Part A: Check for OP2 changes
        const curOp2 = readBytes(mem, OP2_ADDR, 9);
        if (!bytesEqual(curOp2, prevOp2)) {
          if (stepCount >= 330 && stepCount <= 540) {
            op2Changes.push({
              step: stepCount,
              pc: norm,
              kind: 'block',
              prevOp2: [...prevOp2],
              newOp2: [...curOp2],
              op1: readBytes(mem, OP1_ADDR, 9),
              op4: readBytes(mem, OP4_ADDR, 9),
              op5: readBytes(mem, OP5_ADDR, 9),
              fps: read24(mem, FPS_ADDR),
            });
          }
          prevOp2 = [...curOp2];
        }

        // Part B: Check for FPS pointer changes
        const curFps = read24(mem, FPS_ADDR);
        if (curFps !== prevFps) {
          if (stepCount >= 330 && stepCount <= 540) {
            const delta = curFps - prevFps;
            let poppedBytes = null;
            if (delta === -9) {
              // A pop happened — read the 9 bytes that were at the old FPS-9 position
              poppedBytes = readBytes(mem, curFps, 9);
            }
            fpsChanges.push({
              step: stepCount,
              pc: norm,
              prevFps,
              newFps: curFps,
              delta,
              poppedBytes,
              op2AtChange: readBytes(mem, OP2_ADDR, 9),
            });
          }
          prevFps = curFps;
        }

        // Log every step in range for dense trace
        if (stepCount >= 330 && stepCount <= 540) {
          rangeLog.push({
            step: stepCount,
            pc: norm,
            kind: 'block',
          });
        }

        if (norm === FAKE_RET) throw new Error('__RET__');
        if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');
      },

      onMissingBlock(pc, mode, step) {
        const norm = pc & 0xffffff;
        stepCount = noteStep(stepCount, step);

        // Part A: Check for OP2 changes
        const curOp2 = readBytes(mem, OP2_ADDR, 9);
        if (!bytesEqual(curOp2, prevOp2)) {
          if (stepCount >= 330 && stepCount <= 540) {
            op2Changes.push({
              step: stepCount,
              pc: norm,
              kind: 'missing',
              prevOp2: [...prevOp2],
              newOp2: [...curOp2],
              op1: readBytes(mem, OP1_ADDR, 9),
              op4: readBytes(mem, OP4_ADDR, 9),
              op5: readBytes(mem, OP5_ADDR, 9),
              fps: read24(mem, FPS_ADDR),
            });
          }
          prevOp2 = [...curOp2];
        }

        // Part B: Check for FPS pointer changes
        const curFps = read24(mem, FPS_ADDR);
        if (curFps !== prevFps) {
          if (stepCount >= 330 && stepCount <= 540) {
            const delta = curFps - prevFps;
            let poppedBytes = null;
            if (delta === -9) {
              poppedBytes = readBytes(mem, curFps, 9);
            }
            fpsChanges.push({
              step: stepCount,
              pc: norm,
              prevFps,
              newFps: curFps,
              delta,
              poppedBytes,
              op2AtChange: readBytes(mem, OP2_ADDR, 9),
            });
          }
          prevFps = curFps;
        }

        if (stepCount >= 330 && stepCount <= 540) {
          rangeLog.push({
            step: stepCount,
            pc: norm,
            kind: 'missing',
          });
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
      console.log(`Thrown: ${(err?.stack || String(err)).split('\n')[0]}`);
    }
  }

  // --- Part A Results ---

  console.log(`${'='.repeat(70)}`);
  console.log('PART A: OP2 Mutations (steps 330-540)');
  console.log(`${'='.repeat(70)}`);

  if (op2Changes.length === 0) {
    console.log('(no OP2 mutations in this range)');
  } else {
    for (const c of op2Changes) {
      const missing = c.kind === 'missing' ? ' [MISSING]' : '';
      console.log(`Step ${c.step}: PC=${hex(c.pc)}${addrLabel(c.pc)}${missing}`);
      console.log(`  OP2: [${formatBytes(c.prevOp2)}] -> [${formatBytes(c.newOp2)}]`);
      console.log(`  OP2 old=${decodeBcdRealBytes(c.prevOp2)}  new=${decodeBcdRealBytes(c.newOp2)}`);
      console.log(`  OP1=[${formatBytes(c.op1)}] = ${decodeBcdRealBytes(c.op1)}`);
      console.log(`  OP4=[${formatBytes(c.op4)}] = ${decodeBcdRealBytes(c.op4)}`);
      console.log(`  OP5=[${formatBytes(c.op5)}] = ${decodeBcdRealBytes(c.op5)}`);
      console.log(`  FPS ptr=${hex(c.fps)}`);
    }
  }

  // --- Part B Results ---

  console.log('');
  console.log(`${'='.repeat(70)}`);
  console.log('PART B: FPS Pointer Changes (steps 330-540)');
  console.log(`${'='.repeat(70)}`);

  if (fpsChanges.length === 0) {
    console.log('(no FPS pointer changes in this range)');
  } else {
    for (const f of fpsChanges) {
      const deltaStr = f.delta > 0 ? `+${f.delta} (PUSH)` : `${f.delta} (POP)`;
      console.log(`Step ${f.step}: PC=${hex(f.pc)}${addrLabel(f.pc)}`);
      console.log(`  FPS: ${hex(f.prevFps)} -> ${hex(f.newFps)}  delta=${deltaStr}`);
      if (f.poppedBytes) {
        console.log(`  Popped value: [${formatBytes(f.poppedBytes)}] = ${decodeBcdRealBytes(f.poppedBytes)}`);
      }
      console.log(`  OP2 at this point: [${formatBytes(f.op2AtChange)}] = ${decodeBcdRealBytes(f.op2AtChange)}`);
    }
  }

  // --- Part C Results ---

  console.log('');
  console.log(`${'='.repeat(70)}`);
  console.log('PART C: OP Register Copy Function Hits (steps 330-540)');
  console.log(`${'='.repeat(70)}`);

  if (copyFuncHits.length === 0) {
    console.log('(no OP register copy-to-OP2 functions called in this range)');
  } else {
    for (const h of copyFuncHits) {
      console.log(`Step ${h.step}: PC=${hex(h.pc)} => ${h.func}`);
      console.log(`  OP1=[${formatBytes(h.op1)}] = ${decodeBcdRealBytes(h.op1)}`);
      console.log(`  OP2=[${formatBytes(h.op2)}] = ${decodeBcdRealBytes(h.op2)}  (BEFORE copy)`);
      console.log(`  OP3=[${formatBytes(h.op3)}] = ${decodeBcdRealBytes(h.op3)}`);
      console.log(`  OP4=[${formatBytes(h.op4)}] = ${decodeBcdRealBytes(h.op4)}`);
      console.log(`  OP5=[${formatBytes(h.op5)}] = ${decodeBcdRealBytes(h.op5)}`);
      console.log(`  OP6=[${formatBytes(h.op6)}] = ${decodeBcdRealBytes(h.op6)}`);
    }
  }

  // --- Dense step log around step 535 ---

  console.log('');
  console.log(`${'='.repeat(70)}`);
  console.log('DENSE LOG: Steps 520-540 (context around step 535)');
  console.log(`${'='.repeat(70)}`);

  for (const entry of rangeLog) {
    if (entry.step >= 520 && entry.step <= 540) {
      const missing = entry.kind === 'missing' ? ' [MISSING]' : '';
      console.log(`  Step ${entry.step}: PC=${hex(entry.pc)}${addrLabel(entry.pc)}${missing}`);
    }
  }

  // --- Part D: Summary ---

  console.log('');
  console.log(`${'='.repeat(70)}`);
  console.log('PART D: Summary');
  console.log(`${'='.repeat(70)}`);

  console.log(`Outcome: ${outcome}`);
  console.log(`Total steps: ${stepCount}`);
  console.log(`errNo: ${hexByte(mem[ERR_NO_ADDR] & 0xff)} (${errName(mem[ERR_NO_ADDR] & 0xff)})`);
  console.log(`Total OP2 mutations in range: ${op2Changes.length}`);
  console.log(`Total FPS changes in range: ${fpsChanges.length}`);
  console.log(`Total copy-to-OP2 calls in range: ${copyFuncHits.length}`);
  console.log('');

  // Find the OP2 change that produced value=12
  const bcd12Bytes = [0x00, 0x81, 0x12, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
  const op2Becomes12 = op2Changes.filter((c) => bytesEqual(c.newOp2, bcd12Bytes));

  if (op2Becomes12.length > 0) {
    console.log('OP2 becomes 12 at:');
    for (const c of op2Becomes12) {
      console.log(`  Step ${c.step}, PC=${hex(c.pc)}${addrLabel(c.pc)}`);
      console.log(`  Previous OP2 was: [${formatBytes(c.prevOp2)}] = ${decodeBcdRealBytes(c.prevOp2)}`);

      // Check if this coincides with a copy function
      const matchingCopy = copyFuncHits.find((h) => h.step === c.step || h.step === c.step - 1);
      if (matchingCopy) {
        console.log(`  COPY FUNCTION at step ${matchingCopy.step}: ${matchingCopy.func}`);
      }

      // Check if this coincides with an FPS pop
      const matchingPop = fpsChanges.find((f) => f.step === c.step && f.delta === -9);
      if (matchingPop) {
        console.log(`  FPS POP at same step: popped [${formatBytes(matchingPop.poppedBytes)}] = ${decodeBcdRealBytes(matchingPop.poppedBytes)}`);
      }

      // Check source register values
      if (bytesEqual(c.op1, bcd12Bytes)) console.log('  SOURCE: OP1 contained 12 at this point');
      if (bytesEqual(c.op4, bcd12Bytes)) console.log('  SOURCE: OP4 contained 12 at this point');
      if (bytesEqual(c.op5, bcd12Bytes)) console.log('  SOURCE: OP5 contained 12 at this point');
    }
  } else {
    console.log('OP2 never becomes exactly 12 (BCD [00 81 12 ...]) in this range.');
    console.log('Checking if OP2=12 was already set BEFORE step 330...');
    // Check what OP2 was at the start of the range
    if (rangeLog.length > 0) {
      const firstInRange = rangeLog[0];
      console.log(`  First step in range: ${firstInRange.step}, PC=${hex(firstInRange.pc)}`);
    }
  }

  // Final register state
  console.log('');
  console.log('Final register state:');
  console.log(`  OP1: [${formatBytes(readBytes(mem, OP1_ADDR, 9))}] = ${decodeBcdRealBytes(readBytes(mem, OP1_ADDR, 9))}`);
  console.log(`  OP2: [${formatBytes(readBytes(mem, OP2_ADDR, 9))}] = ${decodeBcdRealBytes(readBytes(mem, OP2_ADDR, 9))}`);
  console.log(`  OP3: [${formatBytes(readBytes(mem, OP3_ADDR, 9))}] = ${decodeBcdRealBytes(readBytes(mem, OP3_ADDR, 9))}`);
  console.log(`  OP4: [${formatBytes(readBytes(mem, OP4_ADDR, 9))}] = ${decodeBcdRealBytes(readBytes(mem, OP4_ADDR, 9))}`);
  console.log(`  OP5: [${formatBytes(readBytes(mem, OP5_ADDR, 9))}] = ${decodeBcdRealBytes(readBytes(mem, OP5_ADDR, 9))}`);
  console.log(`  FPS: ${hex(read24(mem, FPS_ADDR))}`);
}

try {
  main();
} catch (err) {
  console.error(err?.stack || String(err));
  process.exitCode = 1;
}
