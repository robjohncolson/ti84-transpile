#!/usr/bin/env node

/**
 * Phase 167 - Find the POP AF corresponding to PUSH AF at 0x068D84
 *
 * Part A: Static ROM byte scan for 0xF1 (POP AF) and 0x08 (EX AF,AF') in 0x068DA3-0x068EF0
 * Part B: Dynamic trace of gcd(12,8) to confirm which POP AF matches the PUSH AF depth
 * Part C: Check for flag-restore aliases (EX AF,AF')
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
const FP_CATEGORY_ADDR = 0xd0060e;
const GCD_CATEGORY = 0x28;
const GCD_ENTRY = 0x068d3d;

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
const MAX_STEPS = 3000;

const ADDR_PUSH_AF = 0x068d84;

// Scan range
const SCAN_START = 0x068da3;
const SCAN_END = 0x068ef0;

// --- Helpers ---

const hex = (v, w = 6) =>
  v === undefined || v === null
    ? 'n/a'
    : `0x${(Number(v) >>> 0).toString(16).toUpperCase().padStart(w, '0')}`;

const hexByte = (v) => (v & 0xff).toString(16).toUpperCase().padStart(2, '0');

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

function flagsString(f) {
  const s = (f & 0x80) ? 'S' : '-';
  const z = (f & 0x40) ? 'Z' : '-';
  const h = (f & 0x10) ? 'H' : '-';
  const p = (f & 0x04) ? 'P' : '-';
  const n = (f & 0x02) ? 'N' : '-';
  const c = (f & 0x01) ? 'C' : '-';
  return `${s}${z}${h}${p}${n}${c}`;
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

// --- eZ80 mini-disassembler for context ---

function disasmAt(rom, addr) {
  const b0 = rom[addr] & 0xff;

  // Single-byte instructions
  if (b0 === 0xf1) return { len: 1, mnem: 'POP AF' };
  if (b0 === 0xf5) return { len: 1, mnem: 'PUSH AF' };
  if (b0 === 0x08) return { len: 1, mnem: "EX AF,AF'" };
  if (b0 === 0xc9) return { len: 1, mnem: 'RET' };
  if (b0 === 0x00) return { len: 1, mnem: 'NOP' };
  if (b0 === 0x76) return { len: 1, mnem: 'HALT' };

  // CALL nn (3-byte addr in ADL)
  if (b0 === 0xcd) {
    const lo = rom[addr + 1] & 0xff;
    const mi = rom[addr + 2] & 0xff;
    const hi = rom[addr + 3] & 0xff;
    return { len: 4, mnem: `CALL 0x${hex((hi << 16) | (mi << 8) | lo, 6)}` };
  }

  // Conditional CALL cc,nn
  if ((b0 & 0xc7) === 0xc4) {
    const cc = ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'][(b0 >> 3) & 7];
    const lo = rom[addr + 1] & 0xff;
    const mi = rom[addr + 2] & 0xff;
    const hi = rom[addr + 3] & 0xff;
    return { len: 4, mnem: `CALL ${cc},0x${hex((hi << 16) | (mi << 8) | lo, 6)}` };
  }

  // JP nn
  if (b0 === 0xc3) {
    const lo = rom[addr + 1] & 0xff;
    const mi = rom[addr + 2] & 0xff;
    const hi = rom[addr + 3] & 0xff;
    return { len: 4, mnem: `JP 0x${hex((hi << 16) | (mi << 8) | lo, 6)}` };
  }

  // Conditional RET cc
  if ((b0 & 0xc7) === 0xc0) {
    const cc = ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'][(b0 >> 3) & 7];
    return { len: 1, mnem: `RET ${cc}` };
  }

  // JR e
  if (b0 === 0x18) {
    const e = rom[addr + 1] & 0xff;
    const offset = e < 128 ? e : e - 256;
    const target = addr + 2 + offset;
    return { len: 2, mnem: `JR 0x${hex(target, 6)}` };
  }

  // JR cc,e
  if (b0 >= 0x20 && b0 <= 0x38 && (b0 & 0x07) === 0x00) {
    const cc = ['NZ', 'Z', 'NC', 'C'][(b0 >> 3) & 3];
    const e = rom[addr + 1] & 0xff;
    const offset = e < 128 ? e : e - 256;
    const target = addr + 2 + offset;
    return { len: 2, mnem: `JR ${cc},0x${hex(target, 6)}` };
  }

  // LD A,imm8
  if (b0 === 0x3e) {
    return { len: 2, mnem: `LD A,0x${hexByte(rom[addr + 1])}` };
  }

  // LD r,imm8 (06,0E,16,1E,26,2E)
  if ((b0 & 0xc7) === 0x06 && b0 !== 0x36) {
    const regs = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
    const r = (b0 >> 3) & 7;
    return { len: 2, mnem: `LD ${regs[r]},0x${hexByte(rom[addr + 1])}` };
  }

  // LD HL,nn
  if (b0 === 0x21) {
    const lo = rom[addr + 1] & 0xff;
    const mi = rom[addr + 2] & 0xff;
    const hi = rom[addr + 3] & 0xff;
    return { len: 4, mnem: `LD HL,0x${hex((hi << 16) | (mi << 8) | lo, 6)}` };
  }

  // PUSH/POP other regs
  if (b0 === 0xc5) return { len: 1, mnem: 'PUSH BC' };
  if (b0 === 0xd5) return { len: 1, mnem: 'PUSH DE' };
  if (b0 === 0xe5) return { len: 1, mnem: 'PUSH HL' };
  if (b0 === 0xc1) return { len: 1, mnem: 'POP BC' };
  if (b0 === 0xd1) return { len: 1, mnem: 'POP DE' };
  if (b0 === 0xe1) return { len: 1, mnem: 'POP HL' };

  // CP imm8
  if (b0 === 0xfe) {
    return { len: 2, mnem: `CP 0x${hexByte(rom[addr + 1])}` };
  }

  // CB prefix (BIT, SET, RES)
  if (b0 === 0xcb) {
    const b1 = rom[addr + 1] & 0xff;
    const regs = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
    const r = b1 & 7;
    const bit = (b1 >> 3) & 7;
    if ((b1 & 0xc0) === 0x40) return { len: 2, mnem: `BIT ${bit},${regs[r]}` };
    if ((b1 & 0xc0) === 0xc0) return { len: 2, mnem: `SET ${bit},${regs[r]}` };
    if ((b1 & 0xc0) === 0x80) return { len: 2, mnem: `RES ${bit},${regs[r]}` };
    return { len: 2, mnem: `CB ${hexByte(b1)}` };
  }

  return { len: 1, mnem: `DB 0x${hexByte(b0)}` };
}

// --- Runtime setup (matches phase 166) ---

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
// PART A: Static ROM byte scan
// ==========================================================================

function partA() {
  console.log('================================================================');
  console.log('PART A: Static ROM byte scan (0x068DA3 - 0x068EF0)');
  console.log('================================================================');
  console.log('');

  // Find all 0xF1 (POP AF) bytes
  console.log('--- POP AF (0xF1) candidates ---');
  const popAfAddrs = [];
  for (let addr = SCAN_START; addr <= SCAN_END; addr++) {
    if ((romBytes[addr] & 0xff) === 0xf1) {
      popAfAddrs.push(addr);
      // Show context: 4 bytes before and after
      const ctxStart = Math.max(0, addr - 4);
      const ctxEnd = Math.min(romBytes.length, addr + 5);
      const ctxBytes = Array.from(romBytes.subarray(ctxStart, ctxEnd), (b) => b & 0xff);
      console.log(`  ${hex(addr)}: context = ${formatBytes(ctxBytes)}`);

      // Disassemble forward from a few bytes back to confirm it's really POP AF
      // Check if this byte could be part of a multi-byte instruction
      // Try disassembling from addr-4 forward
      console.log('    Disassembly context:');
      let pos = addr - 6;
      if (pos < SCAN_START) pos = SCAN_START;
      let confirmedPopAf = false;
      while (pos <= addr + 4 && pos <= SCAN_END) {
        const d = disasmAt(romBytes, pos);
        const marker = pos === addr ? ' <<<' : '';
        console.log(`      ${hex(pos)}: ${formatBytes(Array.from(romBytes.subarray(pos, pos + d.len)))} = ${d.mnem}${marker}`);
        if (pos === addr && d.mnem === 'POP AF') confirmedPopAf = true;
        pos += d.len;
      }
      console.log(`    Confirmed POP AF: ${confirmedPopAf}`);
      console.log('');
    }
  }

  // Find all 0x08 (EX AF,AF') bytes
  console.log('--- EX AF,AF\' (0x08) candidates ---');
  const exAfAddrs = [];
  for (let addr = SCAN_START; addr <= SCAN_END; addr++) {
    if ((romBytes[addr] & 0xff) === 0x08) {
      exAfAddrs.push(addr);
      const ctxStart = Math.max(0, addr - 4);
      const ctxEnd = Math.min(romBytes.length, addr + 5);
      const ctxBytes = Array.from(romBytes.subarray(ctxStart, ctxEnd), (b) => b & 0xff);
      console.log(`  ${hex(addr)}: context = ${formatBytes(ctxBytes)}`);

      // Check if this is part of a CALL or other multi-byte instruction
      // The byte before 0x08 could be part of a 4-byte CALL nn where 0x08 is the high byte of the address
      console.log('    Disassembly context:');
      let pos = addr - 6;
      if (pos < SCAN_START) pos = SCAN_START;
      let confirmedExAf = false;
      while (pos <= addr + 4 && pos <= SCAN_END) {
        const d = disasmAt(romBytes, pos);
        const marker = pos === addr ? ' <<<' : '';
        console.log(`      ${hex(pos)}: ${formatBytes(Array.from(romBytes.subarray(pos, pos + d.len)))} = ${d.mnem}${marker}`);
        if (pos === addr && d.mnem === "EX AF,AF'") confirmedExAf = true;
        pos += d.len;
      }
      console.log(`    Confirmed EX AF,AF': ${confirmedExAf}`);
      console.log('');
    }
  }

  return { popAfAddrs, exAfAddrs };
}

// ==========================================================================
// PART B: Dynamic trace
// ==========================================================================

function partB(popAfAddrs) {
  console.log('================================================================');
  console.log('PART B: Dynamic trace of POP AF hits during gcd(12,8)');
  console.log('================================================================');
  console.log('');

  const runtime = createPreparedRuntime();
  if (!runtime.memInitOk) {
    console.log('MEM_INIT failed; aborting Part B.');
    return;
  }
  console.log('Cold boot + MEM_INIT complete.');

  const { mem, executor, cpu } = runtime;

  // Set up gcd(12,8)
  const op1Bytes = Uint8Array.from([0x00, 0x81, 0x12, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]); // 12.0
  const op2Bytes = Uint8Array.from([0x00, 0x80, 0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]); // 8.0

  prepareCallState(cpu, mem);
  seedGcdFpState(mem, op1Bytes, op2Bytes);

  // Push OP2 to FPS
  const fpsPtr = read24(mem, FPS_ADDR);
  const op2Copy = readBytes(mem, OP2_ADDR, 9);
  for (let i = 0; i < 9; i++) {
    mem[fpsPtr + i] = op2Copy[i];
  }
  write24(mem, FPS_ADDR, fpsPtr + 9);

  seedErrFrame(cpu, mem, FAKE_RET, ERR_CATCH_ADDR, 0);

  console.log(`Entry OP1: [${formatBytes(readBytes(mem, OP1_ADDR, 9))}] = ${decodeBcdRealBytes(readBytes(mem, OP1_ADDR, 9))}`);
  console.log(`Entry OP2: [${formatBytes(readBytes(mem, OP2_ADDR, 9))}] = ${decodeBcdRealBytes(readBytes(mem, OP2_ADDR, 9))}`);
  console.log(`Entry SP: ${hex(cpu.sp)}`);
  console.log('');

  // Track state
  let stepCount = 0;
  let outcome = 'budget';

  // The key insight: PUSH AF at 0x068D84 is INSIDE the block starting at 0x068D82.
  // Similarly, POP AF at 0x068DDF is inside the block starting at 0x068DDB.
  // We need to track SP changes BETWEEN blocks to detect push/pop pairs.

  const blockTrace = [];
  const spTransitions = []; // track SP changes between consecutive blocks

  // Track the block containing PUSH AF (0x068D82) and blocks containing POP AF
  const BLOCK_WITH_PUSH_AF = 0x068d82; // block at BIT 0,B which contains PUSH AF at +2
  const BLOCK_WITH_POP_AF_1 = 0x068ddb; // block at CALL 0x080188 which contains POP AF at 0x068DDF
  const BLOCK_WITH_POP_AF_2 = 0x068e97; // block at CALL 0x082902 which contains POP AF at 0x068E9B

  let prevSP = null;
  let prevPC = null;

  try {
    executor.runFrom(GCD_ENTRY, 'adl', {
      maxSteps: MAX_STEPS,
      maxLoopIterations: MAX_LOOP_ITER,

      onBlock(pc, mode, meta, step) {
        const norm = pc & 0xffffff;
        stepCount++;

        if (norm === FAKE_RET) { outcome = 'ret'; throw new Error('__RET__'); }
        if (norm === ERR_CATCH_ADDR) { outcome = 'err'; throw new Error('__ERR__'); }

        const entry = {
          step: stepCount,
          pc: norm,
          sp: cpu.sp,
          a: cpu.a & 0xff,
          f: cpu.f & 0xff,
        };
        blockTrace.push(entry);

        // Track SP transitions to detect push/pop
        if (prevSP !== null && cpu.sp !== prevSP) {
          spTransitions.push({
            step: stepCount,
            fromPC: prevPC,
            toPC: norm,
            fromSP: prevSP,
            toSP: cpu.sp,
            delta: cpu.sp - prevSP,
          });
        }

        prevSP = cpu.sp;
        prevPC = norm;
      },
    });
  } catch (err) {
    if (err?.message !== '__RET__' && err?.message !== '__ERR__') throw err;
  }

  console.log(`Execution finished: outcome=${outcome}, steps=${stepCount}`);
  console.log('');

  // Find blocks where PUSH AF (0x068D82) was executed
  // After executing block 0x068D82 (which contains BIT 0,B + PUSH AF), SP should decrease by 3
  console.log('--- Block 0x068D82 (contains BIT 0,B + PUSH AF) hits ---');
  for (let i = 0; i < blockTrace.length; i++) {
    if (blockTrace[i].pc === BLOCK_WITH_PUSH_AF) {
      const next = i + 1 < blockTrace.length ? blockTrace[i + 1] : null;
      const spAfter = next ? next.sp : 'n/a';
      const spDelta = next ? next.sp - blockTrace[i].sp : 'n/a';
      console.log(`  step=${blockTrace[i].step} SP_before=${hex(blockTrace[i].sp)} SP_after=${typeof spAfter === 'number' ? hex(spAfter) : spAfter} delta=${spDelta}`);
      console.log(`    A=${hexByte(blockTrace[i].a)} F=${hexByte(blockTrace[i].f)}(${flagsString(blockTrace[i].f)}) -> next block PC=${next ? hex(next.pc) : 'n/a'}`);
      if (next) {
        console.log(`    At next block: A=${hexByte(next.a)} F=${hexByte(next.f)}(${flagsString(next.f)})`);
      }
    }
  }
  console.log('');

  // Find blocks where POP AF candidates were executed
  console.log('--- Block 0x068DDB (contains CALL 0x080188 + POP AF at 0x068DDF) hits ---');
  for (let i = 0; i < blockTrace.length; i++) {
    if (blockTrace[i].pc === BLOCK_WITH_POP_AF_1) {
      const next = i + 1 < blockTrace.length ? blockTrace[i + 1] : null;
      const spAfter = next ? next.sp : 'n/a';
      const spDelta = next ? next.sp - blockTrace[i].sp : 'n/a';
      console.log(`  step=${blockTrace[i].step} SP_before=${hex(blockTrace[i].sp)} SP_after=${typeof spAfter === 'number' ? hex(spAfter) : spAfter} delta=${spDelta}`);
      console.log(`    A=${hexByte(blockTrace[i].a)} F=${hexByte(blockTrace[i].f)}(${flagsString(blockTrace[i].f)}) -> next block PC=${next ? hex(next.pc) : 'n/a'}`);
      if (next) {
        console.log(`    At next block: A=${hexByte(next.a)} F=${hexByte(next.f)}(${flagsString(next.f)})`);
      }
      // Check stack at current SP to see what would be popped
      const stackBytes = readBytes(mem, blockTrace[i].sp, 6);
      console.log(`    Stack at SP: [${formatBytes(stackBytes)}]`);
    }
  }
  console.log('');

  console.log('--- Block 0x068E97 (contains CALL 0x082902 + POP AF at 0x068E9B) hits ---');
  for (let i = 0; i < blockTrace.length; i++) {
    if (blockTrace[i].pc === BLOCK_WITH_POP_AF_2) {
      const next = i + 1 < blockTrace.length ? blockTrace[i + 1] : null;
      console.log(`  step=${blockTrace[i].step} SP=${hex(blockTrace[i].sp)} -> next PC=${next ? hex(next.pc) : 'n/a'}`);
    }
  }
  console.log('');

  // Analyze SP flow around the PUSH AF block
  // When block 0x068D82 runs, it does: BIT 0,B; PUSH AF; CALL 0x07C747
  // So after the block: SP should be -3 (PUSH AF) -3 (CALL) = -6 from entry
  // When the CALL returns, SP goes back up by +3 (RET), so net is -3 from PUSH AF
  // The POP AF should bring SP back up by +3 to match the original

  console.log('--- SP transitions showing PUSH/POP pattern ---');
  console.log('Looking for SP changes of +3 or -3 in gcd region:');
  for (const t of spTransitions) {
    if ((t.fromPC >= 0x068d00 && t.fromPC <= 0x068f00) || (t.toPC >= 0x068d00 && t.toPC <= 0x068f00)) {
      console.log(`  step=${t.step} ${hex(t.fromPC)} -> ${hex(t.toPC)}: SP ${hex(t.fromSP)} -> ${hex(t.toSP)} (delta=${t.delta > 0 ? '+' : ''}${t.delta})`);
    }
  }
  console.log('');

  // Now let's check: does block 0x068DDB actually contain POP AF?
  // Disassemble the block at 0x068DDB to see what instructions it contains
  console.log('--- Disassembly of block at 0x068DDB ---');
  let pos = 0x068ddb;
  for (let i = 0; i < 8 && pos < 0x068df0; i++) {
    const d = disasmAt(romBytes, pos);
    const marker = pos === 0x068ddf ? ' <<< POP AF' : '';
    console.log(`  ${hex(pos)}: ${formatBytes(Array.from(romBytes.subarray(pos, pos + d.len)))} = ${d.mnem}${marker}`);
    pos += d.len;
  }
  console.log('');

  console.log('--- Disassembly of block at 0x068E97 ---');
  pos = 0x068e97;
  for (let i = 0; i < 8 && pos < 0x068eb0; i++) {
    const d = disasmAt(romBytes, pos);
    const marker = pos === 0x068e9b ? ' <<< POP AF' : '';
    console.log(`  ${hex(pos)}: ${formatBytes(Array.from(romBytes.subarray(pos, pos + d.len)))} = ${d.mnem}${marker}`);
    pos += d.len;
  }
  console.log('');

  // Dump condensed block trace for the gcd region
  console.log('--- Condensed block trace (gcd region 0x068D00-0x068F00) ---');
  const gcdTrace = blockTrace.filter((b) => b.pc >= 0x068d00 && b.pc <= 0x068f00);
  for (const b of gcdTrace) {
    const d = disasmAt(romBytes, b.pc);
    console.log(`  step=${b.step} PC=${hex(b.pc)} SP=${hex(b.sp)} A=${hexByte(b.a)} F=${hexByte(b.f)}(${flagsString(b.f)}) first_instr=${d.mnem}`);
  }
  console.log('');
}

// ==========================================================================
// PART C: EX AF,AF' check
// ==========================================================================

function partC() {
  console.log('================================================================');
  console.log("PART C: EX AF,AF' alias check");
  console.log('================================================================');
  console.log('');

  // The 0x08 bytes found in Part A need to be checked.
  // In eZ80 ADL mode, 0x08 is still EX AF,AF'.
  // But many 0x08 bytes are actually the high byte of a 24-bit address in CALL instructions.
  // A CALL nn is CD LL MM HH -- so if the byte at addr-3 is 0xCD, then 0x08 is the HH of the address.

  console.log('Checking each 0x08 byte to see if it is a standalone EX AF,AF\' or part of a CALL:');
  console.log('');

  for (let addr = SCAN_START; addr <= SCAN_END; addr++) {
    if ((romBytes[addr] & 0xff) !== 0x08) continue;

    // Check if addr-3 is a CALL (0xCD) -- then this 0x08 is part of the CALL target address
    const callCheck = addr >= 3 && (romBytes[addr - 3] & 0xff) === 0xcd;
    // Check if addr-3 is a conditional CALL (C4,CC,D4,DC,E4,EC,F4,FC)
    const condCallByte = addr >= 3 ? (romBytes[addr - 3] & 0xff) : 0;
    const condCallCheck = (condCallByte & 0xc7) === 0xc4;

    const partOfCall = callCheck || condCallCheck;

    if (partOfCall) {
      const callAddr = addr - 3;
      const d = disasmAt(romBytes, callAddr);
      console.log(`  ${hex(addr)}: 0x08 is part of ${d.mnem} at ${hex(callAddr)} -- NOT a standalone EX AF,AF'`);
    } else {
      console.log(`  ${hex(addr)}: 0x08 appears to be standalone EX AF,AF'`);
      // Disassemble context
      let pos = addr - 4;
      if (pos < SCAN_START) pos = SCAN_START;
      while (pos <= addr + 4 && pos <= SCAN_END) {
        const d = disasmAt(romBytes, pos);
        const marker = pos === addr ? ' <<<' : '';
        console.log(`    ${hex(pos)}: ${d.mnem}${marker}`);
        pos += d.len;
      }
    }
  }
  console.log('');
}

// ==========================================================================
// Main
// ==========================================================================

function main() {
  console.log('=== Phase 167: POP AF Search for PUSH AF at 0x068D84 ===');
  console.log('');

  const { popAfAddrs, exAfAddrs } = partA();
  partC();
  partB(popAfAddrs);

  console.log('=== Phase 167 complete ===');
}

main();
