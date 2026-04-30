#!/usr/bin/env node

/**
 * Phase 166 - Dump ALL register state at key checkpoints during 0x07C747
 *
 * Calls compound function 0x07C747 with OP1=12, OP2=8 and dumps full
 * register state at:
 *   1. Entry to 0x07CA48 (normalization start)
 *   2. Normalization loop exit (0x07CA57 RET C path, or 0x07C9AF LoopExit)
 *   3. Entry to 0x07C74F (InvOP1S, post-normalization)
 *   4. Entry to 0x07C77F (FPAdd)
 *   5. At FAKE_RET (final state)
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
const MAX_STEPS = 500;

// Target addresses
const COMPOUND_FUNC = 0x07C747;

// Checkpoint addresses
const NORM_ENTRY = 0x07CA48;       // normalization start
const NORM_LOOP_EXIT_A = 0x07CA57; // SUB 0x80, RET C path
const NORM_LOOP_EXIT_B = 0x07C9AF; // LoopExit -> BigShift
const BIGSHIFT = 0x07FAC2;        // BigShift target
const NORM_POST_LOOP = 0x07CA73;  // post-loop exponent combination
const NORM_RET = 0x07CA9F;        // normalization RET
const INVSUB_ENTRY = 0x07C74F;    // InvOP1S entry (after norm returns)
const INVSUB_IMPL = 0x07CA06;     // InvOP1S implementation
const FPADD_ENTRY = 0x07C77F;     // FPAdd entry
const FPADDSUB_CORE = 0x07CC36;   // FPAddSub_core

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

function noteStep(stepCount, step) {
  if (typeof step === 'number') return Math.max(stepCount, step + 1);
  return stepCount + 1;
}

// --- Register snapshot ---

function captureRegs(cpu, mem) {
  const snapshot = {
    a: cpu.a & 0xff,
    f: cpu.f & 0xff,
    b: cpu.b & 0xff,
    c: cpu.c & 0xff,
    d: cpu.d & 0xff,
    e: cpu.e & 0xff,
    h: (cpu._hl >> 8) & 0xff,
    l: cpu._hl & 0xff,
    hl: cpu._hl & 0xffffff,
    de: cpu._de & 0xffffff,
    bc: cpu._bc & 0xffffff,
    ix: cpu._ix & 0xffffff,
    iy: cpu._iy & 0xffffff,
    sp: cpu.sp & 0xffffff,
    // Shadow registers (try various names)
    hlp: typeof cpu._hlp === 'number' ? cpu._hlp & 0xffffff : undefined,
    dep: typeof cpu._dep === 'number' ? cpu._dep & 0xffffff : undefined,
    bcp: typeof cpu._bcp === 'number' ? cpu._bcp & 0xffffff : undefined,
    // Also try alternate shadow names
    hl_: typeof cpu.hl_ === 'number' ? cpu.hl_ & 0xffffff : undefined,
    de_: typeof cpu.de_ === 'number' ? cpu.de_ & 0xffffff : undefined,
    bc_: typeof cpu.bc_ === 'number' ? cpu.bc_ & 0xffffff : undefined,
    // Memory state
    op1: readBytes(mem, OP1_ADDR, 9),
    op2: readBytes(mem, OP2_ADDR, 9),
    fps: read24(mem, FPS_ADDR),
    errNo: mem[ERR_NO_ADDR] & 0xff,
  };
  return snapshot;
}

function printRegs(label, snap) {
  console.log(`  [${label}]`);
  console.log(`    A=${hexByte(snap.a)}  F=${hexByte(snap.f)}  B=${hexByte(snap.b)}  C=${hexByte(snap.c)}  D=${hexByte(snap.d)}  E=${hexByte(snap.e)}  H=${hexByte((snap.hl >> 8) & 0xff)}  L=${hexByte(snap.hl & 0xff)}`);
  console.log(`    HL=${hex(snap.hl)}  DE=${hex(snap.de)}  BC=${hex(snap.bc)}`);
  console.log(`    IX=${hex(snap.ix)}  IY=${hex(snap.iy)}  SP=${hex(snap.sp)}`);

  // Shadow registers
  if (snap.hlp !== undefined) {
    console.log(`    HL'=${hex(snap.hlp)}  DE'=${hex(snap.dep)}  BC'=${hex(snap.bcp)}`);
  } else if (snap.hl_ !== undefined) {
    console.log(`    HL'=${hex(snap.hl_)}  DE'=${hex(snap.de_)}  BC'=${hex(snap.bc_)}`);
  } else {
    console.log(`    HL'/DE'/BC' = not accessible`);
  }

  console.log(`    OP1: [${formatBytes(snap.op1)}] = ${decodeBcdRealBytes(snap.op1)}`);
  console.log(`    OP2: [${formatBytes(snap.op2)}] = ${decodeBcdRealBytes(snap.op2)}`);
  console.log(`    FPS: ${hex(snap.fps)}  errNo: ${hexByte(snap.errNo)} (${errName(snap.errNo)})`);
  console.log('');
}

function printFlagBits(f) {
  const s = (f & 0x80) ? 'S' : '-';
  const z = (f & 0x40) ? 'Z' : '-';
  const h = (f & 0x10) ? 'H' : '-';
  const p = (f & 0x04) ? 'P' : '-';
  const n = (f & 0x02) ? 'N' : '-';
  const c = (f & 0x01) ? 'C' : '-';
  return `${s}${z}-${h}-${p}${n}${c}`;
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

function seedFpState(mem) {
  seedAllocator(mem);
  mem.fill(0x00, FPS_CLEAN_AREA, FPS_CLEAN_AREA + 0x40);
  write24(mem, FPSBASE_ADDR, FPS_CLEAN_AREA);
  write24(mem, FPS_ADDR, FPS_CLEAN_AREA);
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

// ==========================================================================
// Main
// ==========================================================================

function main() {
  console.log('=== Phase 166: Register State Dump at Normalization Exit ===');
  console.log('=== Compound function 0x07C747, OP1=12, OP2=8 ===');
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

  // Reset state
  prepareCallState(cpu, mem);
  seedFpState(mem);

  // Set OP1=12, OP2=8
  seedRealRegister(mem, OP1_ADDR, Uint8Array.from([0x00, 0x81, 0x12, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]));
  seedRealRegister(mem, OP2_ADDR, Uint8Array.from([0x00, 0x80, 0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]));

  cpu._iy = 0xd00080;
  write24(mem, FPS_ADDR, FPS_CLEAN_AREA);

  // Push return sentinel
  cpu.sp = STACK_RESET_TOP;
  cpu.sp -= 3;
  write24(mem, cpu.sp, FAKE_RET);

  // Clear errNo
  mem[ERR_NO_ADDR] = 0x00;

  // Error frame
  const base = (cpu.sp - 6) & 0xffffff;
  write24(mem, base, ERR_CATCH_ADDR);
  write24(mem, base + 3, 0);
  write24(mem, ERR_SP_ADDR, base);

  const inputOP1 = readBytes(mem, OP1_ADDR, 9);
  const inputOP2 = readBytes(mem, OP2_ADDR, 9);
  console.log(`Input OP1: [${formatBytes(inputOP1)}] = ${decodeBcdRealBytes(inputOP1)}`);
  console.log(`Input OP2: [${formatBytes(inputOP2)}] = ${decodeBcdRealBytes(inputOP2)}`);
  console.log('');

  // First, enumerate CPU properties to find shadow registers
  console.log('--- CPU register properties ---');
  const cpuProps = Object.getOwnPropertyNames(cpu).sort();
  const regLike = cpuProps.filter(p => {
    const v = cpu[p];
    return typeof v === 'number' && !p.startsWith('_step');
  });
  console.log(`  All numeric props: ${regLike.join(', ')}`);
  console.log('');

  // Checkpoints
  const checkpoints = [];
  let stepCount = 0;
  let outcome = 'budget';

  // Track which checkpoint PCs we've seen and how many times
  const hitCounts = {};

  // All PCs to watch
  const watchPCs = new Set([
    COMPOUND_FUNC,  // 0x07C747 entry
    NORM_ENTRY,     // 0x07CA48
    NORM_LOOP_EXIT_A, // 0x07CA57 (RET C path)
    NORM_LOOP_EXIT_B, // 0x07C9AF (LoopExit)
    BIGSHIFT,       // 0x07FAC2
    NORM_POST_LOOP, // 0x07CA73
    NORM_RET,       // 0x07CA9F
    INVSUB_ENTRY,   // 0x07C74F
    INVSUB_IMPL,    // 0x07CA06
    FPADD_ENTRY,    // 0x07C77F
    FPADDSUB_CORE,  // 0x07CC36
    FAKE_RET,       // 0x7FFFFE
    ERR_CATCH_ADDR, // 0x7FFFFA
  ]);

  const pcNames = {
    [COMPOUND_FUNC]: 'CompoundEntry(0x07C747)',
    [NORM_ENTRY]: 'NormEntry(0x07CA48)',
    [NORM_LOOP_EXIT_A]: 'NormLoopRet(0x07CA57)',
    [NORM_LOOP_EXIT_B]: 'LoopExit(0x07C9AF)',
    [BIGSHIFT]: 'BigShift(0x07FAC2)',
    [NORM_POST_LOOP]: 'NormPostLoop(0x07CA73)',
    [NORM_RET]: 'NormRET(0x07CA9F)',
    [INVSUB_ENTRY]: 'InvOP1S_Entry(0x07C74F)',
    [INVSUB_IMPL]: 'InvOP1S_Impl(0x07CA06)',
    [FPADD_ENTRY]: 'FPAdd_Entry(0x07C77F)',
    [FPADDSUB_CORE]: 'FPAddSub_Core(0x07CC36)',
    [FAKE_RET]: 'FAKE_RET',
    [ERR_CATCH_ADDR]: 'ERR_CATCH',
  };

  try {
    executor.runFrom(COMPOUND_FUNC, 'adl', {
      maxSteps: MAX_STEPS,
      maxLoopIterations: MAX_LOOP_ITER,

      onBlock(pc, mode, meta, step) {
        const norm = pc & 0xffffff;
        stepCount = noteStep(stepCount, step);

        if (watchPCs.has(norm)) {
          hitCounts[norm] = (hitCounts[norm] || 0) + 1;
          const name = pcNames[norm] || hex(norm);
          const snap = captureRegs(cpu, mem);
          checkpoints.push({ pc: norm, name, step: stepCount, snap });
        }

        if (norm === FAKE_RET) throw new Error('__RET__');
        if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');
      },

      onMissingBlock(pc, mode, step) {
        const norm = pc & 0xffffff;
        stepCount = noteStep(stepCount, step);

        if (watchPCs.has(norm)) {
          hitCounts[norm] = (hitCounts[norm] || 0) + 1;
          const name = pcNames[norm] || hex(norm);
          const snap = captureRegs(cpu, mem);
          checkpoints.push({ pc: norm, name, step: stepCount, snap });
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

  console.log(`Outcome: ${outcome}  Total steps: ${stepCount}`);
  console.log(`Total checkpoints captured: ${checkpoints.length}`);
  console.log('');

  // Print hit counts
  console.log('--- Hit counts ---');
  for (const [pc, count] of Object.entries(hitCounts).sort((a, b) => Number(a[0]) - Number(b[0]))) {
    const name = pcNames[Number(pc)] || hex(Number(pc));
    console.log(`  ${name}: ${count} hit(s)`);
  }
  console.log('');

  // Print all checkpoint dumps
  console.log('='.repeat(80));
  console.log('CHECKPOINT REGISTER DUMPS (in execution order)');
  console.log('='.repeat(80));
  console.log('');

  for (let i = 0; i < checkpoints.length; i++) {
    const cp = checkpoints[i];
    console.log(`Checkpoint #${i + 1}: ${cp.name} (step ${cp.step})`);
    printRegs(cp.name, cp.snap);

    // Print flag bits
    console.log(`    Flags: ${printFlagBits(cp.snap.f)}`);
    console.log('');
  }

  // Comparison table
  console.log('='.repeat(80));
  console.log('COMPARISON TABLE');
  console.log('='.repeat(80));
  console.log('');

  // Column headers
  const labels = checkpoints.map((cp, i) => `#${i + 1}`);
  const headerLine = '  Reg       ' + labels.map(l => l.padStart(12)).join('');
  console.log(headerLine);
  console.log('  ' + '-'.repeat(headerLine.length - 2));

  const regKeys = ['a', 'f', 'b', 'c', 'd', 'e', 'hl', 'de', 'bc', 'ix', 'iy', 'sp', 'fps', 'errNo'];

  for (const key of regKeys) {
    const vals = checkpoints.map(cp => {
      const v = cp.snap[key];
      if (key === 'f') return hexByte(v) + '(' + printFlagBits(v) + ')';
      if (['a', 'b', 'c', 'd', 'e', 'errNo'].includes(key)) return hexByte(v);
      return hex(v);
    });
    const changed = new Set(vals).size > 1 ? ' *' : '';
    console.log(`  ${(key).padEnd(10)}${vals.map(v => v.padStart(12)).join('')}${changed}`);
  }

  console.log('');
  console.log('  (* = changed between checkpoints)');
  console.log('');

  // OP1/OP2 at each checkpoint
  console.log('--- OP1 at each checkpoint ---');
  for (let i = 0; i < checkpoints.length; i++) {
    const cp = checkpoints[i];
    console.log(`  #${i + 1} ${cp.name}: [${formatBytes(cp.snap.op1)}] = ${decodeBcdRealBytes(cp.snap.op1)}`);
  }
  console.log('');

  console.log('--- OP2 at each checkpoint ---');
  for (let i = 0; i < checkpoints.length; i++) {
    const cp = checkpoints[i];
    console.log(`  #${i + 1} ${cp.name}: [${formatBytes(cp.snap.op2)}] = ${decodeBcdRealBytes(cp.snap.op2)}`);
  }
  console.log('');

  // Final state
  console.log('--- Final output ---');
  const finalOP1 = readBytes(mem, OP1_ADDR, 9);
  const finalOP2 = readBytes(mem, OP2_ADDR, 9);
  const finalErrNo = mem[ERR_NO_ADDR] & 0xff;
  console.log(`  OP1: [${formatBytes(finalOP1)}] = ${decodeBcdRealBytes(finalOP1)}`);
  console.log(`  OP2: [${formatBytes(finalOP2)}] = ${decodeBcdRealBytes(finalOP2)}`);
  console.log(`  errNo: ${hexByte(finalErrNo)} (${errName(finalErrNo)})`);
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
