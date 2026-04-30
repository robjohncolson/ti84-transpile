#!/usr/bin/env node

/**
 * Phase 150 - gcd sign-fix quick test + disassembly.
 *
 * Part A:
 *   - Reuse the phase148 cold-boot + MEM_INIT + FPS seeding pattern.
 *   - Run gcd(12,8) from the direct handler at 0x068D3D.
 *   - Clear OP1[0] and OP2[0] whenever the type validator at 0x07F831 runs.
 *   - Report whether the run returns cleanly with OP1 = 4.0 and errNo = 0x00.
 *
 * Part B:
 *   - Dump the lifted block containing 0x068D59.
 *   - Dump the lifted block containing 0x07C783.
 *   - Show raw ROM bytes from memory after ROM load and the exact instruction
 *     at the focus address.
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

const DISASM_SITE_GCD_TAIL = 0x068d59;
const DISASM_SITE_OP2_TAIL = 0x07c783;

const FAKE_RET = 0x7ffffe;
const ERR_CATCH_ADDR = 0x7ffffa;

const MEMINIT_BUDGET = 100000;
const MAX_STEPS = 2000;
const MAX_LOOP_ITER = 8192;

const FPS_CLEAN_AREA = 0xd1aa00;
const FPS_ENTRY_SIZE = 9;
const GCD_CATEGORY = 0x28;

// Keep the verified phase148 seed layout for 12.0 / 8.0.
const BCD_12 = Uint8Array.from([0x00, 0x81, 0x12, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
const BCD_8 = Uint8Array.from([0x00, 0x80, 0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
const BCD_4 = Uint8Array.from([0x00, 0x80, 0x40, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

const EXPECTED_GCD_HEX = Array.from(
  BCD_4,
  (byte) => byte.toString(16).toUpperCase().padStart(2, '0')
).join(' ');

const formatBlockKey = (pc, mode = 'adl') =>
  `${pc.toString(16).padStart(6, '0')}:${mode}`;

const hex = (v, w = 6) =>
  v === undefined || v === null
    ? 'n/a'
    : `0x${(Number(v) >>> 0).toString(16).toUpperCase().padStart(w, '0')}`;

const hexByte = (v) =>
  (v & 0xff).toString(16).toUpperCase().padStart(2, '0');

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

function decodeBCDFloat(mem, addr) {
  const type = mem[addr] & 0xff;
  const exp = mem[addr + 1] & 0xff;
  const digits = [];
  for (let i = 2; i < 9; i++) {
    const b = mem[addr + i] & 0xff;
    digits.push((b >> 4) & 0x0f, b & 0x0f);
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

function errName(code) {
  if (code === 0x00) return 'none';
  if (code === 0x84) return 'E_Domain';
  if (code === 0x88) return 'E_Syntax';
  if (code === 0x8d) return 'E_Undefined';
  if (code === 0x80) return 'E_Edit';
  if (code === 0x81) return 'E_Overflow';
  return `unknown(${hex(code, 2)})`;
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
  } catch (error) {
    if (error?.message === '__RET__') ok = true;
    else throw error;
  }
  return ok;
}

function createPreparedRuntime() {
  const runtime = createRuntime();
  coldBoot(runtime.executor, runtime.cpu, runtime.mem);
  const memInitOk = runMemInit(runtime.executor, runtime.cpu, runtime.mem);
  return { ...runtime, memInitOk };
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

function noteStep(stepCount, step) {
  if (typeof step === 'number') {
    return Math.max(stepCount, step + 1);
  }
  return stepCount + 1;
}

function blockByteLength(block) {
  const instructions = block?.instructions ?? [];
  if (instructions.length === 0) return 0;
  const last = instructions[instructions.length - 1];
  return ((last.pc + last.length) - block.startPc) >>> 0;
}

function findInstruction(block, targetPc) {
  return (block?.instructions ?? []).find((inst) => ((inst.pc >>> 0) & 0xffffff) === targetPc) ?? null;
}

function findBlocksContaining(executor, targetPc, mode = 'adl') {
  const matches = [];
  for (const block of Object.values(executor.blockMeta)) {
    if (block.mode !== mode) continue;
    if ((block.instructions ?? []).some((inst) => ((inst.pc >>> 0) & 0xffffff) === targetPc)) {
      matches.push(block);
    }
  }
  matches.sort((a, b) => {
    const aStart = a.startPc >>> 0;
    const bStart = b.startPc >>> 0;
    if (aStart !== bStart) return aStart - bStart;
    return blockByteLength(a) - blockByteLength(b);
  });
  return matches;
}

function printBlockDetails(label, executor, mem, block, focusPc) {
  const startPc = block.startPc >>> 0;
  const key = formatBlockKey(startPc, block.mode);
  const focusInst = findInstruction(block, focusPc);
  const byteLength = blockByteLength(block);

  console.log(`  ${label}: ${key}`);
  console.log(`    start: ${hex(startPc)}`);
  console.log(`    mode: ${block.mode}`);
  console.log(`    instructionCount: ${block.instructionCount}`);
  console.log(`    lengthBytes: ${byteLength}`);
  console.log(`    ROM bytes @ start (+32): [${hexBytes(mem, startPc, 32)}]`);
  if (focusInst) {
    console.log(
      `    instruction @ ${hex(focusPc)}: [${focusInst.bytes}] ${focusInst.dasm}`
    );
  } else {
    console.log(`    instruction @ ${hex(focusPc)}: not present in this block`);
  }
  console.log('    instructions:');
  for (const inst of block.instructions ?? []) {
    console.log(`      ${hex(inst.pc)}  [${inst.bytes}]  ${inst.dasm}`);
  }
  console.log('    source:');
  for (const line of String(block.source ?? '').split('\n')) {
    console.log(`      ${line}`);
  }

  if (focusInst?.target !== undefined && focusInst.target !== null) {
    const targetPc = focusInst.target & 0xffffff;
    const targetMode = focusInst.targetMode ?? block.mode;
    const exactTarget = executor.blockMeta[formatBlockKey(targetPc, targetMode)];
    if (exactTarget) {
      console.log(`    target block for ${hex(focusPc)} -> ${hex(targetPc)}:`);
      console.log(`      ${formatBlockKey(exactTarget.startPc >>> 0, exactTarget.mode)}`);
      console.log(`      ROM bytes @ target (+32): [${hexBytes(mem, targetPc, 32)}]`);
      for (const inst of exactTarget.instructions ?? []) {
        console.log(`      ${hex(inst.pc)}  [${inst.bytes}]  ${inst.dasm}`);
      }
    }
  }
}

function dumpBlockContaining(label, executor, mem, focusPc) {
  console.log('========================================================================');
  console.log(label);
  console.log('========================================================================');
  const matches = findBlocksContaining(executor, focusPc, 'adl');

  if (matches.length === 0) {
    console.log(`No ADL block contains ${hex(focusPc)}.`);
    console.log('');
    return;
  }

  const exact = matches.find((block) => ((block.startPc >>> 0) & 0xffffff) === focusPc) ?? null;
  const primary = exact ?? matches[0];
  printBlockDetails('primary', executor, mem, primary, focusPc);

  for (const block of matches) {
    if (block === primary) continue;
    console.log('');
    printBlockDetails('alternate', executor, mem, block, focusPc);
  }

  console.log('');
}

function runSignFixProbe() {
  const runtime = createPreparedRuntime();
  const { mem, executor, cpu, memInitOk } = runtime;

  const result = {
    ...runtime,
    outcome: 'meminit-failed',
    success: false,
    errNo: null,
    op1Hex: null,
    op2Hex: null,
    op1Value: null,
    op2Value: null,
    stepCount: 0,
    lastMissingBlock: null,
    thrownMessage: null,
    validatorClears: [],
  };

  if (!memInitOk) return result;

  seedGcdState(mem);
  prepareCallState(cpu, mem);
  seedErrFrame(cpu, mem, FAKE_RET, ERR_CATCH_ADDR, 0);

  result.seededOp1Hex = hexBytes(mem, OP1_ADDR, 9);
  result.seededOp2Hex = hexBytes(mem, OP2_ADDR, 9);
  result.seededFpsBase = read24(mem, FPSBASE_ADDR);
  result.seededFpsPtr = read24(mem, FPS_ADDR);

  try {
    executor.runFrom(GCD_DIRECT_ADDR, 'adl', {
      maxSteps: MAX_STEPS,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc, _mode, _meta, step) {
        const norm = pc & 0xffffff;
        result.stepCount = noteStep(result.stepCount, step);
        if (norm === TYPE_VALIDATOR_ADDR) {
          const op1Before = mem[OP1_ADDR] & 0xff;
          const op2Before = mem[OP2_ADDR] & 0xff;
          mem[OP1_ADDR] = 0x00;
          mem[OP2_ADDR] = 0x00;
          result.validatorClears.push({
            step: result.stepCount,
            pc: norm,
            op1Before,
            op2Before,
          });
        }
        if (norm === FAKE_RET) throw new Error('__RET__');
        if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');
      },
      onMissingBlock(pc, _mode, step) {
        const norm = pc & 0xffffff;
        result.stepCount = noteStep(result.stepCount, step);
        result.lastMissingBlock = norm;
        if (norm === FAKE_RET) throw new Error('__RET__');
        if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');
      },
    });
    result.outcome = 'budget';
  } catch (error) {
    if (error?.message === '__RET__') {
      result.outcome = 'return';
    } else if (error?.message === '__ERR__') {
      result.outcome = 'error';
    } else {
      result.outcome = 'threw';
      result.thrownMessage = error?.stack || String(error);
    }
  }

  result.errNo = mem[ERR_NO_ADDR] & 0xff;
  result.op1Hex = hexBytes(mem, OP1_ADDR, 9);
  result.op2Hex = hexBytes(mem, OP2_ADDR, 9);
  result.op1Value = decodeBCDFloat(mem, OP1_ADDR);
  result.op2Value = decodeBCDFloat(mem, OP2_ADDR);
  result.finalFpsBase = read24(mem, FPSBASE_ADDR);
  result.finalFpsPtr = read24(mem, FPS_ADDR);
  result.success =
    result.outcome === 'return' &&
    result.errNo === 0x00 &&
    result.op1Hex === EXPECTED_GCD_HEX;

  return result;
}

function printPartA(result) {
  console.log('========================================================================');
  console.log('Part A - Quick Test: clear OP1[0]/OP2[0] at 0x07F831');
  console.log('========================================================================');

  if (!result.memInitOk) {
    console.log('MEM_INIT failed; gcd scenario did not run.');
    console.log('');
    return;
  }

  console.log(`Entry: ${hex(GCD_DIRECT_ADDR)}`);
  console.log(`Seeded OP1: [${result.seededOp1Hex}]`);
  console.log(`Seeded OP2: [${result.seededOp2Hex}]`);
  console.log(`Seeded FPS base: ${hex(result.seededFpsBase)}`);
  console.log(`Seeded FPS ptr:  ${hex(result.seededFpsPtr)}`);
  console.log(`Expected gcd OP1: [${EXPECTED_GCD_HEX}]`);
  console.log('');

  if (result.validatorClears.length === 0) {
    console.log(`No hits at ${hex(TYPE_VALIDATOR_ADDR)}.`);
  } else {
    console.log(`Validator hits at ${hex(TYPE_VALIDATOR_ADDR)}: ${result.validatorClears.length}`);
    for (const hit of result.validatorClears) {
      console.log(
        `  step ${String(hit.step).padStart(4, ' ')} @ ${hex(hit.pc)}: ` +
        `OP1[0]=${hex(hit.op1Before, 2)} OP2[0]=${hex(hit.op2Before, 2)} -> forced both to 0x00`
      );
    }
  }
  console.log('');
  console.log(`Outcome: ${result.outcome}`);
  console.log(`Steps: ${result.stepCount}`);
  console.log(`errNo: ${hex(result.errNo, 2)} (${errName(result.errNo)})`);
  console.log(`Final OP1: [${result.op1Hex}]`);
  console.log(`Final OP1 decode: ${result.op1Value}`);
  console.log(`Final OP2: [${result.op2Hex}]`);
  console.log(`Final OP2 decode: ${result.op2Value}`);
  console.log(`Final FPS base: ${hex(result.finalFpsBase)}`);
  console.log(`Final FPS ptr:  ${hex(result.finalFpsPtr)}`);
  if (result.lastMissingBlock !== null) {
    console.log(`Last missing block: ${hex(result.lastMissingBlock)}`);
  }
  if (result.thrownMessage) {
    console.log(`Thrown: ${result.thrownMessage.split('\n')[0]}`);
  }
  console.log('');
  console.log(
    `Success criterion (return + errNo=0x00 + OP1=4.0): ${result.success ? 'YES' : 'NO'}`
  );
  console.log('');
}

function main() {
  console.log('=== Phase 150: gcd sign-fix quick test + disassembly ===');
  console.log('');

  const result = runSignFixProbe();
  printPartA(result);
  dumpBlockContaining(
    'Part B - Lifted block containing 0x068D59',
    result.executor,
    result.mem,
    DISASM_SITE_GCD_TAIL
  );
  dumpBlockContaining(
    'Part B - Lifted block containing 0x07C783',
    result.executor,
    result.mem,
    DISASM_SITE_OP2_TAIL
  );

  if (!result.memInitOk) {
    process.exitCode = 1;
  }
}

try {
  main();
} catch (error) {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
}
