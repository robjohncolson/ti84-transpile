#!/usr/bin/env node

/**
 * Phase 163 - Disassemble + trace the gcd loop top region 0x068D5D-0x068D81
 *
 * The Euclidean gcd loop jumps back to 0x068D5D (JR NZ at 0x068DA1).
 * This probe answers: what does the region 0x068D5D-0x068D81 do before
 * falling into the algorithm body at 0x068D82?
 *
 * Part A: Static disassembly of all 37 bytes (0x068D5D-0x068D81)
 * Part B: Dynamic trace — log every block hit in that range during gcd(12,8)
 * Part C: Summary analysis
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { decodeInstruction } from './ez80-decoder.js';

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
const BCD_8  = Uint8Array.from([0x00, 0x80, 0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

// Disassembly range
const DISASM_START = 0x068D5D;
const DISASM_END   = 0x068D82; // exclusive — 37 bytes from 0x068D5D to 0x068D81 inclusive

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

// --- Known CALL/JP targets ---

const CALL_LABELS = new Map([
  [0x07F95E, 'Mov9_OP1toOP3'],
  [0x07F8B6, 'Mov9_OP4toOP2'],
  [0x07F8C0, 'Mov9_OP3toOP2'],
  [0x07F8CC, 'Mov9_OP1toOP3'],
  [0x07F8D8, 'Mov9_OP5toOP2'],
  [0x07F8E4, 'Mov9_OP5toOP6'],
  [0x07F8F0, 'Mov9_OP5toOP4'],
  [0x07F8FA, 'Mov9_OP1toOP2'],
  [0x07F904, 'Mov9_OP6toOP2'],
  [0x07F914, 'Mov9_OP4toOP1'],
  [0x07F954, 'Mov9_OP1toOP6'],
  [0x07F8A2, 'Mov9_OP1toOP4'],
  [0x07C747, 'OP1toOP2_with_norm'],
  [0x07C755, 'OP1toOP2_no_norm'],
  [0x07CAB9, 'FPDiv_impl'],
  [0x07CA48, 'Normalize'],
  [0x080188, 'JmpThru'],
  [0x07CC36, 'FPAddSub_core'],
  [0x07F7BD, 'InvOP1S_impl'],
  [0x07CA06, 'InvOP1S'],
  [0x07FD4A, 'ValidityCheck_OP1'],
  [0x07FD69, 'ExponentCheck'],
]);

// Known address labels
const ADDR_LABELS = new Map([
  [0x068D3D, 'gcd_entry'],
  [0x068D5D, 'gcd_loop_top'],
  [0x068D61, 'gcd_call_OP1toOP2'],
  [0x068D82, 'gcd_algo_body'],
  [0x068D8D, 'gcd_OP1toOP3'],
  [0x068D91, 'gcd_OP1toOP5'],
  [0x068D95, 'gcd_after_OP1toOP5'],
  [0x068DA1, 'gcd_error_check'],
  [0x068DEA, 'gcd_JP_NC_ErrDomain'],
]);

function targetLabel(addr) {
  const cl = CALL_LABELS.get(addr);
  if (cl) return cl;
  const al = ADDR_LABELS.get(addr);
  if (al) return al;
  return null;
}

function addrLabel(addr) {
  const label = ADDR_LABELS.get(addr);
  return label ? ` [${label}]` : '';
}

// --- Instruction formatter ---

function formatInstruction(instr) {
  const prefix = instr.modePrefix ? `.${instr.modePrefix} ` : '';
  const tag = instr.tag;

  if (tag === 'call')             return `${prefix}call ${hex(instr.target)}`;
  if (tag === 'call-conditional') return `${prefix}call ${instr.condition}, ${hex(instr.target)}`;
  if (tag === 'jp')               return `${prefix}jp ${hex(instr.target)}`;
  if (tag === 'jp-conditional')   return `${prefix}jp ${instr.condition}, ${hex(instr.target)}`;
  if (tag === 'jp-indirect')      return `${prefix}jp (${instr.indirectRegister})`;
  if (tag === 'jr')               return `${prefix}jr ${hex(instr.target)}`;
  if (tag === 'jr-conditional')   return `${prefix}jr ${instr.condition}, ${hex(instr.target)}`;
  if (tag === 'ret')              return `${prefix}ret`;
  if (tag === 'ret-conditional')  return `${prefix}ret ${instr.condition}`;
  if (tag === 'ld-reg-mem')       return `${prefix}ld ${instr.dest}, (${hex(instr.addr)})`;
  if (tag === 'ld-mem-reg')       return `${prefix}ld (${hex(instr.addr)}), ${instr.src}`;
  if (tag === 'ld-reg-imm')       return `${prefix}ld ${instr.dest}, ${hexByte(instr.value)}`;
  if (tag === 'ld-reg-reg')       return `${prefix}ld ${instr.dest}, ${instr.src}`;
  if (tag === 'ld-pair-imm')      return `${prefix}ld ${instr.pair}, ${hex(instr.value)}`;
  if (tag === 'ld-reg-ind')       return `${prefix}ld ${instr.dest}, (${instr.src})`;
  if (tag === 'ld-ind-reg')       return `${prefix}ld (${instr.dest}), ${instr.src}`;
  if (tag === 'alu-imm')          return `${prefix}${instr.op} ${hexByte(instr.value)}`;
  if (tag === 'alu-reg')          return `${prefix}${instr.op} ${instr.src}`;
  if (tag === 'push')             return `${prefix}push ${instr.pair}`;
  if (tag === 'pop')              return `${prefix}pop ${instr.pair}`;
  if (tag === 'inc-reg')          return `${prefix}inc ${instr.reg}`;
  if (tag === 'dec-reg')          return `${prefix}dec ${instr.reg}`;
  if (tag === 'inc-pair')         return `${prefix}inc ${instr.pair}`;
  if (tag === 'dec-pair')         return `${prefix}dec ${instr.pair}`;
  if (tag === 'add-pair')         return `${prefix}add ${instr.dest}, ${instr.src}`;
  if (tag === 'ex-de-hl')         return `${prefix}ex de, hl`;
  if (tag === 'ldir')             return `${prefix}ldir`;
  if (tag === 'ldi')              return `${prefix}ldi`;
  if (tag === 'nop')              return `${prefix}nop`;
  if (tag === 'djnz')             return `${prefix}djnz ${hex(instr.target)}`;
  if (tag === 'rst')              return `${prefix}rst ${hex(instr.target)}`;
  if (tag === 'scf')              return `${prefix}scf`;
  if (tag === 'ccf')              return `${prefix}ccf`;
  if (tag === 'cpl')              return `${prefix}cpl`;
  if (tag === 'rla')              return `${prefix}rla`;
  if (tag === 'rra')              return `${prefix}rra`;
  if (tag === 'rlca')             return `${prefix}rlca`;
  if (tag === 'rrca')             return `${prefix}rrca`;
  if (tag === 'halt')             return `${prefix}halt`;
  if (tag === 'di')               return `${prefix}di`;
  if (tag === 'ei')               return `${prefix}ei`;
  if (tag === 'neg')              return `${prefix}neg`;
  if (tag === 'bit')              return `${prefix}bit ${instr.bit}, ${instr.reg}`;
  if (tag === 'set')              return `${prefix}set ${instr.bit}, ${instr.reg}`;
  if (tag === 'res')              return `${prefix}res ${instr.bit}, ${instr.reg}`;
  if (tag === 'sla')              return `${prefix}sla ${instr.reg}`;
  if (tag === 'sra')              return `${prefix}sra ${instr.reg}`;
  if (tag === 'srl')              return `${prefix}srl ${instr.reg}`;
  if (tag === 'rl')               return `${prefix}rl ${instr.reg}`;
  if (tag === 'rr')               return `${prefix}rr ${instr.reg}`;
  if (tag === 'rlc')              return `${prefix}rlc ${instr.reg}`;
  if (tag === 'rrc')              return `${prefix}rrc ${instr.reg}`;
  if (tag === 'ex-sp-hl')        return `${prefix}ex (sp), hl`;
  if (tag === 'exx')              return `${prefix}exx`;
  if (tag === 'ex-af')            return `${prefix}ex af, af'`;
  if (tag === 'daa')              return `${prefix}daa`;
  if (tag === 'reti')             return `${prefix}reti`;
  if (tag === 'retn')             return `${prefix}retn`;
  if (tag === 'cpir')             return `${prefix}cpir`;
  if (tag === 'cpdr')             return `${prefix}cpdr`;
  if (tag === 'lddr')             return `${prefix}lddr`;
  if (tag === 'inir')             return `${prefix}inir`;
  if (tag === 'otir')             return `${prefix}otir`;
  if (tag === 'in')               return `${prefix}in ${instr.dest}, (${instr.port ?? instr.src})`;
  if (tag === 'out')              return `${prefix}out (${instr.port ?? instr.dest}), ${instr.src}`;
  if (tag === 'sbc-pair')         return `${prefix}sbc ${instr.dest}, ${instr.src}`;
  if (tag === 'adc-pair')         return `${prefix}adc ${instr.dest}, ${instr.src}`;
  if (tag === 'ld-mem-pair')      return `${prefix}ld (${hex(instr.addr)}), ${instr.pair}`;
  if (tag === 'ld-pair-mem')      return `${prefix}ld ${instr.pair}, (${hex(instr.addr)})`;

  return `${prefix}${tag}`;
}

// --- Annotation helper ---

function annotate(pc, instr) {
  if (!instr) return '';
  const tag = instr.tag;

  if (tag === 'call' || tag === 'call-conditional') {
    const label = targetLabel(instr.target);
    if (label) return label;
    return `call -> ${hex(instr.target)}`;
  }

  if (tag === 'jp' || tag === 'jp-conditional') {
    const label = targetLabel(instr.target);
    if (label) return label;
    return `jp -> ${hex(instr.target)}`;
  }

  if (tag === 'jr' || tag === 'jr-conditional') {
    const label = targetLabel(instr.target);
    if (label) return `-> ${label}`;
    return `-> ${hex(instr.target)}`;
  }

  // Memory access to FP registers
  if (tag === 'ld-reg-mem' || tag === 'ld-mem-reg' || tag === 'ld-mem-pair' || tag === 'ld-pair-mem') {
    const addr = instr.addr;
    if (addr >= 0xD005F8 && addr <= 0xD00600) return `OP1[${addr - 0xD005F8}]`;
    if (addr >= 0xD00603 && addr <= 0xD0060D) return `OP2[${addr - 0xD00603}]`;
    if (addr >= 0xD0060E && addr <= 0xD00618) return `OP3[${addr - 0xD0060E}]`;
    if (addr >= 0xD00619 && addr <= 0xD00623) return `OP4[${addr - 0xD00619}]`;
    if (addr >= 0xD00624 && addr <= 0xD0062E) return `OP5[${addr - 0xD00624}]`;
    if (addr >= 0xD0062F && addr <= 0xD00639) return `OP6[${addr - 0xD0062F}]`;
  }

  if (tag === 'alu-imm' && instr.op === 'cp') {
    if (instr.value === 0x80) return 'cp 0x80 -- test if exp < 0x80 (biased)';
    if (instr.value === 0x00) return 'cp 0 -- test if zero';
  }

  if (tag === 'alu-imm' && instr.op === 'xor') {
    if (instr.value === 0x80) return 'flip sign bit';
  }

  if (tag === 'alu-reg' && instr.op === 'xor' && instr.src === 'a') return 'A=0';
  if (tag === 'alu-reg' && instr.op === 'or' && instr.src === 'a') return 'test A (set flags)';

  if (tag === 'ret') return 'return';
  if (tag === 'ret-conditional') return `conditional return (${instr.condition})`;

  return '';
}

// --- Disassembly helper ---

function decodeRange(startAddr, endAddr) {
  const entries = [];
  let pc = startAddr;

  while (pc < endAddr) {
    try {
      const instr = decodeInstruction(romBytes, pc, 'adl');
      const length = Math.max(instr.length || 1, 1);
      const bytes = [];
      for (let i = 0; i < length; i++) {
        bytes.push(hexByte(romBytes[pc + i] ?? 0));
      }
      entries.push({
        pc,
        bytes: bytes.join(' '),
        tag: instr.tag,
        text: formatInstruction(instr),
        length,
        instr,
      });
      pc += length;
    } catch (error) {
      entries.push({
        pc,
        bytes: hexByte(romBytes[pc] ?? 0),
        tag: 'error',
        text: `decode-error: ${error?.message ?? error}`,
        length: 1,
        instr: null,
      });
      pc += 1;
    }
  }

  return entries;
}

// --- Runtime setup (same as phase 162 dense probe) ---

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

// ==========================================================================
// Part A: Static disassembly of 0x068D5D-0x068D81
// ==========================================================================

function partA() {
  console.log(`${'='.repeat(80)}`);
  console.log('PART A: Static Disassembly of 0x068D5D-0x068D81 (37 bytes)');
  console.log(`${'='.repeat(80)}`);
  console.log('');

  // Raw bytes dump
  const rawLen = DISASM_END - DISASM_START;
  console.log(`  Raw bytes (${rawLen} bytes):`);
  for (let row = 0; row < rawLen; row += 16) {
    const addr = DISASM_START + row;
    const chunks = [];
    for (let i = 0; i < 16 && (row + i) < rawLen; i++) {
      chunks.push(hexByte(romBytes[addr + i] ?? 0));
    }
    console.log(`    ${hex(addr)}  ${chunks.join(' ')}`);
  }
  console.log('');

  // Full disassembly
  const entries = decodeRange(DISASM_START, DISASM_END);

  console.log('  Instruction-by-instruction disassembly:');
  console.log('');

  for (const entry of entries) {
    const label = addrLabel(entry.pc);
    const note = entry.instr ? annotate(entry.pc, entry.instr) : '';
    const noteStr = note ? `  ; ${note}` : '';

    console.log(`  ${hex(entry.pc)}  ${entry.bytes.padEnd(20)}  ${entry.text}${label}${noteStr}`);
  }

  // CALL/JP target summary
  console.log('');
  console.log('  CALL/JP targets in this range:');

  let hasCallTargets = false;
  for (const entry of entries) {
    if (!entry.instr) continue;
    const tag = entry.instr.tag;
    if (tag === 'call' || tag === 'call-conditional' || tag === 'jp' || tag === 'jp-conditional') {
      const target = entry.instr.target;
      const label = targetLabel(target) || '(unknown)';
      const cond = tag.includes('conditional') ? ` ${entry.instr.condition}` : '';
      console.log(`    from ${hex(entry.pc)}  ${tag}${cond} -> ${hex(target)}  ${label}`);
      hasCallTargets = true;
    }
    if (tag === 'jr' || tag === 'jr-conditional') {
      const target = entry.instr.target;
      const label = targetLabel(target) || '';
      const cond = tag.includes('conditional') ? ` ${entry.instr.condition}` : '';
      const direction = target < entry.pc ? 'BACKWARD' : 'FORWARD';
      console.log(`    from ${hex(entry.pc)}  ${tag}${cond} -> ${hex(target)}  ${direction}  ${label}`);
      hasCallTargets = true;
    }
  }

  if (!hasCallTargets) {
    console.log('    (none)');
  }

  console.log('');
  return entries;
}

// ==========================================================================
// Part B: Dynamic trace of blocks in 0x068D5D-0x068D81 during gcd(12,8)
// ==========================================================================

function partB(runtime) {
  const { mem, executor, cpu } = runtime;

  console.log(`${'='.repeat(80)}`);
  console.log('PART B: Dynamic Trace — blocks hitting 0x068D5D-0x068D81 during gcd(12,8)');
  console.log(`${'='.repeat(80)}`);
  console.log('');

  prepareCallState(cpu, mem);
  seedGcdFpState(mem);

  // Push OP2 (8.0) to FPS before gcd entry
  const fpsPtr = read24(mem, FPS_ADDR);
  const op2Bytes = readBytes(mem, OP2_ADDR, 9);
  for (let i = 0; i < 9; i++) {
    mem[fpsPtr + i] = op2Bytes[i];
  }
  write24(mem, FPS_ADDR, fpsPtr + 9);

  seedErrFrame(cpu, mem, FAKE_RET, ERR_CATCH_ADDR, 0);

  console.log(`  Entry: gcd at ${hex(GCD_ENTRY)}`);
  console.log(`  OP1: [${formatBytes(readBytes(mem, OP1_ADDR, 9))}] = ${decodeBcdRealBytes(readBytes(mem, OP1_ADDR, 9))}`);
  console.log(`  OP2: [${formatBytes(readBytes(mem, OP2_ADDR, 9))}] = ${decodeBcdRealBytes(readBytes(mem, OP2_ADDR, 9))}`);
  console.log(`  OP4: [${formatBytes(readBytes(mem, OP4_ADDR, 9))}] = ${decodeBcdRealBytes(readBytes(mem, OP4_ADDR, 9))}`);
  console.log(`  OP5: [${formatBytes(readBytes(mem, OP5_ADDR, 9))}] = ${decodeBcdRealBytes(readBytes(mem, OP5_ADDR, 9))}`);
  console.log('');

  let stepCount = 0;
  let outcome = 'budget';
  const loopTopHits = [];

  try {
    executor.runFrom(GCD_ENTRY, 'adl', {
      maxSteps: MAX_STEPS,
      maxLoopIterations: MAX_LOOP_ITER,

      onBlock(pc, mode, meta, step) {
        const norm = pc & 0xffffff;
        stepCount = noteStep(stepCount, step);

        // Log every block in the loop-top range
        if (norm >= DISASM_START && norm < DISASM_END) {
          const op1 = readBytes(mem, OP1_ADDR, 9);
          const op2 = readBytes(mem, OP2_ADDR, 9);
          const op4 = readBytes(mem, OP4_ADDR, 9);
          const op5 = readBytes(mem, OP5_ADDR, 9);

          const hit = {
            step: stepCount,
            pc: norm,
            op1,
            op2,
            op4,
            op5,
          };
          loopTopHits.push(hit);

          console.log(
            `  Step ${String(stepCount).padStart(4)}: PC=${hex(norm)}${addrLabel(norm)}`
          );
          console.log(
            `    OP1=[${formatBytes(op1)}] = ${decodeBcdRealBytes(op1)}`
          );
          console.log(
            `    OP2=[${formatBytes(op2)}] = ${decodeBcdRealBytes(op2)}`
          );
          console.log(
            `    OP4=[${formatBytes(op4)}] = ${decodeBcdRealBytes(op4)}`
          );
          console.log(
            `    OP5=[${formatBytes(op5)}] = ${decodeBcdRealBytes(op5)}`
          );
        }

        if (norm === FAKE_RET) throw new Error('__RET__');
        if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');
      },

      onMissingBlock(pc, mode, step) {
        const norm = pc & 0xffffff;
        stepCount = noteStep(stepCount, step);

        if (norm >= DISASM_START && norm < DISASM_END) {
          const op1 = readBytes(mem, OP1_ADDR, 9);
          const op2 = readBytes(mem, OP2_ADDR, 9);
          const op4 = readBytes(mem, OP4_ADDR, 9);
          const op5 = readBytes(mem, OP5_ADDR, 9);

          const hit = {
            step: stepCount,
            pc: norm,
            op1,
            op2,
            op4,
            op5,
            missing: true,
          };
          loopTopHits.push(hit);

          console.log(
            `  Step ${String(stepCount).padStart(4)}: PC=${hex(norm)} [MISSING]${addrLabel(norm)}`
          );
          console.log(
            `    OP1=[${formatBytes(op1)}] = ${decodeBcdRealBytes(op1)}`
          );
          console.log(
            `    OP2=[${formatBytes(op2)}] = ${decodeBcdRealBytes(op2)}`
          );
          console.log(
            `    OP4=[${formatBytes(op4)}] = ${decodeBcdRealBytes(op4)}`
          );
          console.log(
            `    OP5=[${formatBytes(op5)}] = ${decodeBcdRealBytes(op5)}`
          );
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
      console.log(`  Thrown: ${(err?.stack || String(err)).split('\n')[0]}`);
    }
  }

  console.log('');
  console.log(`  Outcome: ${outcome}`);
  console.log(`  Total steps: ${stepCount}`);
  console.log(`  Loop-top hits (0x068D5D-0x068D81): ${loopTopHits.length}`);
  console.log(`  errNo: ${hexByte(mem[ERR_NO_ADDR] & 0xff)} (${errName(mem[ERR_NO_ADDR] & 0xff)})`);
  console.log('');

  // Final register state
  console.log('  Final register state:');
  console.log(`    OP1: [${formatBytes(readBytes(mem, OP1_ADDR, 9))}] = ${decodeBcdRealBytes(readBytes(mem, OP1_ADDR, 9))}`);
  console.log(`    OP2: [${formatBytes(readBytes(mem, OP2_ADDR, 9))}] = ${decodeBcdRealBytes(readBytes(mem, OP2_ADDR, 9))}`);
  console.log(`    OP4: [${formatBytes(readBytes(mem, OP4_ADDR, 9))}] = ${decodeBcdRealBytes(readBytes(mem, OP4_ADDR, 9))}`);
  console.log(`    OP5: [${formatBytes(readBytes(mem, OP5_ADDR, 9))}] = ${decodeBcdRealBytes(readBytes(mem, OP5_ADDR, 9))}`);
  console.log('');

  return loopTopHits;
}

// ==========================================================================
// Part C: Summary
// ==========================================================================

function partC(disasmEntries, loopTopHits) {
  console.log(`${'='.repeat(80)}`);
  console.log('PART C: Summary — What does 0x068D5D-0x068D81 do?');
  console.log(`${'='.repeat(80)}`);
  console.log('');

  // Check if any CALL targets are OP register copy functions
  const opCopyTargets = [
    0x07F8B6, 0x07F8C0, 0x07F8CC, 0x07F8D8, 0x07F8E4,
    0x07F8F0, 0x07F8FA, 0x07F904, 0x07F914, 0x07F954,
    0x07F95E, 0x07F8A2,
  ];

  let hasOpCopyCalls = false;
  let hasOp5toOp2 = false;

  for (const entry of disasmEntries) {
    if (!entry.instr) continue;
    const tag = entry.instr.tag;
    if (tag === 'call' || tag === 'call-conditional') {
      const target = entry.instr.target;
      if (opCopyTargets.includes(target)) {
        hasOpCopyCalls = true;
        if (target === 0x07F8D8) hasOp5toOp2 = true;
        console.log(`  FOUND OP register copy CALL at ${hex(entry.pc)}: ${targetLabel(target)}`);
      }
    }
  }

  if (!hasOpCopyCalls) {
    console.log('  NO OP register copy CALLs found in 0x068D5D-0x068D81');
  }

  console.log('');

  // Analyze dynamic hits
  if (loopTopHits.length === 0) {
    console.log('  No blocks in 0x068D5D-0x068D81 were hit during gcd(12,8).');
    console.log('  This region may be skipped entirely (jumped over by init path).');
  } else {
    console.log(`  ${loopTopHits.length} block(s) hit in 0x068D5D-0x068D81 during gcd(12,8):`);
    console.log('');

    // Group by PC
    const byPC = new Map();
    for (const hit of loopTopHits) {
      if (!byPC.has(hit.pc)) byPC.set(hit.pc, []);
      byPC.get(hit.pc).push(hit);
    }

    for (const [pc, hits] of [...byPC.entries()].sort((a, b) => a[0] - b[0])) {
      console.log(`    ${hex(pc)}${addrLabel(pc)}  hit ${hits.length} time(s) at steps: ${hits.map(h => h.step).join(', ')}`);
    }

    console.log('');

    // Check if OP2 changes between loop-top hits
    if (loopTopHits.length >= 2) {
      console.log('  OP2 state at each loop-top hit:');
      for (const hit of loopTopHits) {
        console.log(`    Step ${hit.step}, PC=${hex(hit.pc)}: OP2=[${formatBytes(hit.op2)}] = ${decodeBcdRealBytes(hit.op2)}`);
      }
    }
  }

  console.log('');

  // Final answer
  console.log('  CONCLUSION:');
  if (hasOp5toOp2) {
    console.log('  YES — 0x068D5D-0x068D81 calls Mov9_OP5toOP2, restoring OP2 from the OP5 backup.');
  } else if (hasOpCopyCalls) {
    console.log('  The region calls OP register copy functions (see above), but NOT OP5->OP2 specifically.');
  } else {
    console.log('  The region does NOT call any OP register copy functions.');
    console.log('  It likely performs validation/flag checks before falling into the algorithm body.');
    console.log('  OP2 restoration (if any) must happen elsewhere in the loop.');
  }

  console.log('');
}

// ==========================================================================
// Main
// ==========================================================================

function main() {
  console.log('=== Phase 163: GCD Loop Top Disassembly (0x068D5D-0x068D81) ===');
  console.log('');

  // Part A: static disassembly (no runtime needed)
  const disasmEntries = partA();

  // Part B: dynamic trace (needs full runtime)
  const runtime = createPreparedRuntime();

  if (!runtime.memInitOk) {
    console.log('MEM_INIT failed; aborting.');
    process.exitCode = 1;
    return;
  }

  console.log('Cold boot + MEM_INIT complete.');
  console.log('');

  const loopTopHits = partB(runtime);

  // Part C: summary
  partC(disasmEntries, loopTopHits);

  console.log('Done.');
  process.exitCode = 0;
}

try {
  main();
} catch (err) {
  console.error(err?.stack || String(err));
  process.exitCode = 1;
}
