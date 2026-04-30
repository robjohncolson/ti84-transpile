#!/usr/bin/env node

/**
 * Phase 153 - FPS stack tracking across gcd steps 1-400+.
 *
 * Tracks every FPS pointer change (push/pop) and every OP2 change
 * during gcd(12,8) via 0x068D3D, to determine WHEN 8.0 is popped
 * back from FPS into OP2 relative to the division.
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
const DETAILED_STEPS = 400;
const TOTAL_MAX_STEPS = 2000;

const FPS_CLEAN_AREA = 0xd1aa00;
const FPS_ENTRY_SIZE = 9;

const BCD_12 = Uint8Array.from([0x00, 0x81, 0x12, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
const BCD_8 = Uint8Array.from([0x00, 0x80, 0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
const BCD_1 = Uint8Array.from([0x00, 0x80, 0x10, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

// Key FP block addresses for annotation
const KNOWN_BLOCKS = new Map([
  [0x07c771, 'FPSub entry'],
  [0x07c77f, 'FPAdd entry'],
  [0x07c763, 'likely FPDiv'],
  [0x07cc36, 'FP subtraction core'],
  [0x07f831, 'type validator'],
  [0x07fa74, 'const 1.0 loader'],
  [0x07fa86, 'const loader cont'],
  [0x068d3d, 'gcd entry'],
  [0x068d59, 'gcd tail JP'],
  [0x0828fc, 'real FP pop'],
  [0x082912, 'FPS dec-9 helper'],
]);

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

function seedRealRegister(mem, addr, bytes) {
  mem.fill(0x00, addr, addr + 11);
  mem.set(bytes, addr);
}

function main() {
  console.log('=== Phase 153: FPS stack tracking across gcd(12,8) ===');
  console.log('');

  const runtime = createPreparedRuntime();
  if (!runtime.memInitOk) {
    console.log('MEM_INIT failed; cannot proceed.');
    return;
  }

  const { mem, executor, cpu } = runtime;

  // Set up gcd state
  prepareCallState(cpu, mem);
  seedAllocator(mem);
  mem.fill(0x00, FPS_CLEAN_AREA, FPS_CLEAN_AREA + 0x40);
  write24(mem, FPSBASE_ADDR, FPS_CLEAN_AREA);
  write24(mem, FPS_ADDR, FPS_CLEAN_AREA);
  seedRealRegister(mem, OP1_ADDR, BCD_12);
  seedRealRegister(mem, OP2_ADDR, BCD_8);
  mem[FP_CATEGORY_ADDR] = GCD_CATEGORY;
  mem[ERR_NO_ADDR] = 0x00;
  seedErrFrame(cpu, mem, FAKE_RET, ERR_CATCH_ADDR, 0);

  const initialFps = read24(mem, FPS_ADDR);
  console.log(`Initial FPS ptr: ${hex(initialFps)}`);
  console.log(`Initial FPS base: ${hex(read24(mem, FPSBASE_ADDR))}`);
  console.log(`Initial OP1: [${formatBytes(readBytes(mem, OP1_ADDR, 9))}] => ${decodeBcdRealBytes(readBytes(mem, OP1_ADDR, 9))}`);
  console.log(`Initial OP2: [${formatBytes(readBytes(mem, OP2_ADDR, 9))}] => ${decodeBcdRealBytes(readBytes(mem, OP2_ADDR, 9))}`);
  console.log('');

  // Tracking state
  let prevFps = initialFps;
  let prevOp2 = readBytes(mem, OP2_ADDR, 9);
  const fpsTimeline = [];
  const op2Timeline = [];
  let stepCount = 0;
  let outcome = 'budget';
  let lastMissingBlock = null;
  let thrownMessage = null;

  function bytesEqual(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if ((a[i] & 0xff) !== (b[i] & 0xff)) return false;
    }
    return true;
  }

  function describeValue(bytes) {
    if (bytesEqual(bytes, Array.from(BCD_12))) return '12.0';
    if (bytesEqual(bytes, Array.from(BCD_8))) return '8.0';
    if (bytesEqual(bytes, Array.from(BCD_1))) return '1.0';
    return decodeBcdRealBytes(bytes);
  }

  function handleStep(pc, step) {
    const norm = pc & 0xffffff;
    const blockLabel = KNOWN_BLOCKS.get(norm) || '';

    // Check FPS pointer
    const currentFps = read24(mem, FPS_ADDR);
    if (currentFps !== prevFps) {
      const diff = currentFps - prevFps;
      const direction = diff > 0 ? 'PUSH' : 'POP';
      const entries = Math.abs(diff) / 9;

      const entry = {
        step,
        pc: norm,
        blockLabel,
        prevFps,
        newFps: currentFps,
        direction,
        entries,
      };

      // Dump bytes at relevant FPS address
      if (direction === 'PUSH') {
        // After push, data is at prevFps (the old top)
        entry.fpsData = readBytes(mem, prevFps, 9);
        entry.fpsDataHex = formatBytes(entry.fpsData);
        entry.fpsDataValue = describeValue(entry.fpsData);
      } else {
        // After pop, data was at newFps (the new top = where data was)
        entry.fpsData = readBytes(mem, currentFps, 9);
        entry.fpsDataHex = formatBytes(entry.fpsData);
        entry.fpsDataValue = describeValue(entry.fpsData);
      }

      fpsTimeline.push(entry);

      if (step <= DETAILED_STEPS) {
        console.log(
          `STEP ${String(step).padStart(4)} FPS ${direction}: ${hex(prevFps)} -> ${hex(currentFps)} ` +
          `(${entries} entry) at PC=${hex(norm)}${blockLabel ? ' [' + blockLabel + ']' : ''}`
        );
        console.log(`  FPS data: [${entry.fpsDataHex}] => ${entry.fpsDataValue}`);
      }

      prevFps = currentFps;
    }

    // Check OP2 changes
    const currentOp2 = readBytes(mem, OP2_ADDR, 9);
    if (!bytesEqual(currentOp2, prevOp2)) {
      const entry = {
        step,
        pc: norm,
        blockLabel,
        oldOp2: prevOp2.slice(),
        oldOp2Hex: formatBytes(prevOp2),
        oldOp2Value: describeValue(prevOp2),
        newOp2: currentOp2.slice(),
        newOp2Hex: formatBytes(currentOp2),
        newOp2Value: describeValue(currentOp2),
      };

      op2Timeline.push(entry);

      if (step <= DETAILED_STEPS) {
        console.log(
          `STEP ${String(step).padStart(4)} OP2 CHANGED at PC=${hex(norm)}${blockLabel ? ' [' + blockLabel + ']' : ''}`
        );
        console.log(`  old: [${entry.oldOp2Hex}] => ${entry.oldOp2Value}`);
        console.log(`  new: [${entry.newOp2Hex}] => ${entry.newOp2Value}`);
      }

      prevOp2 = currentOp2.slice();
    }
  }

  try {
    executor.runFrom(GCD_DIRECT_ADDR, 'adl', {
      maxSteps: TOTAL_MAX_STEPS,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc, mode, meta, step) {
        const norm = pc & 0xffffff;
        stepCount = noteStep(stepCount, step);
        handleStep(norm, stepCount);
        if (norm === FAKE_RET) throw new Error('__RET__');
        if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');
      },
      onMissingBlock(pc, mode, step) {
        const norm = pc & 0xffffff;
        stepCount = noteStep(stepCount, step);
        lastMissingBlock = norm;
        handleStep(norm, stepCount);
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

  console.log('');
  printHeader('Final State');
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

  // Summary timelines
  printHeader('FPS Change Timeline');
  if (fpsTimeline.length === 0) {
    console.log('No FPS changes detected.');
  } else {
    for (const entry of fpsTimeline) {
      console.log(
        `Step ${String(entry.step).padStart(4)}: ${entry.direction.padEnd(4)} ` +
        `${hex(entry.prevFps)} -> ${hex(entry.newFps)} ` +
        `at PC=${hex(entry.pc)}${entry.blockLabel ? ' [' + entry.blockLabel + ']' : ''} ` +
        `data=[${entry.fpsDataHex}] => ${entry.fpsDataValue}`
      );
    }
  }
  console.log('');

  printHeader('OP2 Change Timeline');
  if (op2Timeline.length === 0) {
    console.log('No OP2 changes detected.');
  } else {
    for (const entry of op2Timeline) {
      console.log(
        `Step ${String(entry.step).padStart(4)}: ` +
        `[${entry.oldOp2Hex}] => ${entry.oldOp2Value}  -->  ` +
        `[${entry.newOp2Hex}] => ${entry.newOp2Value} ` +
        `at PC=${hex(entry.pc)}${entry.blockLabel ? ' [' + entry.blockLabel + ']' : ''}`
      );
    }
  }
  console.log('');

  // Correlation analysis
  printHeader('Correlation Analysis');

  // Find when OP2 becomes 8.0 again
  const op2BackTo8 = op2Timeline.find(
    (e) => bytesEqual(e.newOp2, Array.from(BCD_8))
  );

  // Find when OP2 becomes 1.0
  const op2To1 = op2Timeline.find(
    (e) => bytesEqual(e.newOp2, Array.from(BCD_1))
  );

  // Find FPDiv-related blocks
  const divRelated = fpsTimeline.filter(
    (e) => e.pc >= 0x07c750 && e.pc <= 0x07c780
  );

  if (op2To1) {
    console.log(`OP2 set to 1.0 at step ${op2To1.step}, PC=${hex(op2To1.pc)}${op2To1.blockLabel ? ' [' + op2To1.blockLabel + ']' : ''}`);
  } else {
    console.log('OP2 was never set to 1.0');
  }

  if (op2BackTo8) {
    console.log(`OP2 restored to 8.0 at step ${op2BackTo8.step}, PC=${hex(op2BackTo8.pc)}${op2BackTo8.blockLabel ? ' [' + op2BackTo8.blockLabel + ']' : ''}`);
  } else {
    console.log('OP2 was never restored to 8.0');
  }

  if (divRelated.length > 0) {
    console.log('FPS changes near FP division range (0x07C750-0x07C780):');
    for (const entry of divRelated) {
      console.log(`  Step ${entry.step}: ${entry.direction} at PC=${hex(entry.pc)}`);
    }
  }

  // Key question
  console.log('');
  if (op2BackTo8 && op2To1) {
    const divStep = op2To1.step;
    const restoreStep = op2BackTo8.step;
    if (restoreStep < divStep) {
      console.log(`FINDING: 8.0 restored to OP2 at step ${restoreStep} BEFORE 1.0 loaded at step ${divStep}`);
      console.log('=> Division would use OP2=8.0 (correct Euclidean step)');
    } else {
      console.log(`FINDING: 1.0 loaded to OP2 at step ${divStep} BEFORE 8.0 restored at step ${restoreStep}`);
      console.log('=> Division may use OP2=1.0 (wrong — would give INT(12/1)=12)');
    }
  } else {
    console.log('FINDING: Could not determine relative ordering of OP2=1.0 and OP2=8.0 transitions.');
    console.log('Check the timelines above for manual analysis.');
  }

  console.log('');
}

try {
  main();
} catch (error) {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
}
