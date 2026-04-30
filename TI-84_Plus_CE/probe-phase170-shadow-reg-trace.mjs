#!/usr/bin/env node

/**
 * Phase 170 - Shadow Register Trace Through gcd(12,8)
 *
 * Traces shadow registers (AF', BC', DE', HL') at every block boundary
 * during gcd(12,8), logging every EX AF,AF' and EXX instruction
 * (detected by shadow register value changes).
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
// Shadow Register Trace
// ==========================================================================

function runShadowRegTrace(runtime) {
  console.log('='.repeat(80));
  console.log('SHADOW REGISTER TRACE THROUGH gcd(12,8)');
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

  // Print entry state
  console.log(`Entry OP1: [${formatBytes(readBytes(mem, OP1_ADDR, 9))}] = ${decodeBcdRealBytes(readBytes(mem, OP1_ADDR, 9))}`);
  console.log(`Entry OP2: [${formatBytes(readBytes(mem, OP2_ADDR, 9))}] = ${decodeBcdRealBytes(readBytes(mem, OP2_ADDR, 9))}`);
  console.log('');

  // Discover available shadow register properties
  console.log('--- Shadow register property discovery ---');
  const shadowProps = ['_a2', '_f2', '_bc2', '_de2', '_hl2', 'a2', 'f2', 'b2', 'c2', 'd2', 'e2', 'h2', 'l2', 'bc2', 'de2', 'hl2'];
  const available = [];
  for (const prop of shadowProps) {
    if (prop in cpu) {
      available.push(prop);
      console.log(`  cpu.${prop} = ${hex(cpu[prop])}`);
    }
  }
  if (available.length === 0) {
    console.log('  NO shadow register properties found! Listing all cpu props with "2" in the name:');
    for (const key of Object.getOwnPropertyNames(Object.getPrototypeOf(cpu)).concat(Object.keys(cpu))) {
      if (key.includes('2')) {
        console.log(`    cpu.${key} = ${typeof cpu[key] === 'function' ? '[function]' : cpu[key]}`);
      }
    }
  }
  console.log('');

  // Snapshot shadow registers
  function snapShadow() {
    return {
      a2: cpu._a2 ?? 0,
      f2: cpu._f2 ?? 0,
      bc2: cpu._bc2 ?? 0,
      de2: cpu._de2 ?? 0,
      hl2: cpu._hl2 ?? 0,
    };
  }

  function formatShadow(s) {
    return `A'=${hexByte(s.a2)} F'=${hexByte(s.f2)} BC'=${hex(s.bc2)} DE'=${hex(s.de2)} HL'=${hex(s.hl2)}`;
  }

  // Track changes
  const changes = [];
  let prevShadow = snapShadow();
  let stepCount = 0;
  let outcome = 'budget';

  const initialShadow = { ...prevShadow };
  console.log(`Initial shadow state: ${formatShadow(initialShadow)}`);
  console.log(`Initial main regs: A=${hexByte(cpu.a)} F=${hexByte(cpu.f)} BC=${hex(cpu._bc)} DE=${hex(cpu._de)} HL=${hex(cpu._hl)}`);
  console.log('');

  try {
    executor.runFrom(GCD_ENTRY, 'adl', {
      maxSteps: MAX_STEPS,
      maxLoopIterations: MAX_LOOP_ITER,

      onBlock(pc, mode, meta, step) {
        const norm = pc & 0xffffff;
        stepCount = step + 1;

        if (norm === FAKE_RET) throw new Error('__RET__');
        if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');

        // Check for shadow register changes
        const curShadow = snapShadow();
        const diffs = [];

        if (curShadow.a2 !== prevShadow.a2) {
          diffs.push(`A': ${hexByte(prevShadow.a2)} -> ${hexByte(curShadow.a2)}`);
        }
        if (curShadow.f2 !== prevShadow.f2) {
          diffs.push(`F': ${hexByte(prevShadow.f2)} -> ${hexByte(curShadow.f2)}`);
        }
        if (curShadow.bc2 !== prevShadow.bc2) {
          diffs.push(`BC': ${hex(prevShadow.bc2)} -> ${hex(curShadow.bc2)}`);
        }
        if (curShadow.de2 !== prevShadow.de2) {
          diffs.push(`DE': ${hex(prevShadow.de2)} -> ${hex(curShadow.de2)}`);
        }
        if (curShadow.hl2 !== prevShadow.hl2) {
          diffs.push(`HL': ${hex(prevShadow.hl2)} -> ${hex(curShadow.hl2)}`);
        }

        if (diffs.length > 0) {
          // Determine swap type
          const afChanged = curShadow.a2 !== prevShadow.a2 || curShadow.f2 !== prevShadow.f2;
          const bcdehChanged = curShadow.bc2 !== prevShadow.bc2 || curShadow.de2 !== prevShadow.de2 || curShadow.hl2 !== prevShadow.hl2;
          let swapType = 'unknown';
          if (afChanged && !bcdehChanged) swapType = 'EX AF,AF\'';
          else if (!afChanged && bcdehChanged) swapType = 'EXX';
          else if (afChanged && bcdehChanged) swapType = 'EX AF,AF\' + EXX (or multiple swaps)';

          const change = {
            step: stepCount,
            pc: norm,
            swapType,
            diffs,
            mainA: cpu.a & 0xff,
            mainF: cpu.f & 0xff,
            mainBC: cpu._bc,
            mainDE: cpu._de,
            mainHL: cpu._hl,
            shadow: { ...curShadow },
          };
          changes.push(change);
        }

        prevShadow = curShadow;
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

  const errNo = mem[ERR_NO_ADDR] & 0xff;
  const finalOP1 = readBytes(mem, OP1_ADDR, 9);
  const finalOP2 = readBytes(mem, OP2_ADDR, 9);
  const finalShadow = snapShadow();

  // --- Results ---

  console.log('='.repeat(80));
  console.log('EXECUTION RESULTS');
  console.log('='.repeat(80));
  console.log('');
  console.log(`Outcome: ${outcome}, steps: ${stepCount}`);
  console.log(`Error: ${hexByte(errNo)} (${errName(errNo)})`);
  console.log(`Final OP1: [${formatBytes(finalOP1)}] = ${decodeBcdRealBytes(finalOP1)}`);
  console.log(`Final OP2: [${formatBytes(finalOP2)}] = ${decodeBcdRealBytes(finalOP2)}`);
  console.log('');

  console.log('='.repeat(80));
  console.log('SHADOW REGISTER CHANGES');
  console.log('='.repeat(80));
  console.log('');
  console.log(`Total shadow register change events: ${changes.length}`);
  console.log('');

  if (changes.length === 0) {
    console.log('No shadow register changes detected during gcd(12,8).');
    console.log('This means no EX AF,AF\' or EXX instructions were executed,');
    console.log('or they swapped identical values.');
  } else {
    for (let i = 0; i < changes.length; i++) {
      const c = changes[i];
      console.log(`--- Change #${i + 1} at step ${c.step}, PC=${hex(c.pc)} ---`);
      console.log(`  Type: ${c.swapType}`);
      for (const d of c.diffs) {
        console.log(`  ${d}`);
      }
      console.log(`  After swap — main regs: A=${hexByte(c.mainA)} F=${hexByte(c.mainF)} BC=${hex(c.mainBC)} DE=${hex(c.mainDE)} HL=${hex(c.mainHL)}`);
      console.log(`  After swap — shadow:    ${formatShadow(c.shadow)}`);
      console.log('');
    }
  }

  console.log('='.repeat(80));
  console.log('SHADOW STATE COMPARISON');
  console.log('='.repeat(80));
  console.log('');
  console.log(`Initial: ${formatShadow(initialShadow)}`);
  console.log(`Final:   ${formatShadow(finalShadow)}`);
  console.log('');

  const netChanged = initialShadow.a2 !== finalShadow.a2 ||
    initialShadow.f2 !== finalShadow.f2 ||
    initialShadow.bc2 !== finalShadow.bc2 ||
    initialShadow.de2 !== finalShadow.de2 ||
    initialShadow.hl2 !== finalShadow.hl2;

  if (netChanged) {
    console.log('NET CHANGE: Shadow registers are DIFFERENT from initial state.');
    console.log('This means an odd number of swaps occurred — the shadow bank');
    console.log('is left holding values that were in the main bank at some point.');
  } else {
    console.log('NET CHANGE: Shadow registers returned to initial state.');
    console.log('(Even number of swaps, or zero swaps.)');
  }
  console.log('');

  // Analyze whether any swap brought in a suspicious value
  if (changes.length > 0) {
    console.log('='.repeat(80));
    console.log('SWAP ANALYSIS: Values brought into main registers');
    console.log('='.repeat(80));
    console.log('');
    for (let i = 0; i < changes.length; i++) {
      const c = changes[i];
      console.log(`Change #${i + 1} (${c.swapType} at step ${c.step}, PC=${hex(c.pc)}):`);
      if (c.swapType.includes('EX AF')) {
        // After EX AF,AF': the old shadow A/F are now in main A/F
        // The values that were in shadow before the swap are now the main values
        console.log(`  A (now main) = ${hexByte(c.mainA)}, F (now main) = ${hexByte(c.mainF)}`);
        console.log(`  A' (now shadow) = ${hexByte(c.shadow.a2)}, F' (now shadow) = ${hexByte(c.shadow.f2)}`);
      }
      if (c.swapType.includes('EXX')) {
        console.log(`  BC (now main) = ${hex(c.mainBC)}, DE (now main) = ${hex(c.mainDE)}, HL (now main) = ${hex(c.mainHL)}`);
        console.log(`  BC' (now shadow) = ${hex(c.shadow.bc2)}, DE' (now shadow) = ${hex(c.shadow.de2)}, HL' (now shadow) = ${hex(c.shadow.hl2)}`);
      }
      console.log('');
    }
  }
}

// ==========================================================================
// Main
// ==========================================================================

function main() {
  console.log('=== Phase 170: Shadow Register Trace Through gcd(12,8) ===');
  console.log('');

  const runtime = createPreparedRuntime();

  if (!runtime.memInitOk) {
    console.log('MEM_INIT failed; aborting.');
    process.exitCode = 1;
    return;
  }

  console.log('Cold boot + MEM_INIT complete.');
  console.log('');

  runShadowRegTrace(runtime);

  console.log('Done.');
  process.exitCode = 0;
}

try {
  main();
} catch (err) {
  console.error(err?.stack || String(err));
  process.exitCode = 1;
}
