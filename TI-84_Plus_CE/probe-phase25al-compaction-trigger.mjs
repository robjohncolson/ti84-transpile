#!/usr/bin/env node

/**
 * Phase 25AL: Trace buffer compaction trigger at 0x05E3A2
 *
 * Goal: Identify what CALLS 0x05E3A2 (the compaction entry that leads to
 * 0x05E836→0x0831A4 LDDR zeroing cxCurApp). Collect a full call-stack trace
 * from step 18000-18500, monitor cxCurApp writes, disassemble 0x05E3A2.
 *
 * Uses the EXACT same seeding as probe-phase25ak-ramclear-trace.mjs.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase25al-compaction-trigger-report.md');

const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

// ---- Constants (copied from phase25ak) ----

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

const ERR_NO_ADDR = 0xd008df;
const ERR_SP_ADDR = 0xd008e0;

const BEGPC_ADDR = 0xd02317;
const CURPC_ADDR = 0xd0231a;
const ENDPC_ADDR = 0xd0231d;

const USERMEM_ADDR = 0xd1a881;

const MEMINIT_RET = 0x7ffff6;
const FAKE_RET = 0x7ffffe;
const ERR_CATCH_ADDR = 0x7ffffa;

const MEMINIT_BUDGET = 100000;
const COORMON_BUDGET = 25000;
const DEFAULT_MAX_LOOP_ITER = 8192;

const HOME_SCREEN_APP_ID = 0x40;
const K_ENTER = 0x05;
const SK_ENTER = 0x09;
const INPUT_TOKENS = Uint8Array.from([0x32, 0x70, 0x33, 0x3f]);

// Pre-yield IY addresses
const PREYIELD_IY82_ADDR = 0xd000d2;
const PREYIELD_IY20_ADDR = 0xd00094;
const PREYIELD_IY69_ADDR = 0xd000c5;
const PREYIELD_IY09_ADDR = 0xd00089;
const PREYIELD_IY08_ADDR = 0xd00088;
const PREYIELD_SCAN_RESULT_ADDR = 0xd0265b;
const PREYIELD_KEY_STATE_ADDR = 0xd02506;

// ---- Watched addresses ----
const WATCHED_PCS = new Map([
  [0x05E3A2, 'compaction_entry_05E3A2'],
  [0x05E836, 'edit_wrapper_05E836'],
  [0x0831A4, 'EditProg_0831A4'],
  [0x05E872, 'close_gate_05E872'],
  [0x05E820, 'BufToBtm_05E820'],
  [0x0585E9, 'second_pass_handler_0585E9'],
  [0x0973C8, 'ENTER_key_path_0973C8'],
  [0x08BF22, 'yield_mechanism_08BF22'],
]);

// Trace window
const TRACE_WINDOW_START = 18000;
const TRACE_WINDOW_END = 18500;

// ---- Utility functions ----

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

function clearBit(mem, addr, bit) {
  mem[addr] &= ~(1 << bit);
}

// ---- Boot & seeding (exact copy from phase25ak) ----

function createRuntime() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, 0x400000));
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;
  return { mem, peripherals, executor, cpu };
}

function coldBoot(executor, cpu, mem) {
  executor.runFrom(BOOT_ENTRY, 'z80', {
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

    return { steps, finalPc, finalMode, termination, loopsForced };
  } catch (error) {
    if (error?.isSentinel) {
      termination = error.termination;
      return { steps, finalPc: error.pc, finalMode, termination, loopsForced };
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
  mem.fill(0x00, CX_MAIN_ADDR, CX_TAIL_ADDR + 1);
  write24(mem, CX_MAIN_ADDR, HOME_HANDLER_ENTRY);
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

// ---- Disassembly helper ----

function disassembleRegion(startAddr, numBytes) {
  const rows = [];
  let pc = startAddr;
  const endAddr = startAddr + numBytes;
  let count = 0;

  while (pc < endAddr && count < 40) {
    const inst = decodeInstruction(romBytes, pc, 'adl');
    if (!inst || inst.length <= 0) {
      rows.push({ pc, bytes: hex(romBytes[pc], 2), text: `db ${hex(romBytes[pc], 2)}`, size: 1 });
      pc += 1;
    } else {
      const byteParts = [];
      for (let i = 0; i < inst.length; i++) byteParts.push((romBytes[pc + i] & 0xff).toString(16).padStart(2, '0'));
      rows.push({
        pc,
        bytes: byteParts.join(' '),
        text: formatInst(inst),
        size: inst.length,
        inst,
      });
      pc += inst.length;
    }
    count++;
  }

  return rows;
}

function formatInst(inst) {
  const d = (v) => (v >= 0 ? `+${v}` : `${v}`);
  const prefix = inst.modePrefix ? `${inst.modePrefix} ` : '';

  let text = inst.tag;
  switch (inst.tag) {
    case 'nop': text = 'nop'; break;
    case 'ret': text = 'ret'; break;
    case 'ret-conditional': text = `ret ${inst.condition}`; break;
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
    case 'ld-pair-imm': text = `ld ${inst.pair}, ${hex(inst.value)}`; break;
    case 'ld-pair-mem':
      text = inst.direction === 'to-mem'
        ? `ld (${hex(inst.addr)}), ${inst.pair}`
        : `ld ${inst.pair}, (${hex(inst.addr)})`;
      break;
    case 'ld-reg-imm': text = `ld ${inst.dest}, ${hex(inst.value, 2)}`; break;
    case 'ld-reg-reg': text = `ld ${inst.dest}, ${inst.src}`; break;
    case 'ld-reg-ind': text = `ld ${inst.dest}, (${inst.src})`; break;
    case 'ld-ind-reg': text = `ld (${inst.dest}), ${inst.src}`; break;
    case 'ld-reg-mem': text = `ld ${inst.dest}, (${hex(inst.addr)})`; break;
    case 'ld-mem-reg': text = `ld (${hex(inst.addr)}), ${inst.src}`; break;
    case 'ld-sp-pair': text = `ld sp, ${inst.src}`; break;
    case 'ld-reg-ixd': text = `ld ${inst.dest}, (${inst.indexRegister}${d(inst.displacement)})`; break;
    case 'ld-ixd-reg': text = `ld (${inst.indexRegister}${d(inst.displacement)}), ${inst.src}`; break;
    case 'ld-ixd-imm': text = `ld (${inst.indexRegister}${d(inst.displacement)}), ${hex(inst.value, 2)}`; break;
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
    case 'bit-set': text = `set ${inst.bit}, ${inst.reg}`; break;
    case 'ldir': text = 'ldir'; break;
    case 'lddr': text = 'lddr'; break;
    case 'ldi': text = 'ldi'; break;
    case 'ldd': text = 'ldd'; break;
    case 'cpir': text = 'cpir'; break;
    case 'cpdr': text = 'cpdr'; break;
    case 'neg': text = 'neg'; break;
    case 'cpl': text = 'cpl'; break;
    case 'ccf': text = 'ccf'; break;
    case 'scf': text = 'scf'; break;
    case 'daa': text = 'daa'; break;
    case 'rla': text = 'rla'; break;
    case 'rra': text = 'rra'; break;
    case 'rlca': text = 'rlca'; break;
    case 'rrca': text = 'rrca'; break;
    case 'ex-af': text = "ex af, af'"; break;
    case 'ex-de-hl': text = 'ex de, hl'; break;
    case 'exx': text = 'exx'; break;
    case 'ei': text = 'ei'; break;
    case 'di': text = 'di'; break;
    case 'halt': text = 'halt'; break;
    case 'im': text = `im ${inst.mode_num}`; break;
    case 'mlt': text = `mlt ${inst.reg}`; break;
    case 'lea': text = `lea ${inst.dest}, ${inst.base}${d(inst.displacement)}`; break;
    case 'rotate': text = `${inst.op} ${inst.reg}`; break;
    case 'rotate-ind': text = `${inst.op} (${inst.indirectRegister})`; break;
    case 'in-a-imm': text = `in a, (${hex(inst.port, 2)})`; break;
    case 'out-imm-a': text = `out (${hex(inst.port, 2)}), a`; break;
    case 'in-reg': text = `in ${inst.dest}, (c)`; break;
    case 'out-reg': text = `out (c), ${inst.src}`; break;
    case 'ld-i-a': text = 'ld i, a'; break;
    case 'ld-a-i': text = 'ld a, i'; break;
    case 'ld-r-a': text = 'ld r, a'; break;
    case 'ld-a-r': text = 'ld a, r'; break;
    case 'indexed-cb-bit': text = `bit ${inst.bit}, (${inst.indexRegister}${d(inst.displacement)})`; break;
    case 'indexed-cb-res': text = `res ${inst.bit}, (${inst.indexRegister}${d(inst.displacement)})`; break;
    case 'indexed-cb-set': text = `set ${inst.bit}, (${inst.indexRegister}${d(inst.displacement)})`; break;
    case 'indexed-cb-rotate': text = `${inst.op} (${inst.indexRegister}${d(inst.displacement)})`; break;
    case 'ex-sp-pair': text = `ex (sp), ${inst.pair}`; break;
    case 'bit-res-ind': text = `res ${inst.bit}, (${inst.indirectRegister})`; break;
    case 'bit-set-ind': text = `set ${inst.bit}, (${inst.indirectRegister})`; break;
    case 'tst-reg': text = `tst a, ${inst.reg}`; break;
    case 'tst-ind': text = 'tst a, (hl)'; break;
    case 'tst-imm': text = `tst a, ${hex(inst.value, 2)}`; break;
    case 'ld-mem-pair': text = `ld (${hex(inst.addr)}), ${inst.pair}`; break;
    case 'retn': text = 'retn'; break;
    case 'reti': text = 'reti'; break;
    default: text = inst.tag; break;
  }

  return `${prefix}${text}`;
}

// ---- Main ----

async function main() {
  const log = (line = '') => console.log(String(line));

  log('=== Phase 25AL: Buffer compaction trigger trace ===');
  log('');

  // Stage 0: Boot
  const runtime = createRuntime();
  const { mem, peripherals, executor, cpu } = runtime;

  log('--- Stage 0: Cold boot ---');
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

  // Stage 2: Seed state (exact copy from 25AK)
  log('');
  log('--- Stage 2: Seed state ---');
  seedManualCxContext(mem);
  seedPreYieldState(mem);
  seedKeyboard(mem, peripherals);
  seedParserInput(mem);
  log('cx, pre-yield, keyboard, parser state seeded.');
  log(`cxCurApp=${hex(mem[CX_CUR_APP_ADDR], 2)} cxMain=${hex(read24(mem, CX_MAIN_ADDR))}`);

  // Stage 3: CoorMon trace
  log('');
  log('--- Stage 3: CoorMon trace (25K steps) ---');

  prepareSeededCallState(cpu, mem, { a: 0, bc: 0, de: 0, hl: 0 });
  seedMinimalErrFrame(cpu, mem, FAKE_RET);

  const preCxCurApp = mem[CX_CUR_APP_ADDR] & 0xff;
  log(`Pre-run: cxCurApp=${hex(preCxCurApp, 2)}`);

  // Data collection structures
  const watchedHits = new Map(); // pc -> first step hit
  const traceWindow = [];       // steps 18000-18500
  const cxCurAppChanges = [];   // any step where cxCurApp transitions non-zero -> zero
  let lastCxCurApp = preCxCurApp;

  // Track caller of 0x05E3A2 — the block PC just before we see 0x05E3A2
  let prevBlockPc = null;
  let callerOf05E3A2 = null;
  let callerOf05E836 = null;
  let callerOf0831A4 = null;

  const run = runDirect(executor, COORMON_ENTRY, {
    maxSteps: COORMON_BUDGET,
    maxLoopIterations: DEFAULT_MAX_LOOP_ITER,
    sentinels: new Map([
      [FAKE_RET, 'return_hit'],
      [ERR_CATCH_ADDR, 'err_caught'],
      [0xffffff, 'missing_block_terminal'],
    ]),
    onBlock(pc, _mode, meta, stepNumber) {
      // Track watched PC hits
      if (WATCHED_PCS.has(pc) && !watchedHits.has(pc)) {
        watchedHits.set(pc, stepNumber);
      }

      // Track caller relationships
      if (pc === 0x05E3A2 && callerOf05E3A2 === null) {
        callerOf05E3A2 = { callerPc: prevBlockPc, step: stepNumber };
      }
      if (pc === 0x05E836 && callerOf05E836 === null) {
        callerOf05E836 = { callerPc: prevBlockPc, step: stepNumber };
      }
      if (pc === 0x0831A4 && callerOf0831A4 === null) {
        callerOf0831A4 = { callerPc: prevBlockPc, step: stepNumber };
      }

      // Collect trace window
      const isInCallChain = WATCHED_PCS.has(pc);
      if (stepNumber >= TRACE_WINDOW_START && stepNumber <= TRACE_WINDOW_END) {
        traceWindow.push({
          step: stepNumber,
          pc,
          sp: cpu.sp & 0xffffff,
          inChain: isInCallChain,
          label: WATCHED_PCS.get(pc) || null,
        });
      }

      // Monitor cxCurApp
      const curApp = mem[CX_CUR_APP_ADDR] & 0xff;
      if (lastCxCurApp !== 0 && curApp === 0) {
        cxCurAppChanges.push({
          step: stepNumber,
          pc,
          prevValue: lastCxCurApp,
          newValue: curApp,
        });
      }
      lastCxCurApp = curApp;

      prevBlockPc = pc;
    },
    onMissingBlock(pc, _mode, stepNumber) {
      if (WATCHED_PCS.has(pc) && !watchedHits.has(pc)) {
        watchedHits.set(pc, stepNumber);
      }
      if (stepNumber >= TRACE_WINDOW_START && stepNumber <= TRACE_WINDOW_END) {
        traceWindow.push({
          step: stepNumber,
          pc,
          sp: cpu.sp & 0xffffff,
          inChain: false,
          label: '(missing)',
        });
      }
      prevBlockPc = pc;
    },
  });

  log(`CoorMon: term=${run.termination} steps=${run.steps} finalPc=${hex(run.finalPc)} loopsForced=${run.loopsForced}`);

  // ---- Results: Watched PC hits ----
  log('');
  log('=== Watched PC Hits ===');
  for (const [pc, label] of WATCHED_PCS) {
    const step = watchedHits.get(pc);
    log(`  ${hex(pc)} (${label}): ${step !== undefined ? `first hit at step ${step}` : 'NOT HIT'}`);
  }

  // ---- Results: Caller relationships ----
  log('');
  log('=== Caller Analysis ===');
  if (callerOf05E3A2) {
    log(`  0x05E3A2 called from PC=${hex(callerOf05E3A2.callerPc)} at step ${callerOf05E3A2.step}`);
  } else {
    log('  0x05E3A2 was NOT reached');
  }
  if (callerOf05E836) {
    log(`  0x05E836 called from PC=${hex(callerOf05E836.callerPc)} at step ${callerOf05E836.step}`);
  } else {
    log('  0x05E836 was NOT reached');
  }
  if (callerOf0831A4) {
    log(`  0x0831A4 called from PC=${hex(callerOf0831A4.callerPc)} at step ${callerOf0831A4.step}`);
  } else {
    log('  0x0831A4 was NOT reached');
  }

  // ---- Results: cxCurApp changes ----
  log('');
  log('=== cxCurApp Non-Zero -> Zero Transitions ===');
  if (cxCurAppChanges.length === 0) {
    log('  No non-zero -> zero transitions observed');
  } else {
    for (const change of cxCurAppChanges) {
      log(`  step=${change.step} pc=${hex(change.pc)} prev=${hex(change.prevValue, 2)} new=${hex(change.newValue, 2)}`);
    }
  }

  // ---- Results: Trace window ----
  log('');
  log(`=== Trace Window (steps ${TRACE_WINDOW_START}-${TRACE_WINDOW_END}, ${traceWindow.length} blocks) ===`);
  for (const entry of traceWindow) {
    const marker = entry.inChain ? ' ***' : '';
    const labelStr = entry.label ? ` [${entry.label}]` : '';
    log(`  step=${entry.step} PC=${hex(entry.pc)} SP=${hex(entry.sp)}${labelStr}${marker}`);
  }

  // ---- Stage 4: Disassemble 0x05E3A2 ----
  log('');
  log('=== Disassembly of 0x05E3A2 (128 bytes, first ~20 instructions) ===');
  const disasmRows = disassembleRegion(0x05E3A2, 128);
  const shownRows = disasmRows.slice(0, 20);
  for (const row of shownRows) {
    log(`  ${hex(row.pc)}  ${row.bytes.padEnd(22)} ${row.text}`);
  }

  // Also disassemble the caller if we found one
  if (callerOf05E3A2 && callerOf05E3A2.callerPc) {
    log('');
    log(`=== Disassembly around caller ${hex(callerOf05E3A2.callerPc)} (64 bytes before + 32 bytes after) ===`);
    const callerStart = Math.max(0, callerOf05E3A2.callerPc - 64);
    const callerRows = disassembleRegion(callerStart, 96);
    for (const row of callerRows) {
      const marker = row.pc === callerOf05E3A2.callerPc ? ' <<<' : '';
      log(`  ${hex(row.pc)}  ${row.bytes.padEnd(22)} ${row.text}${marker}`);
    }
  }

  // ---- Stage 5: Write report ----
  log('');
  log('--- Writing report ---');

  const reportLines = [];
  reportLines.push('# Phase 25AL - Buffer Compaction Trigger Report');
  reportLines.push('');
  reportLines.push(`Generated: ${new Date().toISOString().slice(0, 10)}`);
  reportLines.push('');

  reportLines.push('## Objective');
  reportLines.push('');
  reportLines.push('Identify what triggers the buffer compaction at 0x05E3A2 that leads to');
  reportLines.push('0x05E836 -> 0x0831A4 (LDDR) zeroing cxCurApp at ~step 18282.');
  reportLines.push('');

  reportLines.push('## Setup');
  reportLines.push('');
  reportLines.push('Identical seeding to probe-phase25ak:');
  reportLines.push('- Cold boot + MEM_INIT');
  reportLines.push('- cx seed: cxMain=0x058241, cxCurApp=0x40, home-context callbacks');
  reportLines.push('- Pre-yield IY flags cleared');
  reportLines.push('- Keyboard: ENTER seeded');
  reportLines.push('- Parser: tokenized "2+3" at userMem');
  reportLines.push(`- CoorMon budget: ${COORMON_BUDGET} steps, maxLoopIterations=${DEFAULT_MAX_LOOP_ITER}`);
  reportLines.push('');

  reportLines.push('## Results');
  reportLines.push('');
  reportLines.push(`- CoorMon termination: ${run.termination}`);
  reportLines.push(`- Total steps: ${run.steps}`);
  reportLines.push(`- Final PC: ${hex(run.finalPc)}`);
  reportLines.push(`- Loops forced: ${run.loopsForced}`);
  reportLines.push('');

  reportLines.push('### Watched PC Hits');
  reportLines.push('');
  reportLines.push('| Address | Label | First Hit Step |');
  reportLines.push('|---------|-------|----------------|');
  for (const [pc, label] of WATCHED_PCS) {
    const step = watchedHits.get(pc);
    reportLines.push(`| ${hex(pc)} | ${label} | ${step !== undefined ? step : 'NOT HIT'} |`);
  }
  reportLines.push('');

  reportLines.push('### Caller Analysis');
  reportLines.push('');
  if (callerOf05E3A2) {
    reportLines.push(`- **0x05E3A2 (compaction entry)** called from PC=${hex(callerOf05E3A2.callerPc)} at step ${callerOf05E3A2.step}`);
  } else {
    reportLines.push('- **0x05E3A2 was NOT reached** in this run');
  }
  if (callerOf05E836) {
    reportLines.push(`- **0x05E836 (edit wrapper)** called from PC=${hex(callerOf05E836.callerPc)} at step ${callerOf05E836.step}`);
  } else {
    reportLines.push('- **0x05E836 was NOT reached**');
  }
  if (callerOf0831A4) {
    reportLines.push(`- **0x0831A4 (EditProg/LDDR)** called from PC=${hex(callerOf0831A4.callerPc)} at step ${callerOf0831A4.step}`);
  } else {
    reportLines.push('- **0x0831A4 was NOT reached**');
  }
  reportLines.push('');

  reportLines.push('### cxCurApp Zero Transitions');
  reportLines.push('');
  if (cxCurAppChanges.length === 0) {
    reportLines.push('No non-zero -> zero transitions observed.');
  } else {
    for (const change of cxCurAppChanges) {
      reportLines.push(`- step=${change.step} pc=${hex(change.pc)} prev=${hex(change.prevValue, 2)} -> ${hex(change.newValue, 2)}`);
    }
  }
  reportLines.push('');

  reportLines.push('### Trace Window (steps 18000-18500)');
  reportLines.push('');
  reportLines.push('```');
  for (const entry of traceWindow) {
    const marker = entry.inChain ? ' ***' : '';
    const labelStr = entry.label ? ` [${entry.label}]` : '';
    reportLines.push(`step=${entry.step} PC=${hex(entry.pc)} SP=${hex(entry.sp)}${labelStr}${marker}`);
  }
  reportLines.push('```');
  reportLines.push('');

  reportLines.push('### Disassembly of 0x05E3A2');
  reportLines.push('');
  reportLines.push('```text');
  for (const row of shownRows) {
    reportLines.push(`${hex(row.pc)}  ${row.bytes.padEnd(22)} ${row.text}`);
  }
  reportLines.push('```');
  reportLines.push('');

  if (callerOf05E3A2 && callerOf05E3A2.callerPc) {
    reportLines.push(`### Disassembly Around Caller (${hex(callerOf05E3A2.callerPc)})`);
    reportLines.push('');
    reportLines.push('```text');
    const callerStart = Math.max(0, callerOf05E3A2.callerPc - 64);
    const callerRows = disassembleRegion(callerStart, 96);
    for (const row of callerRows) {
      const marker = row.pc === callerOf05E3A2.callerPc ? ' <<<' : '';
      reportLines.push(`${hex(row.pc)}  ${row.bytes.padEnd(22)} ${row.text}${marker}`);
    }
    reportLines.push('```');
    reportLines.push('');
  }

  reportLines.push('## Analysis');
  reportLines.push('');

  if (callerOf05E3A2) {
    reportLines.push(`The compaction entry at 0x05E3A2 is reached from PC=${hex(callerOf05E3A2.callerPc)}.`);
    reportLines.push('');
    reportLines.push('The call chain that destroys cxCurApp is:');
    reportLines.push(`1. ${hex(callerOf05E3A2.callerPc)} -> 0x05E3A2 (compaction entry)`);
    if (callerOf05E836) {
      reportLines.push(`2. 0x05E3A2 -> ... -> 0x05E836 (edit wrapper, from PC=${hex(callerOf05E836.callerPc)})`);
    }
    if (callerOf0831A4) {
      reportLines.push(`3. 0x05E836 -> 0x0831A4 (EditProg/LDDR, from PC=${hex(callerOf0831A4.callerPc)})`);
    }
    reportLines.push('4. 0x0831A4 executes LDDR which sweeps through cx range as side effect');
  } else {
    reportLines.push('0x05E3A2 was NOT reached in 25K steps. The compaction may fire later,');
    reportLines.push('or the call chain may differ from the expected path.');
  }
  reportLines.push('');

  if (cxCurAppChanges.length > 0) {
    const firstZero = cxCurAppChanges[0];
    reportLines.push(`cxCurApp was zeroed at step ${firstZero.step} while executing PC=${hex(firstZero.pc)}.`);
    reportLines.push('');
  }

  reportLines.push('## Suggestions for Preventing cx-Zeroing');
  reportLines.push('');
  reportLines.push('1. **Pre-seed allocator state**: Set workspace pointers (tempMem, FPS, OPS, progPtr)');
  reportLines.push('   so the LDDR source/dest ranges do not overlap the cx block (0xD007CA-0xD007E1).');
  reportLines.push('2. **Skip the compaction call**: If the trigger is conditional (IY bit check),');
  reportLines.push('   seed the IY bit to skip the compaction path entirely.');
  reportLines.push('3. **Guard cx memory**: Snapshot cx before CoorMon and restore after the');
  reportLines.push('   compaction step is known to have passed.');
  reportLines.push('');

  fs.writeFileSync(REPORT_PATH, reportLines.join('\n') + '\n');
  log(`Report written: ${REPORT_PATH}`);
}

try {
  await main();
} catch (error) {
  const message = error?.stack || error?.message || String(error);
  console.error('FATAL:', message);
  process.exitCode = 1;
}
