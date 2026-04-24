#!/usr/bin/env node

/**
 * Phase 25AN: Workspace pointer overlap investigation.
 *
 * Part A: Run CoorMon with full ENTER-key seeding, 25K step budget.
 *         When PC enters the compaction area (0x05E3A0-0x05E840),
 *         dump all workspace pointers and the cx block to determine
 *         whether the LDDR block move overlaps the cx block.
 *
 * Part B: Static disassembly of 0x05840B and 0x058423 to determine
 *         whether compaction fires BEFORE or AFTER ParseInp on the
 *         ENTER path.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase25an-workspace-overlap-report.md');
const REPORT_TITLE = 'Phase 25AN - Workspace Pointer Overlap Investigation';

const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const MEM_SIZE = 0x1000000;
const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08c331;
const POST_INIT_ENTRY = 0x0802b2;
const STACK_RESET_TOP = 0xd1a87e;

const MEMINIT_ENTRY = 0x09dee0;
const COORMON_ENTRY = 0x08c331;
const HOME_HANDLER_ENTRY = 0x058241;

const IY_ADDR = 0xd00080;
const IX_ADDR = 0xd1a860;
const USERMEM_ADDR = 0xd1a881;

const OP1_ADDR = 0xd005f8;
const ERR_NO_ADDR = 0xd008df;
const ERR_SP_ADDR = 0xd008e0;

const CX_MAIN_ADDR = 0xd007ca;
const CX_PPUTAWAY_ADDR = 0xd007cd;
const CX_PUTAWAY_ADDR = 0xd007d0;
const CX_REDISP_ADDR = 0xd007d3;
const CX_ERROREP_ADDR = 0xd007d6;
const CX_SIZEWIND_ADDR = 0xd007d9;
const CX_PAGE_ADDR = 0xd007dc;
const CX_CUR_APP_ADDR = 0xd007e0;
const CX_CONTEXT_END_ADDR = 0xd007e1;

const BEGPC_ADDR = 0xd02317;
const CURPC_ADDR = 0xd0231a;
const ENDPC_ADDR = 0xd0231d;

// Keyboard / key dispatch addresses
const KBD_SCAN_CODE_ADDR = 0xd00587;
const KBD_KEY_ADDR = 0xd0058c;
const KBD_GETKY_ADDR = 0xd0058d;
const KEY_EVENT_ADDR = 0xd0146d;

// Pre-yield IY side-effect addresses
const PREYIELD_IY82_ADDR = 0xd000d2;
const PREYIELD_IY20_ADDR = 0xd00094;
const PREYIELD_IY69_ADDR = 0xd000c5;
const PREYIELD_IY09_ADDR = 0xd00089;
const PREYIELD_IY08_ADDR = 0xd00088;
const PREYIELD_SCAN_RESULT_ADDR = 0xd0265b;
const PREYIELD_KEY_STATE_ADDR = 0xd02506;

// Workspace pointers to dump
const IMATH_PTR1_ADDR = 0xd0066f;
const IMATH_PTR2_ADDR = 0xd00672;
const IMATH_PTR3_ADDR = 0xd00675;
const IMATH_PTR4_ADDR = 0xd00678;
const IMATH_PTR5_ADDR = 0xd0067b;
const ASM_DATA_PTR1_ADDR = 0xd0067e;
const ASM_DATA_PTR2_ADDR = 0xd00681;
const EDIT_SYM_ADDR = 0xd0244e;
const OPBASE_ADDR = 0xd02590;
const PTEMP_ADDR = 0xd0259a;
const PROGPTR_ADDR = 0xd0259d;

// Compaction area
const COMPACTION_START = 0x05e3a0;
const COMPACTION_END = 0x05e840;
const COMPACTION_CHAIN_START = 0x058423;

// Sentinel addresses
const MEMINIT_RET = 0x7ffff6;
const FAKE_RET = 0x7ffffe;
const ERR_CATCH_ADDR = 0x7ffffa;

// Budgets
const MEMINIT_BUDGET = 100000;
const COORMON_BUDGET = 25000;
const DEFAULT_MAX_LOOP_ITER = 8192;

// Seeds
const HOME_SCREEN_APP_ID = 0x40;
const K_ENTER = 0x05;
const SK_ENTER = 0x09;
const INPUT_TOKENS = Uint8Array.from([0x32, 0x70, 0x33, 0x3f]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function hex(value, width = 6) {
  if (value === undefined || value === null) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(v) {
  return '0x' + (v & 0xff).toString(16).padStart(2, '0');
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
  for (let i = 0; i < len; i++) {
    parts.push((mem[addr + i] & 0xff).toString(16).toUpperCase().padStart(2, '0'));
  }
  return parts.join(' ');
}

function clearBit(mem, addr, bit) {
  mem[addr] &= ~(1 << bit);
}

// ---------------------------------------------------------------------------
// Runtime setup (same as probe-phase25al)
// ---------------------------------------------------------------------------
function createRuntime() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, 0x400000));
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;
  return { mem, peripherals, executor, cpu };
}

function coldBoot(executor, cpu, mem) {
  const bootResult = executor.runFrom(BOOT_ENTRY, 'z80', {
    maxSteps: 20000,
    maxLoopIterations: 32,
  });

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
  cpu._iy = IY_ADDR;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xff, cpu.sp, cpu.sp + 3);

  executor.runFrom(POST_INIT_ENTRY, 'adl', {
    maxSteps: 100,
    maxLoopIterations: 32,
  });

  return bootResult;
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
  let missingBlockObserved = false;

  try {
    const result = executor.runFrom(entry, 'adl', {
      maxSteps: options.maxSteps ?? 100000,
      maxLoopIterations: options.maxLoopIterations ?? DEFAULT_MAX_LOOP_ITER,
      onLoopBreak(pc, mode, loopHitCount, fallthroughTarget) {
        loopsForced++;
        if (options.onLoopBreak) {
          options.onLoopBreak(pc & 0xffffff, mode, loopHitCount, fallthroughTarget);
        }
      },
      onBlock(pc, mode, meta, step) {
        const norm = pc & 0xffffff;
        const stepNumber = (step ?? 0) + 1;
        steps = Math.max(steps, stepNumber);
        finalPc = norm;
        finalMode = mode;

        if (options.onBlock) options.onBlock(norm, mode, meta, stepNumber);
        if (sentinelMap.has(norm)) throw makeSentinelError(sentinelMap.get(norm), norm);
      },
      onMissingBlock(pc, mode, step) {
        const norm = pc & 0xffffff;
        const stepNumber = (step ?? 0) + 1;
        steps = Math.max(steps, stepNumber);
        finalPc = norm;
        finalMode = mode;

        if (options.onMissingBlock) options.onMissingBlock(norm, mode, stepNumber);
        if (sentinelMap.has(norm)) throw makeSentinelError(sentinelMap.get(norm), norm);
        missingBlockObserved = true;
      },
      onDynamicTarget(target, mode, fromPc, step) {
        if (options.onDynamicTarget) {
          options.onDynamicTarget(target & 0xffffff, mode, fromPc & 0xffffff, (step ?? 0) + 1);
        }
      },
    });

    steps = Math.max(steps, result.steps ?? 0);
    finalPc = (result.lastPc ?? finalPc) & 0xffffff;
    finalMode = result.lastMode ?? finalMode;
    termination = result.termination ?? 'unknown';
    loopsForced = Math.max(loopsForced, result.loopsForced ?? 0);
    if ((result.missingBlocks?.length ?? 0) > 0 || termination === 'missing_block') {
      missingBlockObserved = true;
    }

    return { steps, finalPc, finalMode, termination, loopsForced, missingBlockObserved };
  } catch (error) {
    if (error?.isSentinel) {
      return {
        steps,
        finalPc: error.pc,
        finalMode,
        termination: error.termination,
        loopsForced,
        missingBlockObserved,
      };
    }
    throw error;
  }
}

function runMemInit(runtime) {
  const { mem, cpu, executor } = runtime;
  prepareCallState(cpu, mem);
  cpu.a = 0x00;
  cpu.bc = 0;
  cpu.de = 0;
  cpu.hl = 0;
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEMINIT_RET);
  return runDirect(executor, MEMINIT_ENTRY, {
    maxSteps: MEMINIT_BUDGET,
    sentinels: new Map([
      [MEMINIT_RET, 'return_hit'],
      [0xffffff, 'missing_block_terminal'],
    ]),
  });
}

// ---------------------------------------------------------------------------
// Seeding (same as probe-phase25al and probe-phase25am)
// ---------------------------------------------------------------------------
function seedCxContext(mem) {
  mem.fill(0x00, CX_MAIN_ADDR, CX_CONTEXT_END_ADDR + 1);
  write24(mem, CX_MAIN_ADDR, HOME_HANDLER_ENTRY);
  write24(mem, CX_PPUTAWAY_ADDR, 0x058b19);
  write24(mem, CX_PUTAWAY_ADDR, 0x058b7e);
  write24(mem, CX_REDISP_ADDR, 0x0582bc);
  write24(mem, CX_ERROREP_ADDR, 0x058ba9);
  write24(mem, CX_SIZEWIND_ADDR, 0x058c01);
  write24(mem, CX_PAGE_ADDR, 0x000000);
  mem[CX_CUR_APP_ADDR] = HOME_SCREEN_APP_ID;
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

function seedKeyDispatch(mem) {
  mem[KEY_EVENT_ADDR] = K_ENTER;
}

function seedMinimalErrFrame(cpu, mem) {
  cpu.sp = (cpu.sp - 3) & 0xffffff;
  write24(mem, cpu.sp, FAKE_RET);

  const errFrameBase = (cpu.sp - 6) & 0xffffff;
  mem.fill(0x00, errFrameBase, errFrameBase + 6);
  write24(mem, errFrameBase + 3, ERR_CATCH_ADDR);
  write24(mem, ERR_SP_ADDR, errFrameBase);
  mem[ERR_NO_ADDR] = 0x00;

  return {
    mainReturnSp: cpu.sp & 0xffffff,
    errFrameBase,
  };
}

// ---------------------------------------------------------------------------
// Workspace pointer dump
// ---------------------------------------------------------------------------
const WORKSPACE_POINTERS = [
  { name: 'iMathPtr1', addr: IMATH_PTR1_ADDR },
  { name: 'iMathPtr2', addr: IMATH_PTR2_ADDR },
  { name: 'iMathPtr3', addr: IMATH_PTR3_ADDR },
  { name: 'iMathPtr4', addr: IMATH_PTR4_ADDR },
  { name: 'iMathPtr5', addr: IMATH_PTR5_ADDR },
  { name: 'asm_data_ptr1', addr: ASM_DATA_PTR1_ADDR },
  { name: 'asm_data_ptr2', addr: ASM_DATA_PTR2_ADDR },
  { name: 'editSym', addr: EDIT_SYM_ADDR },
  { name: 'begPC', addr: BEGPC_ADDR },
  { name: 'curPC', addr: CURPC_ADDR },
  { name: 'endPC', addr: ENDPC_ADDR },
  { name: 'OPBase', addr: OPBASE_ADDR },
  { name: 'pTemp', addr: PTEMP_ADDR },
  { name: 'progPtr', addr: PROGPTR_ADDR },
];

function dumpWorkspacePointers(mem) {
  const result = {};
  for (const { name, addr } of WORKSPACE_POINTERS) {
    result[name] = read24(mem, addr);
  }
  return result;
}

function formatWorkspacePointers(ptrs) {
  return WORKSPACE_POINTERS.map(({ name }) => `${name}=${hex(ptrs[name])}`).join(' ');
}

function dumpCxBlock(mem) {
  return hexBytes(mem, CX_MAIN_ADDR, CX_CONTEXT_END_ADDR - CX_MAIN_ADDR + 1);
}

function checkCxOverlap(ptrs) {
  // Check if any workspace pointer defines a region that could overlap
  // the cx block (0xD007CA-0xD007E1).
  const cxStart = CX_MAIN_ADDR;
  const cxEnd = CX_CONTEXT_END_ADDR;
  const overlaps = [];

  for (const { name } of WORKSPACE_POINTERS) {
    const val = ptrs[name];
    if (val >= cxStart && val <= cxEnd) {
      overlaps.push(`${name}=${hex(val)} is INSIDE cx block`);
    }
    if (val > 0xd00000 && val < cxEnd + 0x100) {
      overlaps.push(`${name}=${hex(val)} is NEAR cx block (cx: ${hex(cxStart)}-${hex(cxEnd)})`);
    }
  }

  return overlaps;
}

// ---------------------------------------------------------------------------
// Part B: Static disassembly
// ---------------------------------------------------------------------------
function formatInstruction(inst) {
  const prefix = inst.modePrefix ? `${inst.modePrefix} ` : '';
  const t = inst.tag;
  const disp = (d) => (d >= 0 ? `+${d}` : `${d}`);
  let text = t;

  switch (t) {
    case 'nop': text = 'nop'; break;
    case 'halt': text = 'halt'; break;
    case 'di': text = 'di'; break;
    case 'ei': text = 'ei'; break;
    case 'ret': text = 'ret'; break;
    case 'ret-conditional': text = `ret ${inst.condition}`; break;
    case 'retn': text = 'retn'; break;
    case 'reti': text = 'reti'; break;
    case 'push': text = `push ${inst.pair}`; break;
    case 'pop': text = `pop ${inst.pair}`; break;
    case 'call': text = `call ${hex(inst.target)}`; break;
    case 'call-conditional': text = `call ${inst.condition}, ${hex(inst.target)}`; break;
    case 'jp': text = `jp ${hex(inst.target)}`; break;
    case 'jp-conditional': text = `jp ${inst.condition}, ${hex(inst.target)}`; break;
    case 'jp-indirect': text = `jp (${inst.indirectRegister})`; break;
    case 'jr': text = `jr ${hex(inst.target)}`; break;
    case 'jr-conditional': text = `jr ${inst.condition}, ${hex(inst.target)}`; break;
    case 'djnz': text = `djnz ${hex(inst.target)}`; break;
    case 'rst': text = `rst ${hexByte(inst.target)}`; break;
    case 'ld-pair-imm': text = `ld ${inst.pair}, ${hex(inst.value)}`; break;
    case 'ld-pair-mem': text = `ld ${inst.pair}, (${hex(inst.addr)})`; break;
    case 'ld-mem-pair': text = `ld (${hex(inst.addr)}), ${inst.pair}`; break;
    case 'ld-reg-imm': text = `ld ${inst.dest}, ${hexByte(inst.value)}`; break;
    case 'ld-reg-reg': text = `ld ${inst.dest}, ${inst.src}`; break;
    case 'ld-reg-ind': text = `ld ${inst.dest}, (${inst.src})`; break;
    case 'ld-ind-reg': text = `ld (${inst.dest}), ${inst.src}`; break;
    case 'ld-ind-imm': text = `ld (hl), ${hexByte(inst.value)}`; break;
    case 'ld-reg-mem': text = `ld ${inst.dest}, (${hex(inst.addr)})`; break;
    case 'ld-mem-reg': text = `ld (${hex(inst.addr)}), ${inst.src}`; break;
    case 'ld-reg-ixd': text = `ld ${inst.dest}, (${inst.indexRegister}${disp(inst.displacement)})`; break;
    case 'ld-ixd-reg': text = `ld (${inst.indexRegister}${disp(inst.displacement)}), ${inst.src}`; break;
    case 'ld-ixd-imm': text = `ld (${inst.indexRegister}${disp(inst.displacement)}), ${hexByte(inst.value)}`; break;
    case 'ld-special': text = `ld ${inst.dest}, ${inst.src}`; break;
    case 'ld-sp-hl': text = 'ld sp, hl'; break;
    case 'ld-sp-pair': text = `ld sp, ${inst.pair}`; break;
    case 'ld-mb-a': text = 'ld mb, a'; break;
    case 'ld-a-mb': text = 'ld a, mb'; break;
    case 'alu-imm': text = `${inst.op} ${hexByte(inst.value)}`; break;
    case 'alu-reg': text = `${inst.op} ${inst.src}`; break;
    case 'alu-ixd': text = `${inst.op} (${inst.indexRegister}${disp(inst.displacement)})`; break;
    case 'inc-pair': text = `inc ${inst.pair}`; break;
    case 'dec-pair': text = `dec ${inst.pair}`; break;
    case 'inc-reg': text = `inc ${inst.reg}`; break;
    case 'dec-reg': text = `dec ${inst.reg}`; break;
    case 'add-pair': text = `add ${inst.dest}, ${inst.src}`; break;
    case 'adc-pair': text = `adc hl, ${inst.src}`; break;
    case 'sbc-pair': text = `sbc hl, ${inst.src}`; break;
    case 'im': text = `im ${inst.value}`; break;
    case 'exx': text = 'exx'; break;
    case 'ex-af': text = "ex af, af'"; break;
    case 'ex-de-hl': text = 'ex de, hl'; break;
    case 'ex-sp-hl': text = 'ex (sp), hl'; break;
    case 'ex-sp-pair': text = `ex (sp), ${inst.pair}`; break;
    case 'neg': text = 'neg'; break;
    case 'ldi': text = 'ldi'; break;
    case 'ldd': text = 'ldd'; break;
    case 'ldir': text = 'ldir'; break;
    case 'lddr': text = 'lddr'; break;
    case 'cpi': text = 'cpi'; break;
    case 'cpd': text = 'cpd'; break;
    case 'cpir': text = 'cpir'; break;
    case 'cpdr': text = 'cpdr'; break;
    case 'bit-test': text = `bit ${inst.bit}, ${inst.reg}`; break;
    case 'bit-test-ind': text = `bit ${inst.bit}, (hl)`; break;
    case 'bit-res': text = `res ${inst.bit}, ${inst.reg}`; break;
    case 'bit-res-ind': text = `res ${inst.bit}, (hl)`; break;
    case 'bit-set': text = `set ${inst.bit}, ${inst.reg}`; break;
    case 'bit-set-ind': text = `set ${inst.bit}, (hl)`; break;
    case 'rotate-reg': text = `${inst.op} ${inst.reg}`; break;
    case 'rotate-ind': text = `${inst.op} (hl)`; break;
    case 'rlca': text = 'rlca'; break;
    case 'rrca': text = 'rrca'; break;
    case 'rla': text = 'rla'; break;
    case 'rra': text = 'rra'; break;
    case 'daa': text = 'daa'; break;
    case 'cpl': text = 'cpl'; break;
    case 'scf': text = 'scf'; break;
    case 'ccf': text = 'ccf'; break;
    case 'out-imm': text = `out (${hexByte(inst.port)}), a`; break;
    case 'in-imm': text = `in a, (${hexByte(inst.port)})`; break;
    case 'out-reg': text = `out (c), ${inst.reg}`; break;
    case 'in-reg': text = `in ${inst.reg}, (c)`; break;
    case 'in0': text = `in0 ${inst.reg}, (${hexByte(inst.port)})`; break;
    case 'out0': text = `out0 (${hexByte(inst.port)}), ${inst.reg}`; break;
    case 'mlt': text = `mlt ${inst.reg}`; break;
    case 'lea': text = `lea ${inst.dest}, ${inst.base}${disp(inst.displacement)}`; break;
    case 'ld-pair-indexed': text = `ld ${inst.pair}, (${inst.indexRegister}${disp(inst.displacement)})`; break;
    case 'ld-indexed-pair': text = `ld (${inst.indexRegister}${disp(inst.displacement)}), ${inst.pair}`; break;
    case 'tst-reg': text = `tst a, ${inst.reg}`; break;
    case 'tst-ind': text = 'tst a, (hl)'; break;
    case 'tst-imm': text = `tst a, ${hexByte(inst.value)}`; break;
    case 'tstio': text = `tstio ${hexByte(inst.value)}`; break;
    case 'slp': text = 'slp'; break;
    case 'stmix': text = 'stmix'; break;
    case 'rsmix': text = 'rsmix'; break;
    case 'rrd': text = 'rrd'; break;
    case 'rld': text = 'rld'; break;
    case 'ini': text = 'ini'; break;
    case 'outi': text = 'outi'; break;
    case 'ind': text = 'ind'; break;
    case 'outd': text = 'outd'; break;
    case 'inir': text = 'inir'; break;
    case 'otir': text = 'otir'; break;
    case 'indr': text = 'indr'; break;
    case 'otdr': text = 'otdr'; break;
    default: text = `[${t}]`; break;
  }

  return prefix + text;
}

function disassembleLinear(startPc, maxBytes = 64, stopAtRet = true) {
  const rows = [];
  let pc = startPc;
  const end = startPc + maxBytes;

  while (pc < end) {
    const inst = decodeInstruction(romBytes, pc, 'adl');
    const rawBytes = Array.from(
      romBytes.slice(inst.pc, inst.pc + inst.length),
      (v) => v.toString(16).padStart(2, '0'),
    ).join(' ');

    rows.push({
      pc: inst.pc,
      bytes: rawBytes,
      dasm: formatInstruction(inst),
      inst,
    });

    pc += inst.length;

    if (stopAtRet) {
      if (inst.tag === 'ret' || inst.tag === 'reti' || inst.tag === 'retn') break;
      if (inst.tag === 'jp' || inst.tag === 'jp-indirect') break;
    }
  }

  return rows;
}

function formatDisasmTable(rows) {
  const lines = ['| Address | Bytes | Instruction |', '|---------|-------|-------------|'];
  for (const row of rows) {
    lines.push(`| ${hex(row.pc)} | ${row.bytes} | ${row.dasm} |`);
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Part A: CoorMon trace with compaction detection
// ---------------------------------------------------------------------------
function runCoorMonWithCompactionWatch(runtime, log) {
  const { mem, cpu, executor } = runtime;

  prepareCallState(cpu, mem);
  const errFrame = seedMinimalErrFrame(cpu, mem);

  // Capture pre-CoorMon workspace pointers
  const preWorkspace = dumpWorkspacePointers(mem);
  const preCx = dumpCxBlock(mem);

  let compactionDetected = false;
  let compactionStep = -1;
  let compactionPc = -1;
  let compactionWorkspace = null;
  let compactionCxBlock = null;

  // Track key addresses
  const addressHits = new Map();
  const WATCHED = [
    0x058241, // HomeHandler
    0x0585e9, // second-pass ENTER handler
    0x05840b, // step 23 setup helper
    0x058423, // compaction chain start
    0x05e3a2, // compaction entry
    0x05e7f7, // compaction mid
    0x07ff7b, // compaction mid
    0x08384f, // compaction mid
    0x05e836, // compaction mid
    0x0831a4, // LDDR cx-zeroing
    0x099211, // expression evaluation entry
    0x099914, // ParseInp
    0x0973c8, // ENTER key path
  ];
  for (const addr of WATCHED) addressHits.set(addr, []);

  const run = runDirect(executor, COORMON_ENTRY, {
    maxSteps: COORMON_BUDGET,
    maxLoopIterations: DEFAULT_MAX_LOOP_ITER,
    sentinels: new Map([
      [FAKE_RET, 'return_hit'],
      [ERR_CATCH_ADDR, 'err_caught'],
      [0xffffff, 'missing_block_terminal'],
    ]),
    onBlock(pc, _mode, _meta, stepNumber) {
      // Record hits for watched addresses
      if (addressHits.has(pc)) {
        const hits = addressHits.get(pc);
        if (hits.length < 16) hits.push(stepNumber);
      }

      // Check for compaction area entry
      if (!compactionDetected && pc >= COMPACTION_START && pc <= COMPACTION_END) {
        compactionDetected = true;
        compactionStep = stepNumber;
        compactionPc = pc;
        compactionWorkspace = dumpWorkspacePointers(mem);
        compactionCxBlock = dumpCxBlock(mem);
        log(`COMPACTION DETECTED at step ${stepNumber}, PC=${hex(pc)}`);
        log(`  workspace: ${formatWorkspacePointers(compactionWorkspace)}`);
        log(`  cx block: [${compactionCxBlock}]`);
      }

      // Also detect the compaction chain start (0x058423)
      if (pc === COMPACTION_CHAIN_START && !compactionDetected) {
        log(`COMPACTION CHAIN START at step ${stepNumber}, PC=${hex(pc)}`);
        const ws = dumpWorkspacePointers(mem);
        const cx = dumpCxBlock(mem);
        log(`  workspace: ${formatWorkspacePointers(ws)}`);
        log(`  cx block: [${cx}]`);
      }
    },
    onMissingBlock(pc, _mode, stepNumber) {
      if (addressHits.has(pc)) {
        const hits = addressHits.get(pc);
        if (hits.length < 16) hits.push(stepNumber);
      }
      log(`missing block: step=${stepNumber} pc=${hex(pc)}`);
    },
  });

  const postWorkspace = dumpWorkspacePointers(mem);
  const postCx = dumpCxBlock(mem);

  return {
    run,
    errFrame,
    preWorkspace,
    preCx,
    postWorkspace,
    postCx,
    compactionDetected,
    compactionStep,
    compactionPc,
    compactionWorkspace,
    compactionCxBlock,
    addressHits,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const transcript = [];
  const log = (line = '') => {
    const text = String(line);
    transcript.push(text);
    console.log(text);
  };

  log('=== Phase 25AN: Workspace Pointer Overlap Investigation ===');
  log('');

  // ---- Boot ----
  const runtime = createRuntime();
  const { mem, peripherals } = runtime;

  const bootResult = coldBoot(runtime.executor, runtime.cpu, mem);
  log(`boot: steps=${bootResult.steps} term=${bootResult.termination}`);

  // ---- MEM_INIT ----
  const memInit = runMemInit(runtime);
  log(`MEM_INIT: term=${memInit.termination} steps=${memInit.steps} finalPc=${hex(memInit.finalPc)}`);

  if (memInit.termination !== 'return_hit') {
    log('ERROR: MEM_INIT did not return');
    writeFailureReport('MEM_INIT did not return', transcript);
    return;
  }

  // ---- Seed state ----
  log('');
  log('=== Seeding State ===');
  seedCxContext(mem);
  seedPreYieldState(mem);
  seedKeyboard(mem, peripherals);
  seedParserInput(mem);
  seedKeyDispatch(mem);

  const preSeedWorkspace = dumpWorkspacePointers(mem);
  const preSeedCx = dumpCxBlock(mem);
  log(`pre-CoorMon workspace: ${formatWorkspacePointers(preSeedWorkspace)}`);
  log(`pre-CoorMon cx block: [${preSeedCx}]`);

  // ---- Part A: CoorMon with compaction watch ----
  log('');
  log('=== Part A: CoorMon Trace (budget=25000) ===');
  const trace = runCoorMonWithCompactionWatch(runtime, log);

  log('');
  log(`CoorMon: term=${trace.run.termination} steps=${trace.run.steps} finalPc=${hex(trace.run.finalPc)} loopsForced=${trace.run.loopsForced}`);
  log(`compaction detected: ${trace.compactionDetected}`);
  if (trace.compactionDetected) {
    log(`compaction step: ${trace.compactionStep}`);
    log(`compaction PC: ${hex(trace.compactionPc)}`);
    log(`workspace at compaction: ${formatWorkspacePointers(trace.compactionWorkspace)}`);
    log(`cx block at compaction: [${trace.compactionCxBlock}]`);
    const overlaps = checkCxOverlap(trace.compactionWorkspace);
    if (overlaps.length > 0) {
      log('OVERLAP DETECTED:');
      for (const o of overlaps) log(`  ${o}`);
    } else {
      log('No workspace pointer overlaps the cx block.');
    }
  }
  log(`post-CoorMon workspace: ${formatWorkspacePointers(trace.postWorkspace)}`);
  log(`post-CoorMon cx block: [${trace.postCx}]`);

  log('');
  log('Address hit summary:');
  for (const [addr, hits] of trace.addressHits) {
    const label = {
      0x058241: 'HomeHandler',
      0x0585e9: 'second-pass ENTER handler',
      0x05840b: 'step 23 setup helper',
      0x058423: 'compaction chain start',
      0x05e3a2: 'compaction entry',
      0x05e7f7: 'compaction mid',
      0x07ff7b: 'compaction mid',
      0x08384f: 'compaction mid',
      0x05e836: 'compaction mid',
      0x0831a4: 'LDDR cx-zeroing',
      0x099211: 'expression evaluation',
      0x099914: 'ParseInp',
      0x0973c8: 'ENTER key path',
    }[addr] || '?';
    log(`  ${hex(addr)} ${label}: ${hits.length > 0 ? hits.join(', ') : 'not hit'}`);
  }

  // ---- Part B: Static disassembly ----
  log('');
  log('=== Part B: Static Disassembly ===');

  log('');
  log('Disassembly of 0x05840B (step 23 setup helper):');
  const disasm05840B = disassembleLinear(0x05840b, 80, false);
  for (const row of disasm05840B) {
    log(`  ${hex(row.pc)}: ${row.bytes.padEnd(20)} ${row.dasm}`);
  }

  log('');
  log('Disassembly of 0x058423 (compaction chain start):');
  const disasm058423 = disassembleLinear(0x058423, 80, false);
  for (const row of disasm058423) {
    log(`  ${hex(row.pc)}: ${row.bytes.padEnd(20)} ${row.dasm}`);
  }

  // Check if 0x05840B calls or jumps to 0x058423
  const calls05840BTo058423 = disasm05840B.some(
    (row) => (row.inst.tag === 'call' || row.inst.tag === 'jp') && row.inst.target === 0x058423
  );
  const callsCond05840BTo058423 = disasm05840B.some(
    (row) => (row.inst.tag === 'call-conditional' || row.inst.tag === 'jp-conditional') && row.inst.target === 0x058423
  );

  log('');
  if (calls05840BTo058423) {
    log('FOUND: 0x05840B directly calls/jumps to 0x058423 (compaction chain start)');
  } else if (callsCond05840BTo058423) {
    log('FOUND: 0x05840B conditionally calls/jumps to 0x058423 (compaction chain start)');
  } else {
    log('NOT FOUND: 0x05840B does NOT directly call/jump to 0x058423 in the disassembled range');
  }

  // Also disassemble 0x058618 to see if it calls 0x058423
  log('');
  log('Disassembly of 0x058618 (ENTER handler context):');
  const disasm058618 = disassembleLinear(0x058618, 60, false);
  for (const row of disasm058618) {
    log(`  ${hex(row.pc)}: ${row.bytes.padEnd(20)} ${row.dasm}`);
  }

  const calls058618To058423 = disasm058618.some(
    (row) => (row.inst.tag === 'call' || row.inst.tag === 'jp' || row.inst.tag === 'call-conditional' || row.inst.tag === 'jp-conditional') && row.inst.target === 0x058423
  );

  if (calls058618To058423) {
    log('FOUND: 0x058618 references 0x058423');
  } else {
    log('NOT FOUND: 0x058618 does NOT reference 0x058423 in the disassembled range');
  }

  // Check if 0x058423 is called from the ENTER path before ParseInp
  // by looking at step ordering
  const step058423 = trace.addressHits.get(0x058423);
  const step099211 = trace.addressHits.get(0x099211);
  const step099914 = trace.addressHits.get(0x099914);

  log('');
  log('=== Timing Analysis ===');
  if (step058423.length > 0 && step099914.length > 0) {
    if (step058423[0] < step099914[0]) {
      log(`Compaction (0x058423) fires at step ${step058423[0]} BEFORE ParseInp at step ${step099914[0]}`);
    } else {
      log(`Compaction (0x058423) fires at step ${step058423[0]} AFTER ParseInp at step ${step099914[0]}`);
    }
  } else if (step058423.length > 0) {
    log(`Compaction (0x058423) fires at step ${step058423[0]} but ParseInp was not reached`);
  } else if (step099914.length > 0) {
    log(`ParseInp fires at step ${step099914[0]} but compaction (0x058423) was not reached`);
  } else {
    log('Neither compaction nor ParseInp was reached in this run');
  }

  // ---- Write report ----
  writeReport({
    transcript,
    memInit,
    trace,
    disasm05840B,
    disasm058423,
    disasm058618,
    calls05840BTo058423,
    callsCond05840BTo058423,
    calls058618To058423,
    preSeedWorkspace,
    preSeedCx,
  });

  log('');
  log(`report written: ${REPORT_PATH}`);
}

function writeReport(details) {
  const { trace } = details;
  const lines = [];

  lines.push(`# ${REPORT_TITLE}`);
  lines.push('');
  lines.push('## Date');
  lines.push('');
  lines.push(new Date().toISOString().slice(0, 10));
  lines.push('');

  lines.push('## Objective');
  lines.push('');
  lines.push('1. Dump workspace pointers (iMathPtr1-5, asm_data_ptr1-2, editSym, begPC, curPC, endPC, OPBase, pTemp, progPtr) at the moment compaction fires, to determine whether the LDDR block move region overlaps the cx block (0xD007CA-0xD007E1).');
  lines.push('2. Statically disassemble 0x05840B and 0x058423 to determine if compaction is called from the ENTER path and whether it fires before or after ParseInp.');
  lines.push('');

  lines.push('## Setup');
  lines.push('');
  lines.push('- Cold boot -> kernel init -> post-init -> MEM_INIT');
  lines.push('- Timer IRQs disabled');
  lines.push('- cx seed: cxMain=0x058241, cxCurApp=0x40');
  lines.push('- Keyboard: ENTER via key matrix + kbdKey + kbdGetKy + kbdScanCode + 0xD0146D');
  lines.push('- Parser: tokenized "2+3" at userMem');
  lines.push(`- CoorMon budget: ${COORMON_BUDGET} steps`);
  lines.push('');

  lines.push('## Part A: Workspace Pointer Dump');
  lines.push('');
  lines.push(`### Pre-CoorMon State`);
  lines.push('');
  lines.push(`Workspace pointers: ${formatWorkspacePointers(details.preSeedWorkspace)}`);
  lines.push(`cx block: [${details.preSeedCx}]`);
  lines.push('');

  lines.push('### CoorMon Result');
  lines.push('');
  lines.push(`- Termination: \`${trace.run.termination}\``);
  lines.push(`- Steps: \`${trace.run.steps}\``);
  lines.push(`- Final PC: \`${hex(trace.run.finalPc)}\``);
  lines.push(`- Loops forced: \`${trace.run.loopsForced}\``);
  lines.push(`- Missing block: \`${trace.run.missingBlockObserved}\``);
  lines.push('');

  lines.push('### Compaction Detection');
  lines.push('');
  if (trace.compactionDetected) {
    lines.push(`**Compaction detected** at step ${trace.compactionStep}, PC=${hex(trace.compactionPc)}`);
    lines.push('');
    lines.push('Workspace pointers at compaction entry:');
    lines.push('');
    lines.push('| Pointer | Address | Value |');
    lines.push('|---------|---------|-------|');
    for (const { name, addr } of WORKSPACE_POINTERS) {
      lines.push(`| ${name} | ${hex(addr)} | ${hex(trace.compactionWorkspace[name])} |`);
    }
    lines.push('');
    lines.push(`cx block at compaction entry: \`[${trace.compactionCxBlock}]\``);
    lines.push('');

    const overlaps = checkCxOverlap(trace.compactionWorkspace);
    if (overlaps.length > 0) {
      lines.push('**Overlap analysis:**');
      for (const o of overlaps) lines.push(`- ${o}`);
    } else {
      lines.push('No workspace pointers overlap the cx block at compaction entry.');
    }
  } else {
    lines.push('Compaction was NOT detected within the step budget.');
  }
  lines.push('');

  lines.push('### Post-CoorMon State');
  lines.push('');
  lines.push(`Workspace pointers: ${formatWorkspacePointers(trace.postWorkspace)}`);
  lines.push(`cx block: [${trace.postCx}]`);
  lines.push('');

  lines.push('### Address Hit Summary');
  lines.push('');
  lines.push('| Address | Label | Hit Count | Steps |');
  lines.push('|---------|-------|-----------|-------|');
  const labels = {
    0x058241: 'HomeHandler',
    0x0585e9: 'second-pass ENTER handler',
    0x05840b: 'step 23 setup helper',
    0x058423: 'compaction chain start',
    0x05e3a2: 'compaction entry',
    0x05e7f7: 'compaction mid',
    0x07ff7b: 'compaction mid',
    0x08384f: 'compaction mid',
    0x05e836: 'compaction mid',
    0x0831a4: 'LDDR cx-zeroing',
    0x099211: 'expression evaluation',
    0x099914: 'ParseInp',
    0x0973c8: 'ENTER key path',
  };
  for (const [addr, hits] of trace.addressHits) {
    lines.push(`| ${hex(addr)} | ${labels[addr] || '?'} | ${hits.length} | ${hits.length > 0 ? hits.join(', ') : '-'} |`);
  }
  lines.push('');

  lines.push('## Part B: Static Disassembly');
  lines.push('');

  lines.push('### 0x05840B (step 23 setup helper)');
  lines.push('');
  lines.push(formatDisasmTable(details.disasm05840B));
  lines.push('');

  if (details.calls05840BTo058423) {
    lines.push('**Result: 0x05840B directly calls/jumps to 0x058423.**');
  } else if (details.callsCond05840BTo058423) {
    lines.push('**Result: 0x05840B conditionally calls/jumps to 0x058423.**');
  } else {
    lines.push('**Result: 0x05840B does NOT directly call/jump to 0x058423 in the disassembled range.**');
  }
  lines.push('');

  lines.push('### 0x058423 (compaction chain start)');
  lines.push('');
  lines.push(formatDisasmTable(details.disasm058423));
  lines.push('');

  lines.push('### 0x058618 (ENTER handler context)');
  lines.push('');
  lines.push(formatDisasmTable(details.disasm058618));
  lines.push('');

  if (details.calls058618To058423) {
    lines.push('**Result: 0x058618 references 0x058423.**');
  } else {
    lines.push('**Result: 0x058618 does NOT reference 0x058423 in the disassembled range.**');
  }
  lines.push('');

  lines.push('## Timing Analysis');
  lines.push('');
  const step058423 = trace.addressHits.get(0x058423);
  const step099914 = trace.addressHits.get(0x099914);
  if (step058423.length > 0 && step099914.length > 0) {
    if (step058423[0] < step099914[0]) {
      lines.push(`Compaction (0x058423) fires at step ${step058423[0]} **BEFORE** ParseInp at step ${step099914[0]}.`);
    } else {
      lines.push(`Compaction (0x058423) fires at step ${step058423[0]} **AFTER** ParseInp at step ${step099914[0]}.`);
    }
  } else if (step058423.length > 0) {
    lines.push(`Compaction (0x058423) fires at step ${step058423[0]} but ParseInp was not reached within the budget.`);
  } else if (step099914.length > 0) {
    lines.push(`ParseInp fires at step ${step099914[0]} but compaction (0x058423) was not reached.`);
  } else {
    lines.push('Neither compaction nor ParseInp was reached in this run.');
  }
  lines.push('');

  lines.push('## Console Output');
  lines.push('');
  lines.push('```text');
  lines.push(...details.transcript);
  lines.push('```');

  fs.writeFileSync(REPORT_PATH, `${lines.join('\n')}\n`);
}

function writeFailureReport(errorText, transcript) {
  const lines = [
    `# ${REPORT_TITLE} FAILED`,
    '',
    '## Console Output',
    '',
    '```text',
    ...transcript,
    '```',
    '',
    '## Error',
    '',
    '```text',
    ...String(errorText).split(/\r?\n/),
    '```',
  ];
  fs.writeFileSync(REPORT_PATH, `${lines.join('\n')}\n`);
}

try {
  await main();
} catch (error) {
  const message = error?.stack || error?.message || String(error);
  console.error(message);
  writeFailureReport(message, []);
  process.exitCode = 1;
}
