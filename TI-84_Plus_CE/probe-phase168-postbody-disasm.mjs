#!/usr/bin/env node

/**
 * Phase 168 - Instruction-level disassembly of gcd post-body path 0x068DA3-0x068DDF
 *
 * Part 1: Static disassembly of every instruction in the range, with named targets
 * Part 2: Dynamic trace through gcd(12,8), logging OP1-OP6 at each CALL in the range
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
const MAX_STEPS = 4000;

// --- Known function names ---
const KNOWN_TARGETS = {
  0x07F8A2: 'OP1ToOP4',
  0x07F8B6: 'OP4ToOP2',
  0x07F8C0: 'OP3ToOP2',
  0x07F8D8: 'OP5ToOP2',
  0x07F8FA: 'OP1ToOP2',
  0x07F904: 'OP6ToOP2',
  0x07F95E: 'OP1ToOP3',
  0x07F914: 'OP4ToOP1',
  0x07F954: 'OP1ToOP6',
  0x07C747: 'compound_OP1toOP2',
  0x07C74F: 'InvSub',
  0x07C77F: 'FPAdd',
  0x07C771: 'FPSub',
  0x07CA48: 'Normalize',
  0x07CAB9: 'FPDiv',
  0x07FAB4: 'FDiv100',
  0x07FCF8: 'OP1ExOP6',
  0x082961: 'PushRealO1',
  0x0AF8C4: 'SetxxxxOP2',
  0x068D20: 'gcd_helper',
  0x068ECF: 'gcd_LoadType',
  0x080188: 'JmpThru',
  0x0685DF: '_Intgr',
  0x07FFC8: 'unknown_07FFC8',
  0x07F8FC: 'OP1ToOP2_alt',
};

// Post-body disassembly range
const DISASM_START = 0x068DA3;
const DISASM_END = 0x068DE3; // extend past 0x068DDB to capture the POP AF + CALL Z

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

function targetName(addr) {
  return KNOWN_TARGETS[addr] || `unknown_${hex(addr)}`;
}

// --- Static disassembler for the post-body region ---

function disassembleRange(rom, start, end) {
  const instructions = [];
  let pc = start;

  while (pc <= end) {
    const opcode = rom[pc] & 0xff;
    let mnemonic = '';
    let bytes = [opcode];
    let length = 1;

    // Decode based on opcode
    if (opcode === 0xCD) {
      // CALL nn (4 bytes in ADL mode: CD + 3-byte LE address)
      const lo = rom[pc + 1] & 0xff;
      const mi = rom[pc + 2] & 0xff;
      const hi = rom[pc + 3] & 0xff;
      const target = (lo | (mi << 8) | (hi << 16)) >>> 0;
      bytes = [opcode, lo, mi, hi];
      length = 4;
      mnemonic = `CALL ${hex(target)}  ; ${targetName(target)}`;
    } else if (opcode === 0xCC) {
      // CALL Z,nn (4 bytes in ADL mode)
      const lo = rom[pc + 1] & 0xff;
      const mi = rom[pc + 2] & 0xff;
      const hi = rom[pc + 3] & 0xff;
      const target = (lo | (mi << 8) | (hi << 16)) >>> 0;
      bytes = [opcode, lo, mi, hi];
      length = 4;
      mnemonic = `CALL Z,${hex(target)}  ; ${targetName(target)}`;
    } else if (opcode === 0xC4) {
      // CALL NZ,nn
      const lo = rom[pc + 1] & 0xff;
      const mi = rom[pc + 2] & 0xff;
      const hi = rom[pc + 3] & 0xff;
      const target = (lo | (mi << 8) | (hi << 16)) >>> 0;
      bytes = [opcode, lo, mi, hi];
      length = 4;
      mnemonic = `CALL NZ,${hex(target)}  ; ${targetName(target)}`;
    } else if (opcode === 0xC3) {
      // JP nn (4 bytes)
      const lo = rom[pc + 1] & 0xff;
      const mi = rom[pc + 2] & 0xff;
      const hi = rom[pc + 3] & 0xff;
      const target = (lo | (mi << 8) | (hi << 16)) >>> 0;
      bytes = [opcode, lo, mi, hi];
      length = 4;
      mnemonic = `JP ${hex(target)}  ; ${targetName(target)}`;
    } else if (opcode === 0xCA) {
      // JP Z,nn
      const lo = rom[pc + 1] & 0xff;
      const mi = rom[pc + 2] & 0xff;
      const hi = rom[pc + 3] & 0xff;
      const target = (lo | (mi << 8) | (hi << 16)) >>> 0;
      bytes = [opcode, lo, mi, hi];
      length = 4;
      mnemonic = `JP Z,${hex(target)}  ; ${targetName(target)}`;
    } else if (opcode === 0xD2) {
      // JP NC,nn
      const lo = rom[pc + 1] & 0xff;
      const mi = rom[pc + 2] & 0xff;
      const hi = rom[pc + 3] & 0xff;
      const target = (lo | (mi << 8) | (hi << 16)) >>> 0;
      bytes = [opcode, lo, mi, hi];
      length = 4;
      mnemonic = `JP NC,${hex(target)}  ; ${targetName(target)}`;
    } else if (opcode === 0xDA) {
      // JP C,nn
      const lo = rom[pc + 1] & 0xff;
      const mi = rom[pc + 2] & 0xff;
      const hi = rom[pc + 3] & 0xff;
      const target = (lo | (mi << 8) | (hi << 16)) >>> 0;
      bytes = [opcode, lo, mi, hi];
      length = 4;
      mnemonic = `JP C,${hex(target)}  ; ${targetName(target)}`;
    } else if (opcode === 0x3E) {
      // LD A,n (2 bytes)
      const imm = rom[pc + 1] & 0xff;
      bytes = [opcode, imm];
      length = 2;
      mnemonic = `LD A,0x${hexByte(imm)}`;
    } else if (opcode === 0x21) {
      // LD HL,nn (4 bytes in ADL mode)
      const lo = rom[pc + 1] & 0xff;
      const mi = rom[pc + 2] & 0xff;
      const hi = rom[pc + 3] & 0xff;
      const imm = (lo | (mi << 8) | (hi << 16)) >>> 0;
      bytes = [opcode, lo, mi, hi];
      length = 4;
      mnemonic = `LD HL,0x${imm.toString(16).toUpperCase().padStart(6, '0')}  ; ${imm} decimal`;
    } else if (opcode === 0x18) {
      // JR offset (2 bytes)
      const offset = rom[pc + 1];
      const signedOff = offset > 127 ? offset - 256 : offset;
      const target = pc + 2 + signedOff;
      bytes = [opcode, offset & 0xff];
      length = 2;
      mnemonic = `JR ${hex(target)}  ; offset=${signedOff}`;
    } else if (opcode === 0x20) {
      // JR NZ,offset
      const offset = rom[pc + 1];
      const signedOff = offset > 127 ? offset - 256 : offset;
      const target = pc + 2 + signedOff;
      bytes = [opcode, offset & 0xff];
      length = 2;
      mnemonic = `JR NZ,${hex(target)}  ; offset=${signedOff}`;
    } else if (opcode === 0x28) {
      // JR Z,offset
      const offset = rom[pc + 1];
      const signedOff = offset > 127 ? offset - 256 : offset;
      const target = pc + 2 + signedOff;
      bytes = [opcode, offset & 0xff];
      length = 2;
      mnemonic = `JR Z,${hex(target)}  ; offset=${signedOff}`;
    } else if (opcode === 0x30) {
      // JR NC,offset
      const offset = rom[pc + 1];
      const signedOff = offset > 127 ? offset - 256 : offset;
      const target = pc + 2 + signedOff;
      bytes = [opcode, offset & 0xff];
      length = 2;
      mnemonic = `JR NC,${hex(target)}  ; offset=${signedOff}`;
    } else if (opcode === 0x38) {
      // JR C,offset
      const offset = rom[pc + 1];
      const signedOff = offset > 127 ? offset - 256 : offset;
      const target = pc + 2 + signedOff;
      bytes = [opcode, offset & 0xff];
      length = 2;
      mnemonic = `JR C,${hex(target)}  ; offset=${signedOff}`;
    } else if (opcode === 0xF1) {
      // POP AF
      mnemonic = 'POP AF';
      length = 1;
    } else if (opcode === 0xF5) {
      // PUSH AF
      mnemonic = 'PUSH AF';
      length = 1;
    } else if (opcode === 0xC9) {
      // RET
      mnemonic = 'RET';
      length = 1;
    } else if (opcode === 0xC8) {
      // RET Z
      mnemonic = 'RET Z';
      length = 1;
    } else if (opcode === 0xC0) {
      // RET NZ
      mnemonic = 'RET NZ';
      length = 1;
    } else if (opcode === 0x3A) {
      // LD A,(nn) - 4 bytes in ADL
      const lo = rom[pc + 1] & 0xff;
      const mi = rom[pc + 2] & 0xff;
      const hi = rom[pc + 3] & 0xff;
      const addr = (lo | (mi << 8) | (hi << 16)) >>> 0;
      bytes = [opcode, lo, mi, hi];
      length = 4;
      mnemonic = `LD A,(${hex(addr)})`;
    } else if (opcode === 0xCB) {
      // CB prefix (BIT/RES/SET etc.)
      const cb = rom[pc + 1] & 0xff;
      bytes = [opcode, cb];
      length = 2;
      if ((cb & 0xc0) === 0x40) {
        // BIT b,r
        const bit = (cb >> 3) & 0x07;
        const reg = cb & 0x07;
        const regNames = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
        mnemonic = `BIT ${bit},${regNames[reg]}`;
      } else if ((cb & 0xc0) === 0xc0) {
        const bit = (cb >> 3) & 0x07;
        const reg = cb & 0x07;
        const regNames = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
        mnemonic = `SET ${bit},${regNames[reg]}`;
      } else if ((cb & 0xc0) === 0x80) {
        const bit = (cb >> 3) & 0x07;
        const reg = cb & 0x07;
        const regNames = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
        mnemonic = `RES ${bit},${regNames[reg]}`;
      } else {
        mnemonic = `CB prefix: ${hexByte(cb)}`;
      }
    } else {
      // Generic: just show the byte
      mnemonic = `DB 0x${hexByte(opcode)}  ; unknown opcode`;
    }

    instructions.push({
      addr: pc,
      bytes: bytes.slice(),
      length,
      mnemonic,
    });

    pc += length;
  }

  return instructions;
}

// --- Runtime setup (from phase 167) ---

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
  console.log('=== Phase 168: Post-Body Instruction-Level Disassembly & OP Trace ===');
  console.log('');

  // ========================================================================
  // PART 1: Static disassembly
  // ========================================================================

  console.log('='.repeat(80));
  console.log('PART 1: STATIC DISASSEMBLY 0x068DA3 - 0x068DE3');
  console.log('='.repeat(80));
  console.log('');

  const instructions = disassembleRange(romBytes, DISASM_START, DISASM_END);

  for (const inst of instructions) {
    const addrStr = hex(inst.addr);
    const bytesStr = inst.bytes.map(b => hexByte(b)).join(' ').padEnd(14);
    console.log(`  ${addrStr}:  ${bytesStr}  ${inst.mnemonic}`);
  }
  console.log('');

  // ========================================================================
  // PART 2: Dynamic trace through gcd(12,8)
  // ========================================================================

  console.log('='.repeat(80));
  console.log('PART 2: DYNAMIC TRACE — gcd(12,8) OP1/OP2 at each CALL in post-body');
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

  // Set up gcd(12,8)
  const op1Bytes = Uint8Array.from([0x00, 0x81, 0x12, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]); // 12.0
  const op2Bytes = Uint8Array.from([0x00, 0x80, 0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]); // 8.0

  prepareCallState(cpu, mem);
  seedGcdFpState(mem, op1Bytes, op2Bytes);

  // Push OP2 to FPS before gcd entry (same as phase 167)
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

  // Track all blocks in the post-body range
  const POST_BODY_START = 0x068DA3;
  const POST_BODY_END = 0x068DE4;

  // Addresses of CALLs in the post-body range (extracted from static disasm)
  const POST_BODY_CALLS = [];
  for (const inst of instructions) {
    if (inst.mnemonic.startsWith('CALL ')) {
      POST_BODY_CALLS.push(inst.addr);
    }
  }

  const traceLog = [];
  let stepCount = 0;
  let outcome = 'budget';
  let lastPC = 0;

  // Track which PCs are CALL sites in post-body
  const callSiteSet = new Set(POST_BODY_CALLS);

  // All blocks visited in the post-body region
  const postBodyBlocks = [];

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

        // Log all blocks in the post-body region
        if (norm >= POST_BODY_START && norm < POST_BODY_END) {
          const op1 = readBytes(mem, OP1_ADDR, 9);
          const op2 = readBytes(mem, OP2_ADDR, 9);
          const op3 = readBytes(mem, OP3_ADDR, 9);
          const op4 = readBytes(mem, OP4_ADDR, 9);
          const op5 = readBytes(mem, OP5_ADDR, 9);
          const op6 = readBytes(mem, OP6_ADDR, 9);

          postBodyBlocks.push({
            step: stepCount,
            pc: norm,
            a: cpu.a & 0xff,
            f: cpu.f & 0xff,
            sp: cpu.sp,
            op1Val: decodeBcdRealBytes(op1),
            op2Val: decodeBcdRealBytes(op2),
            op3Val: decodeBcdRealBytes(op3),
            op4Val: decodeBcdRealBytes(op4),
            op5Val: decodeBcdRealBytes(op5),
            op6Val: decodeBcdRealBytes(op6),
            op1Bytes: formatBytes(op1),
            op2Bytes: formatBytes(op2),
            isCallSite: callSiteSet.has(norm),
          });
        }

        // Also log CALL targets when entered from post-body
        // (detect by checking if the previous post-body block was a CALL site)
        if (postBodyBlocks.length > 0) {
          const last = postBodyBlocks[postBodyBlocks.length - 1];
          if (last.isCallSite && last.step === stepCount - 1 && norm !== last.pc) {
            // We just called from a post-body CALL site to this target
            traceLog.push({
              callSite: last.pc,
              target: norm,
              targetName: targetName(norm),
              step: stepCount,
              op1: decodeBcdRealBytes(readBytes(mem, OP1_ADDR, 9)),
              op2: decodeBcdRealBytes(readBytes(mem, OP2_ADDR, 9)),
              op1Bytes: formatBytes(readBytes(mem, OP1_ADDR, 9)),
              op2Bytes: formatBytes(readBytes(mem, OP2_ADDR, 9)),
            });
          }
        }
      },

      onMissingBlock(pc, mode, step) {
        const norm = pc & 0xffffff;
        stepCount = step + 1;
        lastPC = norm;
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

  const finalOP1 = readBytes(mem, OP1_ADDR, 9);
  const finalOP2 = readBytes(mem, OP2_ADDR, 9);
  const errNo = mem[ERR_NO_ADDR] & 0xff;

  // ==========================================================================
  // Reports
  // ==========================================================================

  console.log(`Outcome: ${outcome}`);
  console.log(`Steps: ${stepCount}`);
  console.log(`Last PC: ${hex(lastPC)}`);
  console.log(`errNo: ${hexByte(errNo)} (${errName(errNo)})`);
  console.log(`Final OP1: [${formatBytes(finalOP1)}] = ${decodeBcdRealBytes(finalOP1)}`);
  console.log(`Final OP2: [${formatBytes(finalOP2)}] = ${decodeBcdRealBytes(finalOP2)}`);
  console.log('');

  // --- Post-body blocks with OP register snapshots ---
  console.log('='.repeat(80));
  console.log('POST-BODY BLOCK ENTRIES (OP1/OP2 at each block in 0x068DA3-0x068DE3)');
  console.log('='.repeat(80));
  console.log('');

  for (const blk of postBodyBlocks) {
    const marker = blk.isCallSite ? ' ** CALL **' : '';
    console.log(`  step=${String(blk.step).padStart(4)}  PC=${hex(blk.pc)}  A=${hexByte(blk.a)}  F=${hexByte(blk.f)} [${flagsString(blk.f)}]  SP=${hex(blk.sp)}${marker}`);
    console.log(`         OP1=${blk.op1Val.padEnd(16)} OP2=${blk.op2Val.padEnd(16)} OP3=${blk.op3Val.padEnd(16)}`);
    console.log(`         OP4=${blk.op4Val.padEnd(16)} OP5=${blk.op5Val.padEnd(16)} OP6=${blk.op6Val.padEnd(16)}`);
    console.log(`         OP1 raw=[${blk.op1Bytes}]`);
    console.log(`         OP2 raw=[${blk.op2Bytes}]`);
    console.log('');
  }

  // --- CALL trace with OP1/OP2 ---
  console.log('='.repeat(80));
  console.log('CALL TARGET ENTRIES (OP1/OP2 when each CALL target is entered)');
  console.log('='.repeat(80));
  console.log('');

  for (const t of traceLog) {
    console.log(`  From ${hex(t.callSite)} -> ${hex(t.target)} (${t.targetName})`);
    console.log(`    step=${t.step}  OP1=${t.op1}  OP2=${t.op2}`);
    console.log(`    OP1 raw=[${t.op1Bytes}]`);
    console.log(`    OP2 raw=[${t.op2Bytes}]`);
    console.log('');
  }

  // --- Summary: instruction sequence with what each computes ---
  console.log('='.repeat(80));
  console.log('SUMMARY: POST-BODY INSTRUCTION SEQUENCE');
  console.log('='.repeat(80));
  console.log('');
  console.log('This is the path taken after the inner loop result is zero (JR NZ falls through at 0x068DA1).');
  console.log('It computes the final gcd result from the accumulated OP registers.');
  console.log('');

  for (const inst of instructions) {
    const addrStr = hex(inst.addr);
    const bytesStr = inst.bytes.map(b => hexByte(b)).join(' ').padEnd(14);
    // Find the OP snapshot at this address
    const snapshot = postBodyBlocks.find(b => b.pc === inst.addr);
    if (snapshot) {
      console.log(`  ${addrStr}:  ${bytesStr}  ${inst.mnemonic}`);
      console.log(`           -> OP1=${snapshot.op1Val}, OP2=${snapshot.op2Val}, OP4=${snapshot.op4Val}, OP6=${snapshot.op6Val}`);
    } else {
      console.log(`  ${addrStr}:  ${bytesStr}  ${inst.mnemonic}`);
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
