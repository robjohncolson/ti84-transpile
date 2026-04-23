#!/usr/bin/env node

/**
 * Phase 25AL: Second-pass handler disassembly + runtime trace
 *
 * Part A: Static disassembly of:
 *   - 0x0585D3 context table (21 bytes → 7 cx fields)
 *   - 0x0585E9 second-pass handler (~40 instructions)
 *   - 0x058241 HomeHandler (first ~30 instructions)
 *
 * Part B: Runtime trace of 0x0585E9 with full seeding from 25AK.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase25al-second-pass-disasm-report.md');

const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

// ---- Constants (mirrored from 25AK) ----

const MEM_SIZE = 0x1000000;
const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08c331;
const POST_INIT_ENTRY = 0x0802b2;
const STACK_RESET_TOP = 0xd1a87e;

const MEMINIT_ENTRY = 0x09dee0;

const IY_ADDR = 0xd00080;
const IX_ADDR = 0xd1a860;

const KBD_SCAN_CODE_ADDR = 0xd00587;
const KBD_KEY_ADDR = 0xd0058c;
const KBD_GETKY_ADDR = 0xd0058d;
const OP1_ADDR = 0xd005f8;

const CX_MAIN_ADDR = 0xd007ca;
const CX_PPUTAWAY_ADDR = 0xd007cd;
const CX_PUTAWAY_ADDR = 0xd007d0;
const CX_REDISP_ADDR = 0xd007d3;
const CX_ERROREP_ADDR = 0xd007d6;
const CX_SIZEWIND_ADDR = 0xd007d9;
const CX_PAGE_ADDR = 0xd007dc;
const CX_CUR_APP_ADDR = 0xd007e0;
const CX_TAIL_ADDR = 0xd007e1;
const CX_CONTEXT_END_ADDR = 0xd007e1;

const ERR_NO_ADDR = 0xd008df;
const ERR_SP_ADDR = 0xd008e0;

const BEGPC_ADDR = 0xd02317;
const CURPC_ADDR = 0xd0231a;
const ENDPC_ADDR = 0xd0231d;

const TEMPMEM_ADDR = 0xd02587;
const FPSBASE_ADDR = 0xd0258a;
const FPS_ADDR = 0xd0258d;
const OPBASE_ADDR = 0xd02590;
const OPS_ADDR = 0xd02593;
const PTEMP_CNT_ADDR = 0xd02596;
const PTEMP_ADDR = 0xd0259a;
const PROGPTR_ADDR = 0xd0259d;
const NEWDATA_PTR_ADDR = 0xd025a0;

const PREYIELD_IY82_ADDR = 0xd000d2;
const PREYIELD_IY20_ADDR = 0xd00094;
const PREYIELD_IY69_ADDR = 0xd000c5;
const PREYIELD_IY09_ADDR = 0xd00089;
const PREYIELD_IY08_ADDR = 0xd00088;
const PREYIELD_SCAN_RESULT_ADDR = 0xd0265b;
const PREYIELD_KEY_STATE_ADDR = 0xd02506;

const USERMEM_ADDR = 0xd1a881;

const MEMINIT_RET = 0x7ffff6;
const FAKE_RET = 0x7ffffe;
const ERR_CATCH_ADDR = 0x7ffffa;

const MEMINIT_BUDGET = 100000;
const DEFAULT_MAX_LOOP_ITER = 8192;

const HOME_SCREEN_APP_ID = 0x40;
const K_ENTER = 0x05;
const SK_ENTER = 0x09;
const INPUT_TOKENS = Uint8Array.from([0x32, 0x70, 0x33, 0x3f]);

// ---- Target addresses for this probe ----

const SECOND_PASS_HANDLER = 0x0585e9;
const CONTEXT_TABLE_ADDR = 0x0585d3;
const HOME_HANDLER_ENTRY = 0x058241;

// Watched CALL targets
const WATCHED_CALLS = new Map([
  [0x0973c8, 'ENTER key path (with ParseInp)'],
  [0x099914, 'ParseInp'],
  [0x08bf22, 'yield'],
  [0x05e872, 'buffer flush'],
  [0x05e3a2, 'compaction'],
  [0x05e836, 'calls LDDR'],
  [0x0831a4, 'LDDR itself'],
  [0x001881, 'RAM CLEAR (should NOT be hit)'],
]);

// Known CALL target annotations for disasm
const CALL_ANNOTATIONS = new Map([
  [0x0973c8, 'ENTER key path'],
  [0x099914, 'ParseInp'],
  [0x08bf22, 'yield / CoorMon return'],
  [0x05e872, 'buffer flush'],
  [0x05e3a2, 'compaction'],
  [0x05e836, 'calls LDDR'],
  [0x0831a4, 'LDDR'],
  [0x001881, 'RAM CLEAR'],
  [0x08c782, 'LDIR (cx context copy)'],
  [0x058241, 'HomeHandler'],
  [0x0585e9, 'second-pass handler'],
  [0x08c331, 'CoorMon / kernel init'],
  [0x0802b2, 'post-init'],
  [0x09dee0, 'MEM_INIT'],
]);

// ---- Helpers ----

function hex(value, width = 6) {
  if (value === undefined || value === null) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).padStart(width, '0')}`;
}

function read24(mem, addr) {
  return ((mem[addr] & 0xff) | ((mem[addr + 1] & 0xff) << 8) | ((mem[addr + 2] & 0xff) << 16)) >>> 0;
}

function write24(mem, addr, value) {
  mem[addr] = value & 0xff;
  mem[addr + 1] = (value >>> 8) & 0xff;
  mem[addr + 2] = (value >>> 16) & 0xff;
}

function hexBytes(mem, addr, len) {
  const parts = [];
  for (let i = 0; i < len; i++) parts.push((mem[addr + i] & 0xff).toString(16).padStart(2, '0'));
  return parts.join(' ');
}

function clearBit(mem, addr, bit) {
  mem[addr] &= ~(1 << bit);
}

// ---- Disassembly helpers ----

const ADL_MODE = 'adl';

function bytesStr(buffer, pc, length) {
  return Array.from(buffer.slice(pc, pc + length), (v) =>
    v.toString(16).toUpperCase().padStart(2, '0'),
  ).join(' ');
}

function fmtInst(inst) {
  const d = (v) => (v >= 0 ? `+${v}` : `${v}`);
  const prefix = inst.modePrefix ? `${inst.modePrefix} ` : '';

  let text = inst.tag;
  switch (inst.tag) {
    case 'nop': text = 'nop'; break;
    case 'ei': text = 'ei'; break;
    case 'di': text = 'di'; break;
    case 'halt': text = 'halt'; break;
    case 'ret': text = 'ret'; break;
    case 'ret-conditional': text = `ret ${inst.condition}`; break;
    case 'retn': text = 'retn'; break;
    case 'reti': text = 'reti'; break;
    case 'call': text = `call ${hex(inst.target)}`; break;
    case 'call-conditional': text = `call ${inst.condition}, ${hex(inst.target)}`; break;
    case 'jp': text = `jp ${hex(inst.target)}`; break;
    case 'jp-conditional': text = `jp ${inst.condition}, ${hex(inst.target)}`; break;
    case 'jp-indirect': text = `jp (${inst.indirectRegister})`; break;
    case 'jr': text = `jr ${hex(inst.target)}`; break;
    case 'jr-conditional': text = `jr ${inst.condition}, ${hex(inst.target)}`; break;
    case 'djnz': text = `djnz ${hex(inst.target)}`; break;
    case 'rst': text = `rst ${hex(inst.target)}`; break;
    case 'push': text = `push ${inst.pair}`; break;
    case 'pop': text = `pop ${inst.pair}`; break;
    case 'ex-af': text = "ex af, af'"; break;
    case 'ex-de-hl': text = 'ex de, hl'; break;
    case 'ex-sp-pair': text = `ex (sp), ${inst.pair}`; break;
    case 'exx': text = 'exx'; break;
    case 'ld-pair-imm': text = `ld ${inst.pair}, ${hex(inst.value)}`; break;
    case 'ld-pair-mem':
      text = inst.direction === 'to-mem'
        ? `ld (${hex(inst.addr)}), ${inst.pair}`
        : `ld ${inst.pair}, (${hex(inst.addr)})`;
      break;
    case 'ld-mem-pair': text = `ld (${hex(inst.addr)}), ${inst.pair}`; break;
    case 'ld-reg-imm': text = `ld ${inst.dest}, ${hex(inst.value, 2)}`; break;
    case 'ld-reg-mem': text = `ld ${inst.dest}, (${hex(inst.addr)})`; break;
    case 'ld-mem-reg': text = `ld (${hex(inst.addr)}), ${inst.src}`; break;
    case 'ld-reg-ind': text = `ld ${inst.dest}, (${inst.src})`; break;
    case 'ld-ind-reg': text = `ld (${inst.dest}), ${inst.src}`; break;
    case 'ld-reg-reg': text = `ld ${inst.dest}, ${inst.src}`; break;
    case 'ld-reg-ixd': text = `ld ${inst.dest}, (${inst.indexRegister}${d(inst.displacement)})`; break;
    case 'ld-ixd-reg': text = `ld (${inst.indexRegister}${d(inst.displacement)}), ${inst.src}`; break;
    case 'ld-ixd-imm': text = `ld (${inst.indexRegister}${d(inst.displacement)}), ${hex(inst.value, 2)}`; break;
    case 'ld-sp-pair': text = `ld sp, ${inst.src}`; break;
    case 'ld-a-ind-bc': text = 'ld a, (bc)'; break;
    case 'ld-a-ind-de': text = 'ld a, (de)'; break;
    case 'ld-ind-bc-a': text = 'ld (bc), a'; break;
    case 'ld-ind-de-a': text = 'ld (de), a'; break;
    case 'inc-pair': text = `inc ${inst.pair}`; break;
    case 'dec-pair': text = `dec ${inst.pair}`; break;
    case 'inc-reg': text = `inc ${inst.reg}`; break;
    case 'dec-reg': text = `dec ${inst.reg}`; break;
    case 'inc-ind': text = `inc (${inst.indirectRegister})`; break;
    case 'dec-ind': text = `dec (${inst.indirectRegister})`; break;
    case 'add-pair': text = `add ${inst.dest}, ${inst.src}`; break;
    case 'alu-reg': text = `${inst.op} ${inst.src}`; break;
    case 'alu-imm': text = `${inst.op} ${hex(inst.value, 2)}`; break;
    case 'alu-ind': text = `${inst.op} (${inst.indirectRegister})`; break;
    case 'sbc-pair': text = `sbc hl, ${inst.src}`; break;
    case 'adc-pair': text = `adc hl, ${inst.src}`; break;
    case 'bit-test': text = `bit ${inst.bit}, ${inst.reg}`; break;
    case 'bit-test-ind': text = `bit ${inst.bit}, (${inst.indirectRegister})`; break;
    case 'bit-res': text = `res ${inst.bit}, ${inst.reg}`; break;
    case 'bit-res-ind': text = `res ${inst.bit}, (${inst.indirectRegister})`; break;
    case 'bit-set': text = `set ${inst.bit}, ${inst.reg}`; break;
    case 'bit-set-ind': text = `set ${inst.bit}, (${inst.indirectRegister})`; break;
    case 'indexed-cb-bit': text = `bit ${inst.bit}, (${inst.indexRegister}${d(inst.displacement)})`; break;
    case 'indexed-cb-res': text = `res ${inst.bit}, (${inst.indexRegister}${d(inst.displacement)})`; break;
    case 'indexed-cb-set': text = `set ${inst.bit}, (${inst.indexRegister}${d(inst.displacement)})`; break;
    case 'ldir': text = 'ldir'; break;
    case 'lddr': text = 'lddr'; break;
    case 'ldi': text = 'ldi'; break;
    case 'ldd': text = 'ldd'; break;
    case 'cpir': text = 'cpir'; break;
    case 'cpdr': text = 'cpdr'; break;
    case 'cpi': text = 'cpi'; break;
    case 'cpd': text = 'cpd'; break;
    case 'neg': text = 'neg'; break;
    case 'cpl': text = 'cpl'; break;
    case 'ccf': text = 'ccf'; break;
    case 'scf': text = 'scf'; break;
    case 'daa': text = 'daa'; break;
    case 'rla': text = 'rla'; break;
    case 'rra': text = 'rra'; break;
    case 'rlca': text = 'rlca'; break;
    case 'rrca': text = 'rrca'; break;
    case 'mlt': text = `mlt ${inst.reg}`; break;
    case 'tst-reg': text = `tst a, ${inst.reg}`; break;
    case 'tst-ind': text = 'tst a, (hl)'; break;
    case 'tst-imm': text = `tst a, ${hex(inst.value, 2)}`; break;
    case 'lea': text = `lea ${inst.dest}, ${inst.base}${d(inst.displacement)}`; break;
    case 'rotate': text = `${inst.op} ${inst.reg}`; break;
    case 'rotate-ind': text = `${inst.op} (${inst.indirectRegister})`; break;
    case 'indexed-cb-rotate': text = `${inst.op} (${inst.indexRegister}${d(inst.displacement)})`; break;
    case 'in-a-imm': text = `in a, (${hex(inst.port, 2)})`; break;
    case 'out-imm-a': text = `out (${hex(inst.port, 2)}), a`; break;
    case 'in-reg': text = `in ${inst.dest}, (c)`; break;
    case 'out-reg': text = `out (c), ${inst.src}`; break;
    case 'im': text = `im ${inst.mode_num}`; break;
    case 'ld-i-a': text = 'ld i, a'; break;
    case 'ld-a-i': text = 'ld a, i'; break;
    case 'ld-r-a': text = 'ld r, a'; break;
    case 'ld-a-r': text = 'ld a, r'; break;
    default: {
      const skip = new Set(['pc', 'length', 'nextPc', 'tag', 'mode', 'modePrefix', 'terminates', 'fallthrough']);
      const parts = Object.entries(inst)
        .filter(([key]) => !skip.has(key))
        .map(([key, value]) => `${key}=${typeof value === 'number' ? hex(value) : value}`);
      text = parts.length ? `${inst.tag} ${parts.join(' ')}` : inst.tag;
    }
  }

  return `${prefix}${text}`;
}

function disassembleRange(buffer, startAddr, numBytes, maxInstr = 100) {
  const rows = [];
  let pc = startAddr;
  const endAddr = startAddr + numBytes;
  let count = 0;

  while (pc < endAddr && count < maxInstr) {
    const inst = decodeInstruction(buffer, pc, ADL_MODE);
    if (!inst || inst.length <= 0) {
      rows.push({
        pc,
        length: 1,
        inst: null,
        bytes: bytesStr(buffer, pc, 1),
        text: `db ${hex(buffer[pc], 2)}`,
      });
      pc += 1;
    } else {
      rows.push({
        pc: inst.pc,
        length: inst.length,
        inst,
        bytes: bytesStr(buffer, inst.pc, inst.length),
        text: fmtInst(inst),
      });
      pc += inst.length;
    }
    count++;
  }

  return rows;
}

function annotateRow(row) {
  if (!row.inst) return '';
  const notes = [];

  // Annotate CALL/JP targets
  const target = row.inst.target;
  if (typeof target === 'number') {
    const ann = CALL_ANNOTATIONS.get(target);
    if (ann) notes.push(ann);
  }

  // Annotate IY references
  if (row.inst.indexRegister === 'iy') {
    notes.push(`IY${row.inst.displacement >= 0 ? '+' : ''}${row.inst.displacement}`);
  }

  // Annotate RAM addresses
  if (typeof row.inst.addr === 'number' && row.inst.addr >= 0xd00000) {
    if (row.inst.addr === 0xd0146d) notes.push('key event code');
    if (row.inst.addr >= 0xd007ca && row.inst.addr <= 0xd007e1) notes.push('cx range');
    if (row.inst.addr === OP1_ADDR) notes.push('OP1');
  }
  if (typeof row.inst.value === 'number' && row.inst.value >= 0xd00000 && row.inst.value < 0xd80000) {
    if (row.inst.value === 0xd0146d) notes.push('key event code');
    if (row.inst.value === 0xd007ca) notes.push('cxMain addr');
  }

  return notes.length ? `  ; ${notes.join(' | ')}` : '';
}

// ---- Boot / seed helpers (from 25AK) ----

function createRuntime() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, 0x400000));
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;
  return { mem, peripherals, executor, cpu };
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
  cpu._iy = IY_ADDR;
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
  cpu._iy = IY_ADDR;
  cpu.f = 0x40;
  cpu._ix = IX_ADDR;
  cpu.sp = STACK_RESET_TOP - 12;
  mem.fill(0xff, cpu.sp, cpu.sp + 12);
}

function prepareSeededCallState(cpu, mem, regs = {}) {
  prepareCallState(cpu, mem);
  if (regs.a !== undefined) cpu.a = regs.a & 0xff;
  if (regs.bc !== undefined) cpu.bc = regs.bc & 0xffffff;
  if (regs.de !== undefined) cpu.de = regs.de & 0xffffff;
  if (regs.hl !== undefined) cpu.hl = regs.hl & 0xffffff;
}

function makeSentinelError(termination, pc) {
  const error = new Error('__SENTINEL__');
  error.isSentinel = true;
  error.termination = termination;
  error.pc = pc & 0xffffff;
  return error;
}

function runDirect(executor, entry, options = {}) {
  const sentinelMap = options.sentinels ?? new Map();
  let steps = 0;
  let finalPc = entry & 0xffffff;
  let finalMode = 'adl';
  let termination = 'unknown';
  let loopsForced = 0;

  try {
    const result = executor.runFrom(entry, 'adl', {
      maxSteps: options.maxSteps ?? 100000,
      maxLoopIterations: options.maxLoopIterations ?? DEFAULT_MAX_LOOP_ITER,
      onLoopBreak(pc, mode, loopHitCount, fallthroughTarget) {
        loopsForced++;
        if (options.onLoopBreak) options.onLoopBreak(pc & 0xffffff, mode, loopHitCount, fallthroughTarget);
      },
      onBlock(pc, mode, meta, step) {
        const norm = pc & 0xffffff;
        const stepNumber = (step ?? 0) + 1;
        steps = Math.max(steps, stepNumber);
        finalPc = norm;
        finalMode = mode;
        if (sentinelMap.has(norm)) throw makeSentinelError(sentinelMap.get(norm), norm);
        if (options.onBlock) options.onBlock(norm, mode, meta, stepNumber);
      },
      onMissingBlock(pc, mode, step) {
        const norm = pc & 0xffffff;
        const stepNumber = (step ?? 0) + 1;
        steps = Math.max(steps, stepNumber);
        finalPc = norm;
        finalMode = mode;
        if (sentinelMap.has(norm)) throw makeSentinelError(sentinelMap.get(norm), norm);
        if (options.onMissingBlock) options.onMissingBlock(norm, mode, stepNumber);
      },
    });
    steps = Math.max(steps, result.steps ?? 0);
    finalPc = (result.lastPc ?? finalPc) & 0xffffff;
    finalMode = result.lastMode ?? finalMode;
    termination = result.termination ?? 'unknown';
    loopsForced = Math.max(loopsForced, result.loopsForced ?? 0);
    return { steps, finalPc, finalMode, termination, loopsForced, rawResult: result };
  } catch (error) {
    if (error?.isSentinel) {
      termination = error.termination;
      return { steps, finalPc: error.pc, finalMode, termination, loopsForced, rawResult: null };
    }
    throw error;
  }
}

function runMemInit(runtime) {
  const { mem, cpu, executor } = runtime;
  prepareSeededCallState(cpu, mem, { a: 0, bc: 0, de: 0, hl: 0 });
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEMINIT_RET);
  const run = runDirect(executor, MEMINIT_ENTRY, {
    maxSteps: MEMINIT_BUDGET,
    maxLoopIterations: DEFAULT_MAX_LOOP_ITER,
    sentinels: new Map([
      [MEMINIT_RET, 'return_hit'],
      [0xffffff, 'missing_block_terminal'],
    ]),
  });
  return { run, returned: run.termination === 'return_hit' };
}

function seedManualCxContext(mem) {
  mem.fill(0x00, CX_MAIN_ADDR, CX_CONTEXT_END_ADDR + 1);
  write24(mem, CX_MAIN_ADDR, SECOND_PASS_HANDLER);  // cxMain = 0x0585E9 (second-pass!)
  write24(mem, CX_PPUTAWAY_ADDR, 0x058b19);
  write24(mem, CX_PUTAWAY_ADDR, 0x058b7e);
  write24(mem, CX_REDISP_ADDR, 0x0582bc);
  write24(mem, CX_ERROREP_ADDR, 0x058ba9);
  write24(mem, CX_SIZEWIND_ADDR, 0x058c01);
  write24(mem, CX_PAGE_ADDR, 0x000000);
  mem[CX_CUR_APP_ADDR] = HOME_SCREEN_APP_ID;
  mem[CX_TAIL_ADDR] = 0x00;
}

function seedPreYieldState(mem) {
  clearBit(mem, PREYIELD_IY82_ADDR, 7);
  clearBit(mem, PREYIELD_IY20_ADDR, 7);
  clearBit(mem, PREYIELD_IY69_ADDR, 7);
  clearBit(mem, PREYIELD_IY09_ADDR, 0);
  clearBit(mem, PREYIELD_IY08_ADDR, 1);
  mem[PREYIELD_SCAN_RESULT_ADDR] = 0x00;
  mem[PREYIELD_KEY_STATE_ADDR] = 0x00;
}

function seedKeyboard(mem, peripherals) {
  peripherals.keyboard.keyMatrix[1] = 0xfe;
  mem[KBD_SCAN_CODE_ADDR] = SK_ENTER;
  mem[KBD_KEY_ADDR] = K_ENTER;
  mem[KBD_GETKY_ADDR] = K_ENTER;
}

function seedParserInput(mem) {
  mem.fill(0x00, USERMEM_ADDR, USERMEM_ADDR + INPUT_TOKENS.length + 4);
  mem.set(INPUT_TOKENS, USERMEM_ADDR);
  write24(mem, BEGPC_ADDR, USERMEM_ADDR);
  write24(mem, CURPC_ADDR, USERMEM_ADDR);
  write24(mem, ENDPC_ADDR, USERMEM_ADDR + INPUT_TOKENS.length);
  mem.fill(0x00, OP1_ADDR, OP1_ADDR + 9);
  mem[ERR_NO_ADDR] = 0x00;
}

function seedMinimalErrFrame(cpu, mem, returnAddr) {
  cpu.sp = (cpu.sp - 3) & 0xffffff;
  write24(mem, cpu.sp, returnAddr);
  const errFrameBase = (cpu.sp - 6) & 0xffffff;
  mem.fill(0x00, errFrameBase, errFrameBase + 6);
  write24(mem, errFrameBase + 3, ERR_CATCH_ADDR);
  write24(mem, ERR_SP_ADDR, errFrameBase);
  mem[ERR_NO_ADDR] = 0x00;
}

// ============================
// MAIN
// ============================

async function main() {
  const log = (line = '') => console.log(String(line));
  const report = [];
  const rlog = (line = '') => { report.push(line); };

  log('=== Phase 25AL: Second-Pass Handler Disassembly + Runtime Trace ===');
  log('');

  // ================================================================
  // PART A: Static disassembly
  // ================================================================

  log('========== PART A: Static Disassembly ==========');
  log('');

  // --- A1: Context table at 0x0585D3 ---
  log('--- A1: Context table at 0x0585D3 (21 bytes) ---');
  log('');

  const ctxFields = [
    { name: 'cxMain',     offset: 0,  width: 3 },
    { name: 'cxPPutaway', offset: 3,  width: 3 },
    { name: 'cxPutaway',  offset: 6,  width: 3 },
    { name: 'cxRedisp',   offset: 9,  width: 3 },
    { name: 'cxErrorEP',  offset: 12, width: 3 },
    { name: 'cxSizeWind', offset: 15, width: 3 },
    { name: 'cxPage',     offset: 18, width: 2 },
    { name: 'cxCurApp',   offset: 20, width: 1 },
  ];

  const ctxTableLines = [];
  log(`Raw bytes: ${hexBytes(romBytes, CONTEXT_TABLE_ADDR, 21)}`);
  ctxTableLines.push(`Raw bytes: ${hexBytes(romBytes, CONTEXT_TABLE_ADDR, 21)}`);
  log('');

  for (const field of ctxFields) {
    const addr = CONTEXT_TABLE_ADDR + field.offset;
    let value;
    if (field.width === 3) {
      value = read24(romBytes, addr);
    } else if (field.width === 2) {
      value = (romBytes[addr] & 0xff) | ((romBytes[addr + 1] & 0xff) << 8);
    } else {
      value = romBytes[addr] & 0xff;
    }
    const line = `  ${field.name.padEnd(14)} = ${hex(value, field.width * 2)}  (bytes at ${hex(addr)}: ${hexBytes(romBytes, addr, field.width)})`;
    log(line);
    ctxTableLines.push(line);
  }
  log('');

  // --- A2: Disassemble 0x0585E9 (second-pass handler) ---
  log('--- A2: Disassembly of 0x0585E9 (second-pass handler, 256 bytes / ~40 instr) ---');
  log('');

  const secondPassRows = disassembleRange(romBytes, SECOND_PASS_HANDLER, 256, 50);
  const secondPassCallTargets = [];

  for (const row of secondPassRows) {
    const ann = annotateRow(row);
    log(`  ${hex(row.pc)}  ${row.bytes.padEnd(24)} ${row.text}${ann}`);

    // Collect CALL targets
    if (row.inst && (row.inst.tag === 'call' || row.inst.tag === 'call-conditional') && typeof row.inst.target === 'number') {
      secondPassCallTargets.push({ pc: row.pc, target: row.inst.target, text: row.text });
    }
  }
  log('');

  log('  CALL targets found:');
  for (const ct of secondPassCallTargets) {
    const ann = CALL_ANNOTATIONS.get(ct.target) ?? '(unknown)';
    log(`    ${hex(ct.pc)} -> ${hex(ct.target)}  ${ann}`);
  }

  // Check specific references
  const refs0x0973c8 = secondPassRows.some(r => r.inst?.target === 0x0973c8);
  const refs0x08bf22 = secondPassRows.some(r => r.inst?.target === 0x08bf22);
  const refsD0146D = secondPassRows.some(r => r.inst?.addr === 0xd0146d || r.inst?.value === 0xd0146d);
  const refs05E872 = secondPassRows.some(r => r.inst?.target === 0x05e872);
  const iyRefs = secondPassRows.filter(r => r.inst?.indexRegister === 'iy');

  log('');
  log('  Key reference checks:');
  log(`    References 0x0973C8 (ENTER key path): ${refs0x0973c8}`);
  log(`    References 0x08BF22 (yield):          ${refs0x08bf22}`);
  log(`    References 0xD0146D (key event code):  ${refsD0146D}`);
  log(`    References 0x05E872 (buffer flush):    ${refs05E872}`);
  log(`    IY-indexed operations:                 ${iyRefs.length}`);
  if (iyRefs.length > 0) {
    for (const r of iyRefs) {
      log(`      ${hex(r.pc)}  ${r.text}  (IY${r.inst.displacement >= 0 ? '+' : ''}${r.inst.displacement})`);
    }
  }
  log('');

  // --- A3: Disassemble 0x058241 (HomeHandler) ---
  log('--- A3: Disassembly of 0x058241 (HomeHandler, 200 bytes / ~30 instr) ---');
  log('');

  const homeRows = disassembleRange(romBytes, HOME_HANDLER_ENTRY, 200, 40);

  for (const row of homeRows) {
    const ann = annotateRow(row);
    log(`  ${hex(row.pc)}  ${row.bytes.padEnd(24)} ${row.text}${ann}`);
  }
  log('');

  // Look for 0x0585D3 reference (context table load)
  const ctxTableRef = homeRows.filter(r => {
    if (!r.inst) return false;
    if (typeof r.inst.value === 'number' && r.inst.value === CONTEXT_TABLE_ADDR) return true;
    if (typeof r.inst.target === 'number' && r.inst.target === CONTEXT_TABLE_ADDR) return true;
    if (typeof r.inst.addr === 'number' && r.inst.addr === CONTEXT_TABLE_ADDR) return true;
    return false;
  });
  log(`  References to 0x0585D3 (context table): ${ctxTableRef.length}`);
  for (const r of ctxTableRef) {
    log(`    ${hex(r.pc)}  ${r.text}`);
  }

  // Look for CALL 0x08C782 (LDIR copy)
  const ldirCallRef = homeRows.filter(r => r.inst?.target === 0x08c782);
  log(`  References to 0x08C782 (LDIR cx copy): ${ldirCallRef.length}`);
  for (const r of ldirCallRef) {
    log(`    ${hex(r.pc)}  ${r.text}`);
  }
  log('');

  // ================================================================
  // PART B: Runtime trace
  // ================================================================

  log('========== PART B: Runtime Trace of 0x0585E9 ==========');
  log('');

  // Stage 0: Boot
  log('--- Stage 0: Cold boot ---');
  const runtime = createRuntime();
  const { mem, peripherals, executor, cpu } = runtime;
  coldBoot(executor, cpu, mem);
  log('Boot complete.');

  // Stage 1: MEM_INIT
  log('');
  log('--- Stage 1: MEM_INIT ---');
  const memInit = runMemInit(runtime);
  log(`MEM_INIT: returned=${memInit.returned} term=${memInit.run.termination} steps=${memInit.run.steps}`);
  if (!memInit.returned) {
    log('FATAL: MEM_INIT did not return. Aborting.');
    return;
  }

  // Stage 2: Seed state
  log('');
  log('--- Stage 2: Seed state (cxMain=0x0585E9) ---');
  seedManualCxContext(mem);  // cxMain = 0x0585E9
  seedPreYieldState(mem);
  seedKeyboard(mem, peripherals);
  seedParserInput(mem);
  log(`cxCurApp=${hex(mem[CX_CUR_APP_ADDR], 2)} cxMain=${hex(read24(mem, CX_MAIN_ADDR))}`);
  log(`OP1: ${hexBytes(mem, OP1_ADDR, 9)}`);
  log(`errNo=${hex(mem[ERR_NO_ADDR], 2)}`);

  // Stage 3: Run from 0x0585E9 directly
  log('');
  log('--- Stage 3: Run 0x0585E9 with 50K step budget ---');

  prepareSeededCallState(cpu, mem, { a: 0, bc: 0, de: 0, hl: 0 });
  seedMinimalErrFrame(cpu, mem, FAKE_RET);

  // Track watched addresses
  const hitLog = new Map();
  for (const [addr] of WATCHED_CALLS) {
    hitLog.set(addr, []);
  }

  // Track OP1, cxCurApp, cxMain, errNo changes
  const stateChanges = [];
  let lastOP1Hex = hexBytes(mem, OP1_ADDR, 8);
  let lastCxCurApp = mem[CX_CUR_APP_ADDR] & 0xff;
  let lastCxMain = read24(mem, CX_MAIN_ADDR);
  let lastErrNo = mem[ERR_NO_ADDR] & 0xff;

  // Collect first 100 PCs for trace
  const firstPCs = [];
  const MAX_FIRST_PCS = 200;

  const RUNTIME_BUDGET = 50000;

  const run = runDirect(executor, SECOND_PASS_HANDLER, {
    maxSteps: RUNTIME_BUDGET,
    maxLoopIterations: DEFAULT_MAX_LOOP_ITER,
    sentinels: new Map([
      [FAKE_RET, 'return_hit'],
      [ERR_CATCH_ADDR, 'err_caught'],
      [0x001881, 'ram_clear_hit'],
      [0xffffff, 'missing_block_terminal'],
    ]),
    onBlock(pc, _mode, meta, stepNumber) {
      // Record first N PCs
      if (firstPCs.length < MAX_FIRST_PCS) {
        firstPCs.push({ step: stepNumber, pc, sp: cpu.sp & 0xffffff });
      }

      // Check watched addresses
      if (hitLog.has(pc)) {
        hitLog.get(pc).push(stepNumber);
      }

      // Monitor state changes
      const curOP1 = hexBytes(mem, OP1_ADDR, 8);
      const curCxCurApp = mem[CX_CUR_APP_ADDR] & 0xff;
      const curCxMain = read24(mem, CX_MAIN_ADDR);
      const curErrNo = mem[ERR_NO_ADDR] & 0xff;

      if (curOP1 !== lastOP1Hex || curCxCurApp !== lastCxCurApp || curCxMain !== lastCxMain || curErrNo !== lastErrNo) {
        stateChanges.push({
          step: stepNumber,
          pc,
          op1: curOP1,
          cxCurApp: curCxCurApp,
          cxMain: curCxMain,
          errNo: curErrNo,
          changed: [
            curOP1 !== lastOP1Hex ? 'OP1' : null,
            curCxCurApp !== lastCxCurApp ? 'cxCurApp' : null,
            curCxMain !== lastCxMain ? 'cxMain' : null,
            curErrNo !== lastErrNo ? 'errNo' : null,
          ].filter(Boolean),
        });
        lastOP1Hex = curOP1;
        lastCxCurApp = curCxCurApp;
        lastCxMain = curCxMain;
        lastErrNo = curErrNo;
      }
    },
    onMissingBlock(pc, _mode, stepNumber) {
      if (firstPCs.length < MAX_FIRST_PCS) {
        firstPCs.push({ step: stepNumber, pc, sp: cpu.sp & 0xffffff, missing: true });
      }
      if (hitLog.has(pc)) {
        hitLog.get(pc).push(stepNumber);
      }
    },
  });

  log(`Result: term=${run.termination} steps=${run.steps} finalPc=${hex(run.finalPc)} loopsForced=${run.loopsForced}`);
  log('');

  // Watched address hits
  log('--- Watched address hits ---');
  for (const [addr, label] of WATCHED_CALLS) {
    const hits = hitLog.get(addr);
    if (hits.length > 0) {
      log(`  ${hex(addr)} (${label}): HIT at steps [${hits.slice(0, 10).join(', ')}]${hits.length > 10 ? ` ... (${hits.length} total)` : ''}`);
    } else {
      log(`  ${hex(addr)} (${label}): NOT HIT`);
    }
  }
  log('');

  // State changes
  log('--- State changes (OP1, cxCurApp, cxMain, errNo) ---');
  if (stateChanges.length === 0) {
    log('  No changes detected.');
  } else {
    for (const sc of stateChanges.slice(0, 50)) {
      log(`  step=${sc.step} pc=${hex(sc.pc)} changed=[${sc.changed.join(',')}] cxCurApp=${hex(sc.cxCurApp, 2)} cxMain=${hex(sc.cxMain)} errNo=${hex(sc.errNo, 2)} OP1=[${sc.op1}]`);
    }
    if (stateChanges.length > 50) log(`  ... (${stateChanges.length} total changes)`);
  }
  log('');

  // First PCs
  log('--- First 50 block PCs ---');
  for (const entry of firstPCs.slice(0, 50)) {
    const miss = entry.missing ? ' (MISSING BLOCK)' : '';
    log(`  step=${entry.step} pc=${hex(entry.pc)} sp=${hex(entry.sp)}${miss}`);
  }
  log('');

  // Post-run state
  log('--- Post-run state ---');
  log(`  cxCurApp=${hex(mem[CX_CUR_APP_ADDR], 2)} cxMain=${hex(read24(mem, CX_MAIN_ADDR))}`);
  log(`  errNo=${hex(mem[ERR_NO_ADDR], 2)} errSP=${hex(read24(mem, ERR_SP_ADDR))}`);
  log(`  OP1: ${hexBytes(mem, OP1_ADDR, 9)}`);
  log(`  begPC=${hex(read24(mem, BEGPC_ADDR))} curPC=${hex(read24(mem, CURPC_ADDR))} endPC=${hex(read24(mem, ENDPC_ADDR))}`);
  log('');

  // ================================================================
  // Write report
  // ================================================================

  rlog('# Phase 25AL — Second-Pass Handler Disassembly + Runtime Trace');
  rlog('');
  rlog(`Generated: ${new Date().toISOString().slice(0, 10)}`);
  rlog('');

  rlog('## Context Table at 0x0585D3 (21 bytes)');
  rlog('');
  rlog('This table is loaded by the home handler via LDIR (0x08C782) into the cx range 0xD007CA-0xD007E1.');
  rlog('');
  rlog('| Field | Offset | Width | Value | Annotation |');
  rlog('|-------|--------|-------|-------|------------|');
  for (const field of ctxFields) {
    const addr = CONTEXT_TABLE_ADDR + field.offset;
    let value;
    if (field.width === 3) {
      value = read24(romBytes, addr);
    } else if (field.width === 2) {
      value = (romBytes[addr] & 0xff) | ((romBytes[addr + 1] & 0xff) << 8);
    } else {
      value = romBytes[addr] & 0xff;
    }
    const ann = CALL_ANNOTATIONS.get(value) ?? '';
    rlog(`| ${field.name} | ${field.offset} | ${field.width} | ${hex(value, field.width * 2)} | ${ann} |`);
  }
  rlog('');

  rlog('## Disassembly of 0x0585E9 (Second-Pass Handler)');
  rlog('');
  rlog('```text');
  for (const row of secondPassRows) {
    const ann = annotateRow(row);
    rlog(`${hex(row.pc)}  ${row.bytes.padEnd(24)} ${row.text}${ann}`);
  }
  rlog('```');
  rlog('');

  rlog('### CALL Targets');
  rlog('');
  rlog('| Site | Target | Annotation |');
  rlog('|------|--------|------------|');
  for (const ct of secondPassCallTargets) {
    const ann = CALL_ANNOTATIONS.get(ct.target) ?? '(unknown)';
    rlog(`| ${hex(ct.pc)} | ${hex(ct.target)} | ${ann} |`);
  }
  rlog('');

  rlog('### Key Reference Summary');
  rlog('');
  rlog(`- References 0x0973C8 (ENTER key path): **${refs0x0973c8 ? 'YES' : 'NO'}**`);
  rlog(`- References 0x08BF22 (yield): **${refs0x08bf22 ? 'YES' : 'NO'}**`);
  rlog(`- References 0xD0146D (key event code): **${refsD0146D ? 'YES' : 'NO'}**`);
  rlog(`- References 0x05E872 (buffer flush): **${refs05E872 ? 'YES' : 'NO'}**`);
  rlog(`- IY-indexed operations: **${iyRefs.length}**`);
  rlog('');

  rlog('## Disassembly of 0x058241 (HomeHandler)');
  rlog('');
  rlog('```text');
  for (const row of homeRows) {
    const ann = annotateRow(row);
    rlog(`${hex(row.pc)}  ${row.bytes.padEnd(24)} ${row.text}${ann}`);
  }
  rlog('```');
  rlog('');
  rlog(`References to 0x0585D3 (context table): ${ctxTableRef.length}`);
  for (const r of ctxTableRef) {
    rlog(`- ${hex(r.pc)}: \`${r.text}\``);
  }
  rlog(`References to 0x08C782 (LDIR cx copy): ${ldirCallRef.length}`);
  for (const r of ldirCallRef) {
    rlog(`- ${hex(r.pc)}: \`${r.text}\``);
  }
  rlog('');

  rlog('## Runtime Trace of 0x0585E9');
  rlog('');
  rlog('### Setup');
  rlog('');
  rlog('- Cold boot + MEM_INIT');
  rlog('- cx seed: cxMain=0x0585E9 (second-pass handler), cxCurApp=0x40');
  rlog('- Pre-yield IY flags cleared, ENTER key seeded, tokenized "2+3" at userMem');
  rlog('- PC set to 0x0585E9, budget: 50K steps, maxLoopIterations=8192');
  rlog('');
  rlog('### Results');
  rlog('');
  rlog(`- Termination: **${run.termination}**`);
  rlog(`- Steps: ${run.steps}`);
  rlog(`- Final PC: ${hex(run.finalPc)}`);
  rlog(`- Loops forced: ${run.loopsForced}`);
  rlog('');

  rlog('### Watched Address Hits');
  rlog('');
  rlog('| Address | Label | Hit? | Steps |');
  rlog('|---------|-------|------|-------|');
  for (const [addr, label] of WATCHED_CALLS) {
    const hits = hitLog.get(addr);
    const hitStr = hits.length > 0 ? `YES (${hits.length}x)` : 'NO';
    const stepsStr = hits.length > 0 ? hits.slice(0, 5).join(', ') + (hits.length > 5 ? '...' : '') : '-';
    rlog(`| ${hex(addr)} | ${label} | ${hitStr} | ${stepsStr} |`);
  }
  rlog('');

  rlog('### State Changes');
  rlog('');
  if (stateChanges.length === 0) {
    rlog('No state changes detected.');
  } else {
    rlog('| Step | PC | Changed | cxCurApp | cxMain | errNo | OP1 |');
    rlog('|------|----|---------|----------|--------|-------|-----|');
    for (const sc of stateChanges.slice(0, 30)) {
      rlog(`| ${sc.step} | ${hex(sc.pc)} | ${sc.changed.join(',')} | ${hex(sc.cxCurApp, 2)} | ${hex(sc.cxMain)} | ${hex(sc.errNo, 2)} | ${sc.op1} |`);
    }
    if (stateChanges.length > 30) rlog(`(${stateChanges.length} total changes, showing first 30)`);
  }
  rlog('');

  rlog('### First 50 Block PCs');
  rlog('');
  rlog('```text');
  for (const entry of firstPCs.slice(0, 50)) {
    const miss = entry.missing ? ' (MISSING BLOCK)' : '';
    rlog(`step=${entry.step} pc=${hex(entry.pc)} sp=${hex(entry.sp)}${miss}`);
  }
  rlog('```');
  rlog('');

  rlog('### Post-Run State');
  rlog('');
  rlog(`- cxCurApp: ${hex(mem[CX_CUR_APP_ADDR], 2)}`);
  rlog(`- cxMain: ${hex(read24(mem, CX_MAIN_ADDR))}`);
  rlog(`- errNo: ${hex(mem[ERR_NO_ADDR], 2)}`);
  rlog(`- OP1: ${hexBytes(mem, OP1_ADDR, 9)}`);
  rlog(`- begPC: ${hex(read24(mem, BEGPC_ADDR))}`);
  rlog(`- curPC: ${hex(read24(mem, CURPC_ADDR))}`);
  rlog(`- endPC: ${hex(read24(mem, ENDPC_ADDR))}`);
  rlog('');

  rlog('## Analysis');
  rlog('');

  const parseinpHit = (hitLog.get(0x099914)?.length ?? 0) > 0;
  const enterPathHit = (hitLog.get(0x0973c8)?.length ?? 0) > 0;
  const yieldHit = (hitLog.get(0x08bf22)?.length ?? 0) > 0;
  const ramClearHit = (hitLog.get(0x001881)?.length ?? 0) > 0;

  if (parseinpHit) {
    rlog('### Key Finding: Second-pass handler REACHES ParseInp');
    rlog('');
    rlog('The handler at 0x0585E9 successfully dispatches to ParseInp (0x099914),');
    rlog('confirming that this is the execution path for expression evaluation after');
    rlog('the first-pass (HomeHandler) sets up the context and yields.');
  } else {
    rlog('### Key Finding: Second-pass handler does NOT reach ParseInp');
    rlog('');
    rlog('The handler at 0x0585E9 does not reach ParseInp (0x099914) in 50K steps.');
    if (enterPathHit) {
      rlog('However, it DOES reach the ENTER key path (0x0973C8).');
    }
  }

  if (yieldHit) {
    rlog('');
    rlog('The handler calls yield (0x08BF22), indicating it returns control to CoorMon.');
  }

  if (ramClearHit) {
    rlog('');
    rlog('WARNING: RAM CLEAR (0x001881) was hit from the second-pass handler.');
  }

  rlog('');
  rlog('### Handler Purpose');
  rlog('');
  rlog('Based on static disassembly and runtime trace, 0x0585E9 appears to be:');

  // Try to determine handler purpose from CALL targets
  const hasKeyDispatch = secondPassCallTargets.some(ct => ct.target === 0x0973c8);
  const hasYieldCall = secondPassCallTargets.some(ct => ct.target === 0x08bf22);
  const hasParseinpCall = secondPassCallTargets.some(ct => ct.target === 0x099914);

  if (hasKeyDispatch || hasParseinpCall) {
    rlog('The **key dispatch / expression evaluation handler** that processes the ENTER key');
    rlog('and routes to ParseInp for expression parsing. This is the "action" handler that');
    rlog('actually processes user input, as opposed to HomeHandler (0x058241) which sets up');
    rlog('the display context.');
  } else if (hasYieldCall) {
    rlog('A handler that checks state and yields back to CoorMon. It may be a');
    rlog('"display update" or "idle" handler rather than the expression evaluator.');
  } else {
    rlog('The purpose could not be determined from CALL targets alone.');
    rlog('Further investigation of the disassembly and runtime trace is needed.');
  }

  rlog('');

  // Write report
  fs.writeFileSync(REPORT_PATH, report.join('\n') + '\n');
  log(`Report written: ${REPORT_PATH}`);
}

try {
  await main();
} catch (error) {
  const message = error?.stack || error?.message || String(error);
  console.error('FATAL:', message);
  process.exitCode = 1;
}
