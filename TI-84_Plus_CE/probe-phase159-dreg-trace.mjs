#!/usr/bin/env node

/**
 * Phase 159 - Trace D register setup in normalization for FPDiv.
 *
 * Part A: Static disassembly of FPDiv entry (0x07CAB9-0x07CB20)
 * Part B: D register value at FPDiv entry through normal normalization flow
 * Part C: D register value when bypassing normalization (direct FPDiv entry)
 * Part D: D register injection test — does fixing D alone fix FPDiv?
 * Part E: Verify NEG arithmetic on OP2 exponent byte
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

const FPSBASE_ADDR = 0xd0258a;
const FPS_ADDR = 0xd0258d;
const OPBASE_ADDR = 0xd02590;
const OPS_ADDR = 0xd02593;
const PTEMPCNT_ADDR = 0xd02596;
const PTEMP_ADDR = 0xd0259a;
const PROGPTR_ADDR = 0xd0259d;
const NEWDATA_PTR_ADDR = 0xd025a0;

const FP_CATEGORY_ADDR = 0xd0060e;

const NORM_ENTRY = 0x07ca48;
const EXPONENT_COMB_ADDR = 0x07ca73;
const FPDIV_ENTRY = 0x07cab9;

const FAKE_RET = 0x7ffffe;
const ERR_CATCH_ADDR = 0x7ffffa;

const MEMINIT_BUDGET = 100000;
const MAX_LOOP_ITER = 8192;
const MAX_STEPS = 300;

const FPS_CLEAN_AREA = 0xd1aa00;

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

function formatInstructionSimple(instr) {
  const prefix = instr.modePrefix ? `.${instr.modePrefix} ` : '';
  const tag = instr.tag;

  if (tag === 'call') return `${prefix}call ${hex(instr.target)}`;
  if (tag === 'call-conditional') return `${prefix}call ${instr.condition}, ${hex(instr.target)}`;
  if (tag === 'jp') return `${prefix}jp ${hex(instr.target)}`;
  if (tag === 'jp-conditional') return `${prefix}jp ${instr.condition}, ${hex(instr.target)}`;
  if (tag === 'jp-indirect') return `${prefix}jp (${instr.indirectRegister})`;
  if (tag === 'jr') return `${prefix}jr ${hex(instr.target)}`;
  if (tag === 'jr-conditional') return `${prefix}jr ${instr.condition}, ${hex(instr.target)}`;
  if (tag === 'ret') return `${prefix}ret`;
  if (tag === 'ret-conditional') return `${prefix}ret ${instr.condition}`;
  if (tag === 'ld-reg-mem') return `${prefix}ld ${instr.dest}, (${hex(instr.addr)})`;
  if (tag === 'ld-mem-reg') return `${prefix}ld (${hex(instr.addr)}), ${instr.src}`;
  if (tag === 'ld-reg-imm') return `${prefix}ld ${instr.dest}, ${hexByte(instr.value)}`;
  if (tag === 'ld-reg-reg') return `${prefix}ld ${instr.dest}, ${instr.src}`;
  if (tag === 'ld-pair-imm') return `${prefix}ld ${instr.pair}, ${hex(instr.value)}`;
  if (tag === 'ld-reg-ind') return `${prefix}ld ${instr.dest}, (${instr.src})`;
  if (tag === 'ld-ind-reg') return `${prefix}ld (${instr.dest}), ${instr.src}`;
  if (tag === 'alu-imm') return `${prefix}${instr.op} ${hexByte(instr.value)}`;
  if (tag === 'alu-reg') return `${prefix}${instr.op} ${instr.src}`;
  if (tag === 'push') return `${prefix}push ${instr.pair}`;
  if (tag === 'pop') return `${prefix}pop ${instr.pair}`;
  if (tag === 'inc-reg') return `${prefix}inc ${instr.reg}`;
  if (tag === 'dec-reg') return `${prefix}dec ${instr.reg}`;
  if (tag === 'inc-pair') return `${prefix}inc ${instr.pair}`;
  if (tag === 'dec-pair') return `${prefix}dec ${instr.pair}`;
  if (tag === 'add-pair') return `${prefix}add ${instr.dest}, ${instr.src}`;
  if (tag === 'ex-de-hl') return `${prefix}ex de, hl`;
  if (tag === 'ldir') return `${prefix}ldir`;
  if (tag === 'ldi') return `${prefix}ldi`;
  if (tag === 'nop') return `${prefix}nop`;
  if (tag === 'xor-a' || (tag === 'alu-reg' && instr.op === 'xor' && instr.src === 'a')) return `${prefix}xor a`;
  if (tag === 'djnz') return `${prefix}djnz ${hex(instr.target)}`;
  if (tag === 'rst') return `${prefix}rst ${hex(instr.target)}`;
  if (tag === 'scf') return `${prefix}scf`;
  if (tag === 'ccf') return `${prefix}ccf`;
  if (tag === 'cpl') return `${prefix}cpl`;
  if (tag === 'rla') return `${prefix}rla`;
  if (tag === 'rra') return `${prefix}rra`;
  if (tag === 'rlca') return `${prefix}rlca`;
  if (tag === 'rrca') return `${prefix}rrca`;
  if (tag === 'halt') return `${prefix}halt`;
  if (tag === 'di') return `${prefix}di`;
  if (tag === 'ei') return `${prefix}ei`;
  if (tag === 'neg') return `${prefix}neg`;
  if (tag === 'bit') return `${prefix}bit ${instr.bit}, ${instr.reg}`;
  if (tag === 'srl') return `${prefix}srl ${instr.reg}`;
  if (tag === 'sla') return `${prefix}sla ${instr.reg}`;
  if (tag === 'rr') return `${prefix}rr ${instr.reg}`;
  if (tag === 'rl') return `${prefix}rl ${instr.reg}`;
  if (tag === 'sbc-pair') return `${prefix}sbc ${instr.dest}, ${instr.src}`;
  if (tag === 'adc-pair') return `${prefix}adc ${instr.dest}, ${instr.src}`;
  if (tag === 'rld') return `${prefix}rld`;
  if (tag === 'rrd') return `${prefix}rrd`;
  if (tag === 'daa') return `${prefix}daa`;
  if (tag === 'cpir') return `${prefix}cpir`;
  if (tag === 'cpdr') return `${prefix}cpdr`;
  if (tag === 'lddr') return `${prefix}lddr`;
  if (tag === 'or-a') return `${prefix}or a`;
  if (tag === 'and-a') return `${prefix}and a`;
  if (tag === 'cp-reg') return `${prefix}cp ${instr.src}`;
  if (tag === 'cp-imm') return `${prefix}cp ${hexByte(instr.value)}`;

  return `${prefix}${tag}`;
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

// BCD 1200: type=0x00, exp=0x83, mantissa=[12 00 00 00 00 00 00]
const BCD_1200 = Uint8Array.from([0x00, 0x83, 0x12, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

function seedTestState(cpu, mem) {
  prepareCallState(cpu, mem);
  seedAllocator(mem);
  mem.fill(0x00, FPS_CLEAN_AREA, FPS_CLEAN_AREA + 0x40);
  write24(mem, FPSBASE_ADDR, FPS_CLEAN_AREA);
  write24(mem, FPS_ADDR, FPS_CLEAN_AREA);
  mem[FP_CATEGORY_ADDR] = 0x00;

  // Seed OP1 = 1200, OP2 = 1200
  mem.fill(0x00, OP1_ADDR, OP1_ADDR + 11);
  mem.set(BCD_1200, OP1_ADDR);
  mem.fill(0x00, OP2_ADDR, OP2_ADDR + 11);
  mem.set(BCD_1200, OP2_ADDR);
}

// ==========================================================================
// Part A: Static disassembly of FPDiv entry
// ==========================================================================

function partA() {
  console.log('='.repeat(70));
  console.log('PART A: Static disassembly of FPDiv entry (0x07CAB9 - 0x07CB20)');
  console.log('='.repeat(70));
  console.log('');

  // D-register related operands to flag
  const D_REG_PATTERNS = /\b(d|de)\b/i;

  let pc = FPDIV_ENTRY;
  const endAddr = 0x07CB20;
  let instrIndex = 0;
  let firstDRead = -1;
  let firstDWrite = -1;

  while (pc < endAddr && instrIndex < 40) {
    try {
      const instr = decodeInstruction(romBytes, pc, 'adl');
      const length = Math.max(instr.length || 1, 1);
      const bytes = [];
      for (let i = 0; i < length; i++) {
        bytes.push(hexByte(romBytes[pc + i] ?? 0));
      }
      const text = formatInstructionSimple(instr);
      const bytesStr = bytes.join(' ');

      // Check if this instruction references D or DE
      let dFlag = '';
      const readsD = instructionReadsD(instr);
      const writesD = instructionWritesD(instr);

      if (readsD) {
        dFlag = ' <<<< READS D/DE';
        if (firstDRead < 0) firstDRead = instrIndex;
      }
      if (writesD) {
        dFlag += (dFlag ? ' + ' : ' <<<< ') + 'WRITES D/DE';
        if (firstDWrite < 0) firstDWrite = instrIndex;
      }

      console.log(
        `  [${String(instrIndex).padStart(2)}] ${hex(pc)}  ${bytesStr.padEnd(20)}  ${text}${dFlag}`
      );

      pc += length;
      instrIndex++;

      // Stop at RET or unconditional JP
      if (instr.tag === 'ret' || instr.tag === 'jp') {
        break;
      }
    } catch (error) {
      console.log(
        `  [${String(instrIndex).padStart(2)}] ${hex(pc)}  ${hexByte(romBytes[pc] ?? 0).padEnd(20)}  decode-error: ${error?.message}`
      );
      pc += 1;
      instrIndex++;
    }
  }

  console.log('');
  console.log(`  First D/DE READ at instruction index: ${firstDRead < 0 ? 'NONE in range' : firstDRead}`);
  console.log(`  First D/DE WRITE at instruction index: ${firstDWrite < 0 ? 'NONE in range' : firstDWrite}`);
  console.log('');
}

function instructionReadsD(instr) {
  const tag = instr.tag;
  // Source operand is D or DE
  if (instr.src === 'd' || instr.src === 'de') return true;
  // LD (DE), reg — DE is read as address
  if (tag === 'ld-ind-reg' && instr.dest === 'de') return true;
  // LD reg, (DE) — DE is read as address
  if (tag === 'ld-reg-ind' && instr.src === 'de') return true;
  // ADD HL, DE or SBC HL, DE — reads DE
  if ((tag === 'add-pair' || tag === 'sbc-pair' || tag === 'adc-pair') && instr.src === 'de') return true;
  // EX DE, HL reads DE
  if (tag === 'ex-de-hl') return true;
  // PUSH DE reads DE
  if (tag === 'push' && instr.pair === 'de') return true;
  // ALU with D — cp d, add d, sub d, etc.
  if ((tag === 'alu-reg' || tag === 'cp-reg') && instr.src === 'd') return true;
  // INC/DEC DE reads DE
  if ((tag === 'inc-pair' || tag === 'dec-pair') && instr.pair === 'de') return true;
  // LDI/LDD/LDIR/LDDR read DE
  if (tag === 'ldi' || tag === 'ldd' || tag === 'ldir' || tag === 'lddr') return true;
  return false;
}

function instructionWritesD(instr) {
  const tag = instr.tag;
  // Dest operand is D
  if (instr.dest === 'd') return true;
  // LD DE, imm or LD DE, (addr)
  if (tag === 'ld-pair-imm' && instr.pair === 'de') return true;
  // POP DE writes DE
  if (tag === 'pop' && instr.pair === 'de') return true;
  // EX DE, HL writes DE
  if (tag === 'ex-de-hl') return true;
  // INC/DEC DE writes DE
  if ((tag === 'inc-pair' || tag === 'dec-pair') && instr.pair === 'de') return true;
  // LDI/LDD/LDIR/LDDR write DE
  if (tag === 'ldi' || tag === 'ldd' || tag === 'ldir' || tag === 'lddr') return true;
  return false;
}

// ==========================================================================
// Part B: D register value at FPDiv entry through normalization
// ==========================================================================

function partB(runtime) {
  const { mem, executor, cpu } = runtime;

  console.log('='.repeat(70));
  console.log('PART B: D register at FPDiv entry via NORMALIZATION (0x07CA48)');
  console.log('='.repeat(70));
  console.log('');

  seedTestState(cpu, mem);
  seedErrFrame(cpu, mem, FAKE_RET, ERR_CATCH_ADDR, 0);

  console.log(`  OP1: [${formatBytes(readBytes(mem, OP1_ADDR, 9))}] = ${decodeBcdRealBytes(readBytes(mem, OP1_ADDR, 9))}`);
  console.log(`  OP2: [${formatBytes(readBytes(mem, OP2_ADDR, 9))}] = ${decodeBcdRealBytes(readBytes(mem, OP2_ADDR, 9))}`);
  console.log(`  OP2 exponent byte (0xD00604): ${hexByte(mem[0xD00604])}`);
  console.log('');

  let stepCount = 0;
  let outcome = 'budget';
  let dAtFPDiv = null;
  let regsAtFPDiv = null;
  let tracing = false;

  try {
    executor.runFrom(NORM_ENTRY, 'adl', {
      maxSteps: MAX_STEPS,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc, mode, meta, step) {
        const norm = pc & 0xffffff;
        stepCount = noteStep(stepCount, step);

        // Start detailed D-register tracing from 0x07CA73 onward
        if (norm >= EXPONENT_COMB_ADDR) {
          const d = cpu.d & 0xff;
          const a = cpu.a & 0xff;
          const f = cpu.f & 0xff;
          const flagStr = [
            (f & 0x80) ? 'S' : '-',
            (f & 0x40) ? 'Z' : '-',
            (f & 0x01) ? 'C' : '-',
          ].join('');

          console.log(
            `  Step ${String(stepCount).padStart(3)}: PC=${hex(norm)}  ` +
            `D=${hexByte(d)} A=${hexByte(a)} F=${flagStr}  ` +
            `HL=${hex(cpu._hl & 0xffffff)} BC=${hex((cpu._bc ?? 0) & 0xffffff)} DE=${hex(cpu._de & 0xffffff)}`
          );
        }

        if (norm === FPDIV_ENTRY) {
          dAtFPDiv = cpu.d & 0xff;
          regsAtFPDiv = {
            d: cpu.d & 0xff,
            a: cpu.a & 0xff,
            f: cpu.f & 0xff,
            hl: cpu._hl & 0xffffff,
            bc: (cpu._bc ?? 0) & 0xffffff,
            de: cpu._de & 0xffffff,
          };
          console.log('');
          console.log(`  >>> FPDiv ENTRY reached <<<`);
          console.log(`      D  = ${hexByte(regsAtFPDiv.d)}`);
          console.log(`      A  = ${hexByte(regsAtFPDiv.a)}`);
          console.log(`      F  = ${hexByte(regsAtFPDiv.f)}`);
          console.log(`      HL = ${hex(regsAtFPDiv.hl)}`);
          console.log(`      BC = ${hex(regsAtFPDiv.bc)}`);
          console.log(`      DE = ${hex(regsAtFPDiv.de)}`);
          console.log('');
        }

        if (norm === FAKE_RET) throw new Error('__RET__');
        if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');
      },
      onMissingBlock(pc, mode, step) {
        const norm = pc & 0xffffff;
        stepCount = noteStep(stepCount, step);
        console.log(`  Step ${String(stepCount).padStart(3)}: PC=${hex(norm)} [MISSING]`);
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
      console.log(`  EXCEPTION: ${error?.message}`);
    }
  }

  const finalOp1 = readBytes(mem, OP1_ADDR, 9);
  console.log(`  Outcome: ${outcome} (steps: ${stepCount})`);
  console.log(`  Final OP1: [${formatBytes(finalOp1)}] = ${decodeBcdRealBytes(finalOp1)}`);
  console.log(`  errNo: ${hexByte(mem[ERR_NO_ADDR] & 0xff)} (${errName(mem[ERR_NO_ADDR] & 0xff)})`);
  console.log(`  D at FPDiv entry: ${dAtFPDiv !== null ? hexByte(dAtFPDiv) : 'NEVER REACHED'}`);
  console.log('');

  return { dAtFPDiv, regsAtFPDiv, outcome, finalOp1 };
}

// ==========================================================================
// Part C: D register value in the BYPASS case (direct FPDiv entry)
// ==========================================================================

function partC(runtime) {
  const { mem, executor, cpu } = runtime;

  console.log('='.repeat(70));
  console.log('PART C: D register at FPDiv entry via BYPASS (direct 0x07CAB9)');
  console.log('='.repeat(70));
  console.log('');

  seedTestState(cpu, mem);
  seedErrFrame(cpu, mem, FAKE_RET, ERR_CATCH_ADDR, 0);

  // D is whatever default/uninitialized value the runtime has
  const dBefore = cpu.d & 0xff;
  console.log(`  D before FPDiv (uninitialized): ${hexByte(dBefore)}`);
  console.log(`  OP1: [${formatBytes(readBytes(mem, OP1_ADDR, 9))}]`);
  console.log(`  OP2: [${formatBytes(readBytes(mem, OP2_ADDR, 9))}]`);
  console.log('');

  let stepCount = 0;
  let outcome = 'budget';

  try {
    executor.runFrom(FPDIV_ENTRY, 'adl', {
      maxSteps: MAX_STEPS,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc, mode, meta, step) {
        const norm = pc & 0xffffff;
        stepCount = noteStep(stepCount, step);
        if (norm === FAKE_RET) throw new Error('__RET__');
        if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');
      },
      onMissingBlock(pc, mode, step) {
        const norm = pc & 0xffffff;
        stepCount = noteStep(stepCount, step);
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
      console.log(`  EXCEPTION: ${error?.message}`);
    }
  }

  const finalOp1 = readBytes(mem, OP1_ADDR, 9);
  console.log(`  Outcome: ${outcome} (steps: ${stepCount})`);
  console.log(`  Final OP1: [${formatBytes(finalOp1)}] = ${decodeBcdRealBytes(finalOp1)}`);
  console.log(`  errNo: ${hexByte(mem[ERR_NO_ADDR] & 0xff)} (${errName(mem[ERR_NO_ADDR] & 0xff)})`);
  console.log('');

  return { dBefore, outcome, finalOp1 };
}

// ==========================================================================
// Part D: D register injection test
// ==========================================================================

function partD(runtime, dValue) {
  const { mem, executor, cpu } = runtime;

  console.log('='.repeat(70));
  console.log(`PART D: FPDiv with D injected = ${hexByte(dValue)}`);
  console.log('='.repeat(70));
  console.log('');

  seedTestState(cpu, mem);
  seedErrFrame(cpu, mem, FAKE_RET, ERR_CATCH_ADDR, 0);

  // Inject D value
  cpu.d = dValue;
  console.log(`  D set to: ${hexByte(cpu.d & 0xff)}`);
  console.log(`  OP1: [${formatBytes(readBytes(mem, OP1_ADDR, 9))}]`);
  console.log(`  OP2: [${formatBytes(readBytes(mem, OP2_ADDR, 9))}]`);
  console.log('');

  let stepCount = 0;
  let outcome = 'budget';

  try {
    executor.runFrom(FPDIV_ENTRY, 'adl', {
      maxSteps: MAX_STEPS,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc, mode, meta, step) {
        const norm = pc & 0xffffff;
        stepCount = noteStep(stepCount, step);
        if (norm === FAKE_RET) throw new Error('__RET__');
        if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');
      },
      onMissingBlock(pc, mode, step) {
        const norm = pc & 0xffffff;
        stepCount = noteStep(stepCount, step);
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
      console.log(`  EXCEPTION: ${error?.message}`);
    }
  }

  const finalOp1 = readBytes(mem, OP1_ADDR, 9);
  const resultStr = decodeBcdRealBytes(finalOp1);
  console.log(`  Outcome: ${outcome} (steps: ${stepCount})`);
  console.log(`  Final OP1: [${formatBytes(finalOp1)}] = ${resultStr}`);
  console.log(`  errNo: ${hexByte(mem[ERR_NO_ADDR] & 0xff)} (${errName(mem[ERR_NO_ADDR] & 0xff)})`);
  console.log(`  Does FPDiv(1200/1200) = 1.0? ${resultStr === '1' ? 'YES!' : 'NO (got ' + resultStr + ')'}`);
  console.log('');

  return { outcome, finalOp1, resultStr };
}

// ==========================================================================
// Part E: NEG arithmetic verification
// ==========================================================================

function partE() {
  console.log('='.repeat(70));
  console.log('PART E: NEG arithmetic on OP2 exponent byte');
  console.log('='.repeat(70));
  console.log('');

  const op2Exp = 0x83;
  const negResult = (-op2Exp) & 0xFF;
  console.log(`  OP2 exponent byte for BCD 1200: ${hexByte(op2Exp)}`);
  console.log(`  NEG of ${hexByte(op2Exp)}: ${hexByte(negResult)} (= ${negResult} decimal, = -${op2Exp} in 8-bit two's complement)`);
  console.log(`  Verification: 0x100 - 0x83 = 0x${(0x100 - 0x83).toString(16).toUpperCase()} = ${0x100 - 0x83} = ${hexByte(0x100 - 0x83)}`);
  console.log('');

  return negResult;
}

// ==========================================================================
// Main
// ==========================================================================

function main() {
  console.log('=== Phase 159: D Register Trace for FPDiv ===');
  console.log('');

  // Part A: Static disassembly (no runtime needed)
  partA();

  // Part E: NEG arithmetic (no runtime needed)
  const expectedD = partE();

  // Prepare runtime
  console.log('Preparing runtime (cold boot + MEM_INIT)...');
  const runtime = createPreparedRuntime();
  if (!runtime.memInitOk) {
    console.log('MEM_INIT failed; aborting.');
    process.exitCode = 1;
    return;
  }
  console.log('Runtime ready.');
  console.log('');

  // Part B: Normal flow through normalization
  const partBResult = partB(runtime);

  // Part C: Bypass (direct FPDiv entry)
  const partCResult = partC(runtime);

  // Part D: Inject D value from Part B
  const dToInject = partBResult.dAtFPDiv !== null ? partBResult.dAtFPDiv : expectedD;
  console.log(`Using D value for injection: ${hexByte(dToInject)} (from ${partBResult.dAtFPDiv !== null ? 'Part B observation' : 'Part E calculation'})`);
  console.log('');
  const partDResult = partD(runtime, dToInject);

  // Summary
  console.log('='.repeat(70));
  console.log('SUMMARY');
  console.log('='.repeat(70));
  console.log('');
  console.log(`  Part B (normal flow):  D at FPDiv entry = ${partBResult.dAtFPDiv !== null ? hexByte(partBResult.dAtFPDiv) : 'N/A'}`);
  console.log(`                         Result = ${decodeBcdRealBytes(partBResult.finalOp1)}`);
  console.log(`                         Outcome = ${partBResult.outcome}`);
  console.log('');
  console.log(`  Part C (bypass):       D at FPDiv entry = ${hexByte(partCResult.dBefore)}`);
  console.log(`                         Result = ${decodeBcdRealBytes(partCResult.finalOp1)}`);
  console.log(`                         Outcome = ${partCResult.outcome}`);
  console.log('');
  console.log(`  Part D (D injected):   D set to = ${hexByte(dToInject)}`);
  console.log(`                         Result = ${partDResult.resultStr}`);
  console.log(`                         Outcome = ${partDResult.outcome}`);
  console.log('');
  console.log(`  Part E (NEG arith):    NEG(0x83) = ${hexByte(expectedD)}`);
  console.log('');

  if (partBResult.dAtFPDiv !== null && partBResult.dAtFPDiv !== partCResult.dBefore) {
    console.log(`  FINDING: D differs between normal flow (${hexByte(partBResult.dAtFPDiv)}) and bypass (${hexByte(partCResult.dBefore)}).`);
    console.log(`  This COULD explain why bypassing normalization breaks FPDiv.`);
  } else if (partBResult.dAtFPDiv !== null) {
    console.log(`  FINDING: D is the SAME in both flows (${hexByte(partBResult.dAtFPDiv)}). D is NOT the differentiator.`);
  }

  if (partDResult.resultStr === '1') {
    console.log('  FINDING: Fixing D alone DOES fix FPDiv(1200/1200) = 1.0!');
  } else {
    console.log(`  FINDING: Fixing D alone does NOT fix FPDiv. Result was ${partDResult.resultStr}.`);
  }

  console.log('');
  console.log('Done.');
}

try {
  main();
} catch (error) {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
}
