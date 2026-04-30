#!/usr/bin/env node

/**
 * Phase 153 - Dense gcd trace between steps 15-200.
 *
 * Runs gcd(12,8) via direct call to 0x068D3D and logs OP1/OP2/FPS
 * at EVERY block hit between steps 15-200 to identify exactly which
 * blocks execute and what values flow through.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

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
const GCD_CATEGORY = 0x28;

const FAKE_RET = 0x7ffffe;
const ERR_CATCH_ADDR = 0x7ffffa;

const MEMINIT_BUDGET = 100000;
const MAX_LOOP_ITER = 8192;
const MAX_STEPS = 2000;

const FPS_CLEAN_AREA = 0xd1aa00;
const FPS_ENTRY_SIZE = 9;

const BCD_12 = Uint8Array.from([0x00, 0x81, 0x12, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
const BCD_8 = Uint8Array.from([0x00, 0x80, 0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

const DENSE_START = 15;
const DENSE_END = 200;

const hex = (value, width = 6) =>
  value === undefined || value === null
    ? 'n/a'
    : `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;

const hexByte = (value) =>
  (value & 0xff).toString(16).toUpperCase().padStart(2, '0');

const formatBlockKey = (pc, mode = 'adl') =>
  `${pc.toString(16).padStart(6, '0')}:${mode}`;

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

function decodeBcdRealBytes(bytes) {
  const type = bytes[0] & 0xff;
  const exponentByte = bytes[1] & 0xff;
  const digits = [];

  for (let i = 2; i < 9; i++) {
    const byte = bytes[i] & 0xff;
    digits.push((byte >> 4) & 0x0f, byte & 0x0f);
  }

  if (digits.every((digit) => digit === 0)) {
    return '0';
  }

  if (digits.some((digit) => digit > 9)) {
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

  if (rendered.startsWith('.')) {
    rendered = `0${rendered}`;
  }

  if (rendered === '') {
    rendered = '0';
  }

  if ((type & 0x80) !== 0 && rendered !== '0') {
    rendered = `-${rendered}`;
  }

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

function blockDisasm(pc, mode = 'adl') {
  const block = BLOCKS[formatBlockKey(pc, mode)];
  if (!block?.instructions?.length) {
    return '(no disasm)';
  }
  return block.instructions
    .map((instruction) => `${hex(instruction.pc)} ${instruction.dasm}`)
    .join(' | ');
}

function noteStep(stepCount, step) {
  if (typeof step === 'number') {
    return Math.max(stepCount, step + 1);
  }
  return stepCount + 1;
}

function printHeader(title) {
  console.log('========================================================================');
  console.log(title);
  console.log('========================================================================');
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

function main() {
  console.log('=== Phase 153: Dense gcd trace (steps 15-200) ===');
  console.log('');

  const runtime = createPreparedRuntime();
  if (!runtime.memInitOk) {
    console.log('MEM_INIT failed; aborting.');
    return;
  }

  const { mem, executor, cpu } = runtime;
  prepareCallState(cpu, mem);
  seedGcdFpState(mem);
  seedErrFrame(cpu, mem, FAKE_RET, ERR_CATCH_ADDR, 0);

  // Record the SP we set up for errSP reporting
  const initialSp = cpu.sp;
  write24(mem, ERR_SP_ADDR, initialSp);

  console.log(`Entry: ${hex(GCD_DIRECT_ADDR)}`);
  console.log(`OP1: [${formatBytes(readBytes(mem, OP1_ADDR, 9))}] => ${decodeBcdRealBytes(readBytes(mem, OP1_ADDR, 9))}`);
  console.log(`OP2: [${formatBytes(readBytes(mem, OP2_ADDR, 9))}] => ${decodeBcdRealBytes(readBytes(mem, OP2_ADDR, 9))}`);
  console.log(`FPS ptr: ${hex(read24(mem, FPS_ADDR))}, FPS base: ${hex(read24(mem, FPSBASE_ADDR))}`);
  console.log(`SP: ${hex(cpu.sp)}, errSP: ${hex(read24(mem, ERR_SP_ADDR))}`);
  console.log(`FP category: ${hex(mem[FP_CATEGORY_ADDR], 2)}`);
  console.log(`Max steps: ${MAX_STEPS}`);
  console.log('');

  // Dense trace data
  const allHits = [];
  const densePcs = new Set();
  let stepCount = 0;
  let outcome = 'budget';
  let lastMissingBlock = null;
  let thrownMessage = null;

  try {
    executor.runFrom(GCD_DIRECT_ADDR, 'adl', {
      maxSteps: MAX_STEPS,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc, mode, meta, step) {
        const norm = pc & 0xffffff;
        stepCount = noteStep(stepCount, step);

        const fpsPtr = read24(mem, FPS_ADDR);
        const fpsBase = read24(mem, FPSBASE_ADDR);

        if (stepCount >= DENSE_START && stepCount <= DENSE_END) {
          densePcs.add(norm);
          const op1Bytes = readBytes(mem, OP1_ADDR, 9);
          const op2Bytes = readBytes(mem, OP2_ADDR, 9);

          // Read FPS top entry if FPS > FPSbase
          let fpsTopHex = '(empty)';
          let fpsTopValue = '';
          if (fpsPtr > fpsBase) {
            const fpsTopBytes = readBytes(mem, fpsPtr - FPS_ENTRY_SIZE, FPS_ENTRY_SIZE);
            fpsTopHex = formatBytes(fpsTopBytes);
            fpsTopValue = decodeBcdRealBytes(fpsTopBytes);
          }

          allHits.push({
            step: stepCount,
            pc: norm,
            kind: 'block',
            dense: true,
            op1Hex: formatBytes(op1Bytes),
            op1Value: decodeBcdRealBytes(op1Bytes),
            op2Hex: formatBytes(op2Bytes),
            op2Value: decodeBcdRealBytes(op2Bytes),
            fpsPtr,
            fpsTopHex,
            fpsTopValue,
          });
        } else {
          allHits.push({
            step: stepCount,
            pc: norm,
            kind: 'block',
            dense: false,
          });
        }

        if (norm === FAKE_RET) throw new Error('__RET__');
        if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');
      },
      onMissingBlock(pc, mode, step) {
        const norm = pc & 0xffffff;
        stepCount = noteStep(stepCount, step);
        lastMissingBlock = norm;

        if (stepCount >= DENSE_START && stepCount <= DENSE_END) {
          densePcs.add(norm);
          const fpsPtr = read24(mem, FPS_ADDR);
          const fpsBase = read24(mem, FPSBASE_ADDR);
          const op1Bytes = readBytes(mem, OP1_ADDR, 9);
          const op2Bytes = readBytes(mem, OP2_ADDR, 9);

          let fpsTopHex = '(empty)';
          let fpsTopValue = '';
          if (fpsPtr > fpsBase) {
            const fpsTopBytes = readBytes(mem, fpsPtr - FPS_ENTRY_SIZE, FPS_ENTRY_SIZE);
            fpsTopHex = formatBytes(fpsTopBytes);
            fpsTopValue = decodeBcdRealBytes(fpsTopBytes);
          }

          allHits.push({
            step: stepCount,
            pc: norm,
            kind: 'missing',
            dense: true,
            op1Hex: formatBytes(op1Bytes),
            op1Value: decodeBcdRealBytes(op1Bytes),
            op2Hex: formatBytes(op2Bytes),
            op2Value: decodeBcdRealBytes(op2Bytes),
            fpsPtr,
            fpsTopHex,
            fpsTopValue,
          });
        } else {
          allHits.push({
            step: stepCount,
            pc: norm,
            kind: 'missing',
            dense: false,
          });
        }

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
      thrownMessage = error?.stack || String(error);
    }
  }

  // Print all hits
  printHeader('All Block Hits');

  for (const hit of allHits) {
    if (hit.dense) {
      const missing = hit.kind === 'missing' ? ' [MISSING]' : '';
      console.log(
        `step ${String(hit.step).padStart(4, ' ')} ` +
        `PC=${hex(hit.pc)}${missing}`
      );
      console.log(`  OP1: [${hit.op1Hex}] => ${hit.op1Value}`);
      console.log(`  OP2: [${hit.op2Hex}] => ${hit.op2Value}`);
      console.log(`  FPS: ${hex(hit.fpsPtr)} top=[${hit.fpsTopHex}]${hit.fpsTopValue ? ' => ' + hit.fpsTopValue : ''}`);
    } else {
      const missing = hit.kind === 'missing' ? ' [MISSING]' : '';
      console.log(
        `step ${String(hit.step).padStart(4, ' ')} ` +
        `PC=${hex(hit.pc)}${missing}`
      );
    }
  }

  console.log('');

  // Print summary
  printHeader('Summary');

  console.log(`Outcome: ${outcome}`);
  console.log(`Total steps: ${stepCount}`);
  console.log(`errNo: ${hex(mem[ERR_NO_ADDR] & 0xff, 2)} (${errName(mem[ERR_NO_ADDR] & 0xff)})`);
  console.log(`Final OP1: [${formatBytes(readBytes(mem, OP1_ADDR, 9))}] => ${decodeBcdRealBytes(readBytes(mem, OP1_ADDR, 9))}`);
  console.log(`Final OP2: [${formatBytes(readBytes(mem, OP2_ADDR, 9))}] => ${decodeBcdRealBytes(readBytes(mem, OP2_ADDR, 9))}`);
  console.log(`Final FPS ptr: ${hex(read24(mem, FPS_ADDR))}`);

  if (lastMissingBlock !== null) {
    console.log(`Last missing block: ${hex(lastMissingBlock)}`);
  }
  if (thrownMessage) {
    console.log(`Thrown: ${thrownMessage.split('\n')[0]}`);
  }

  console.log('');

  // Unique PCs in dense range
  const sortedPcs = Array.from(densePcs).sort((a, b) => a - b);
  printHeader(`Unique PCs hit in steps ${DENSE_START}-${DENSE_END} (${sortedPcs.length} unique)`);

  for (const pc of sortedPcs) {
    const disasm = blockDisasm(pc);
    console.log(`  ${hex(pc)}: ${disasm}`);
  }

  console.log('');
}

try {
  main();
} catch (error) {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
}
