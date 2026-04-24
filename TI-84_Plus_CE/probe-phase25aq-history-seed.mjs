#!/usr/bin/env node

/**
 * Phase 25AQ: seed history buffer and test history-recall path to ParseInp.
 *
 * Part A: Disassemble 0x092294-0x0922C0 and sub-functions at
 *         0x092FDD, 0x092FCB, 0x092FB6 to understand the history entry
 *         read path (LDIR source/dest/count computation).
 *
 * Part B: Cold boot + MEM_INIT, seed a minimal history entry at 0xD0150B,
 *         set numLastEntries=1, run the ENTER handler at 0x0585E9, and
 *         track whether execution reaches ParseInp at 0x099914.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase25aq-history-seed-report.md');
const REPORT_TITLE = 'Phase 25AQ - History Buffer Seed + Recall Path to ParseInp';

const rom = readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

// ── Constants ──

const MEM_SIZE = 0x1000000;
const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08c331;
const POST_INIT_ENTRY = 0x0802b2;
const STACK_RESET_TOP = 0xd1a87e;

const MEMINIT_ENTRY = 0x09dee0;
const MEMINIT_RET = 0xfffff6;
const FAKE_RET = 0xfffffe;
const DEFAULT_MAX_LOOP_ITER = 8192;

const IY_ADDR = 0xd00080;
const IX_ADDR = 0xd1a860;
const USERMEM_ADDR = 0xd1a881;

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

const NUM_LAST_ENTRIES_ADDR = 0xd01d0b;
const HISTORY_BUF_START = 0xd0150b;
const HISTORY_END_PTR_ADDR = 0xd01508;

const HOME_SCREEN_MAIN_HANDLER = 0x058241;
const HOME_SCREEN_APP_ID = 0x40;
const K_ENTER = 0x05;
const SECOND_PASS_ENTRY = 0x0585e9;

const COMMON_TAIL_PC = 0x058693;
const PARSEINP_CALL_SITE = 0x0586e3;
const TRAMPOLINE_PC = 0x099910;
const PARSEINP_PC = 0x099914;
const HISTORY_MANAGER_PC = 0x0921cb;

const OP1_ADDR = 0xd005f8;

const POP_ERROR_HANDLER = 0x061dd1;

// Disassembly ranges
const DISASM_RANGES = [
  { label: 'History entry read path', start: 0x092294, end: 0x0922c0 },
  { label: 'Sub-function 0x092FDD', start: 0x092fdd, end: 0x092ffd },
  { label: 'Sub-function 0x092FCB', start: 0x092fcb, end: 0x092fdd },
  { label: 'Sub-function 0x092FB6', start: 0x092fb6, end: 0x092fcb },
];

// Token data for "2+3\n"
const INPUT_TOKENS = Uint8Array.from([0x72, 0x70, 0x73, 0x3f]);

// ── Helpers ──

function hex(value, width = 6) {
  if (value === undefined || value === null) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return `0x${(value & 0xff).toString(16).toUpperCase().padStart(2, '0')}`;
}

function read24(mem, addr) {
  return ((mem[addr] & 0xff) | ((mem[addr + 1] & 0xff) << 8) | ((mem[addr + 2] & 0xff) << 16)) >>> 0;
}

function write24(mem, addr, value) {
  mem[addr] = value & 0xff;
  mem[addr + 1] = (value >>> 8) & 0xff;
  mem[addr + 2] = (value >>> 16) & 0xff;
}

function write16(mem, addr, value) {
  mem[addr] = value & 0xff;
  mem[addr + 1] = (value >>> 8) & 0xff;
}

function hexBytes(mem, addr, len) {
  const parts = [];
  for (let i = 0; i < len; i += 1) {
    parts.push((mem[addr + i] & 0xff).toString(16).toUpperCase().padStart(2, '0'));
  }
  return parts.join(' ');
}

function hexArray(bytes) {
  return Array.from(bytes, (b) => (b & 0xff).toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

// ── Disassembly formatting ──

function formatInstruction(inst) {
  const prefix = inst.modePrefix ? `${inst.modePrefix} ` : '';
  let text = inst.tag;

  switch (inst.tag) {
    case 'push': text = `push ${inst.pair}`; break;
    case 'pop': text = `pop ${inst.pair}`; break;
    case 'ld-pair-imm': text = `ld ${inst.pair}, ${hex(inst.value)}`; break;
    case 'ld-pair-mem':
      text = inst.direction === 'to-mem'
        ? `ld (${hex(inst.addr)}), ${inst.pair}`
        : `ld ${inst.pair}, (${hex(inst.addr)})`;
      break;
    case 'ld-mem-pair': text = `ld (${hex(inst.addr)}), ${inst.pair}`; break;
    case 'ld-reg-imm': text = `ld ${inst.dest}, ${hexByte(inst.value)}`; break;
    case 'ld-reg-reg': text = `ld ${inst.dest}, ${inst.src}`; break;
    case 'ld-reg-ind': text = `ld ${inst.dest}, (${inst.src})`; break;
    case 'ld-ind-reg': text = `ld (${inst.dest}), ${inst.src}`; break;
    case 'ld-ind-imm': text = `ld (hl), ${hexByte(inst.value)}`; break;
    case 'ld-reg-ixd': {
      const sign = inst.displacement >= 0 ? '+' : '';
      text = `ld ${inst.dest}, (${inst.indexRegister}${sign}${inst.displacement})`;
      break;
    }
    case 'ld-ixd-reg': {
      const sign = inst.displacement >= 0 ? '+' : '';
      text = `ld (${inst.indexRegister}${sign}${inst.displacement}), ${inst.src}`;
      break;
    }
    case 'ld-ixd-imm': {
      const sign = inst.displacement >= 0 ? '+' : '';
      text = `ld (${inst.indexRegister}${sign}${inst.displacement}), ${hexByte(inst.value)}`;
      break;
    }
    case 'ld-reg-mem': text = `ld ${inst.dest ?? 'a'}, (${hex(inst.addr)})`; break;
    case 'ld-mem-reg': text = `ld (${hex(inst.addr)}), ${inst.src}`; break;
    case 'ld-sp-hl': text = 'ld sp, hl'; break;
    case 'ld-sp-pair': text = `ld sp, ${inst.pair}`; break;
    case 'ld-special': text = `ld ${inst.dest}, ${inst.src}`; break;
    case 'ld-pair-ind': text = `ld ${inst.pair}, (${inst.src})`; break;
    case 'ld-pair-indexed': {
      const sign = inst.displacement >= 0 ? '+' : '';
      text = `ld ${inst.pair}, (${inst.indexRegister}${sign}${inst.displacement})`;
      break;
    }
    case 'alu-imm': text = `${inst.op} ${hexByte(inst.value)}`; break;
    case 'alu-reg': text = `${inst.op} ${inst.src}`; break;
    case 'alu-ind': text = `${inst.op} (hl)`; break;
    case 'alu-ixd': {
      const sign = inst.displacement >= 0 ? '+' : '';
      text = `${inst.op} (${inst.indexRegister}${sign}${inst.displacement})`;
      break;
    }
    case 'call': text = `call ${hex(inst.target)}`; break;
    case 'call-conditional': text = `call ${inst.condition}, ${hex(inst.target)}`; break;
    case 'jp': text = `jp ${hex(inst.target)}`; break;
    case 'jp-conditional': text = `jp ${inst.condition}, ${hex(inst.target)}`; break;
    case 'jp-indirect': text = `jp (${inst.indirectRegister})`; break;
    case 'jr': text = `jr ${hex(inst.target)}`; break;
    case 'jr-conditional': text = `jr ${inst.condition}, ${hex(inst.target)}`; break;
    case 'ret': text = 'ret'; break;
    case 'ret-conditional': text = `ret ${inst.condition}`; break;
    case 'inc-pair': text = `inc ${inst.pair}`; break;
    case 'dec-pair': text = `dec ${inst.pair}`; break;
    case 'inc-reg': text = `inc ${inst.reg}`; break;
    case 'dec-reg': text = `dec ${inst.reg}`; break;
    case 'inc-ind': text = 'inc (hl)'; break;
    case 'dec-ind': text = 'dec (hl)'; break;
    case 'add-pair': text = `add ${inst.dest}, ${inst.src}`; break;
    case 'sbc-pair': text = `sbc hl, ${inst.src}`; break;
    case 'adc-pair': text = `adc hl, ${inst.src}`; break;
    case 'djnz': text = `djnz ${hex(inst.target)}`; break;
    case 'rotate-reg': text = `${inst.op} ${inst.reg}`; break;
    case 'rotate-ind': text = `${inst.op} (hl)`; break;
    case 'ex-de-hl': text = 'ex de, hl'; break;
    case 'ex-af': text = "ex af, af'"; break;
    case 'exx': text = 'exx'; break;
    case 'ldir': text = 'ldir'; break;
    case 'ldi': text = 'ldi'; break;
    case 'lddr': text = 'lddr'; break;
    case 'ldd': text = 'ldd'; break;
    case 'cpir': text = 'cpir'; break;
    case 'cpi': text = 'cpi'; break;
    case 'cpdr': text = 'cpdr'; break;
    case 'cpd': text = 'cpd'; break;
    case 'rst': text = `rst ${hex(inst.target, 2)}`; break;
    case 'nop': text = 'nop'; break;
    case 'halt': text = 'halt'; break;
    case 'di': text = 'di'; break;
    case 'ei': text = 'ei'; break;
    case 'scf': text = 'scf'; break;
    case 'ccf': text = 'ccf'; break;
    case 'cpl': text = 'cpl'; break;
    case 'daa': text = 'daa'; break;
    case 'rla': text = 'rla'; break;
    case 'rra': text = 'rra'; break;
    case 'rlca': text = 'rlca'; break;
    case 'rrca': text = 'rrca'; break;
    case 'reti': text = 'reti'; break;
    case 'retn': text = 'retn'; break;
    case 'bit-test': text = `bit ${inst.bit}, ${inst.reg}`; break;
    case 'bit-test-ind': text = `bit ${inst.bit}, (hl)`; break;
    case 'bit-set': text = `set ${inst.bit}, ${inst.reg}`; break;
    case 'bit-set-ind': text = `set ${inst.bit}, (hl)`; break;
    case 'bit-res': text = `res ${inst.bit}, ${inst.reg}`; break;
    case 'bit-res-ind': text = `res ${inst.bit}, (hl)`; break;
    case 'out-imm': text = `out (${hexByte(inst.port)}), a`; break;
    case 'in-imm': text = `in a, (${hexByte(inst.port)})`; break;
    case 'out-reg': text = `out (c), ${inst.reg}`; break;
    case 'in-reg': text = `in ${inst.reg}, (c)`; break;
    case 'out0': text = `out0 (${hexByte(inst.port)}), ${inst.reg}`; break;
    case 'neg': text = 'neg'; break;
    case 'im-set': text = `im ${inst.mode}`; break;
    case 'ex-sp-hl': text = 'ex (sp), hl'; break;
    case 'ex-sp-pair': text = `ex (sp), ${inst.pair}`; break;
    case 'outi': text = 'outi'; break;
    case 'outd': text = 'outd'; break;
    default: break;
  }

  return `${prefix}${text}`;
}

function disassembleRange(romBytes, startPc, endPc) {
  const rows = [];
  let pc = startPc;

  while (pc < endPc) {
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

    pc = inst.nextPc;
  }

  return rows;
}

function formatDisasmRow(row) {
  return `${hex(row.pc)}  ${row.bytes.padEnd(17)}  ${row.dasm}`;
}

// ── Runtime setup (matches reference probe) ──

function createRuntime() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(rom.subarray(0, 0x400000));
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
  cpu._ix = IX_ADDR;
  cpu._hl = 0;
  cpu.bc = 0;
  cpu.de = 0;
  cpu.f = 0x40;
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
        loopsForced += 1;
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
        missingBlockObserved = true;
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
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEMINIT_RET);
  return runDirect(executor, MEMINIT_ENTRY, {
    maxSteps: 100000,
    sentinels: new Map([
      [MEMINIT_RET, 'return_hit'],
      [0xffffff, 'missing_block_terminal'],
    ]),
  });
}

function seedCxContext(mem) {
  mem.fill(0x00, CX_MAIN_ADDR, CX_CONTEXT_END_ADDR + 1);
  write24(mem, CX_MAIN_ADDR, HOME_SCREEN_MAIN_HANDLER);
  write24(mem, CX_PPUTAWAY_ADDR, 0x000000);
  write24(mem, CX_PUTAWAY_ADDR, 0x000000);
  write24(mem, CX_REDISP_ADDR, 0x000000);
  write24(mem, CX_ERROREP_ADDR, 0x000000);
  write24(mem, CX_SIZEWIND_ADDR, 0x000000);
  mem[CX_PAGE_ADDR] = 0x00;
  mem[CX_PAGE_ADDR + 1] = 0x00;
  mem[CX_CUR_APP_ADDR] = HOME_SCREEN_APP_ID;
}

function seedParserState(mem) {
  mem.fill(0x00, USERMEM_ADDR, USERMEM_ADDR + 0x20);
  mem.set(INPUT_TOKENS, USERMEM_ADDR);
  write24(mem, BEGPC_ADDR, USERMEM_ADDR);
  write24(mem, CURPC_ADDR, USERMEM_ADDR);
  write24(mem, ENDPC_ADDR, USERMEM_ADDR + INPUT_TOKENS.length);
  mem[ERR_NO_ADDR] = 0x00;
}

function seedErrorFrame(cpu, mem) {
  const frameBase = (cpu.sp - 6) & 0xffffff;
  write24(mem, frameBase, FAKE_RET);
  write24(mem, frameBase + 3, POP_ERROR_HANDLER);
  write24(mem, ERR_SP_ADDR, frameBase);
  mem[ERR_NO_ADDR] = 0x00;
  cpu.sp = frameBase;
  return {
    frameBase,
    bytes: hexBytes(mem, frameBase, 6),
  };
}

function seedHistoryBuffer(mem) {
  // History entry format at 0xD0150B:
  //   [0..1] = 2-byte LE size of token data (0x0004 = 4 bytes)
  //   [2..5] = token data: 0x72 0x70 0x73 0x3F ("2+3\n")
  // Total entry = 6 bytes: 0xD0150B + 6 = 0xD01511
  //
  // End pointer at 0xD01508 points to the byte AFTER the last entry.
  const entrySize = INPUT_TOKENS.length; // 4
  write16(mem, HISTORY_BUF_START, entrySize);          // size = 4 (LE)
  mem.set(INPUT_TOKENS, HISTORY_BUF_START + 2);        // token data
  const endAddr = HISTORY_BUF_START + 2 + entrySize;   // 0xD01511
  write24(mem, HISTORY_END_PTR_ADDR, endAddr);

  // Set numLastEntries = 1
  mem[NUM_LAST_ENTRIES_ADDR] = 0x01;

  return {
    entryAddr: HISTORY_BUF_START,
    entrySize,
    endAddr,
    endPtrValue: endAddr,
    entryBytes: hexBytes(mem, HISTORY_BUF_START, 2 + entrySize),
    endPtrBytes: hexBytes(mem, HISTORY_END_PTR_ADDR, 3),
  };
}

// ── Main ──

async function main() {
  const transcript = [];
  const log = (line = '') => {
    const text = String(line);
    transcript.push(text);
    console.log(text);
  };

  log('=== Phase 25AQ: History Buffer Seed + Recall Path to ParseInp ===');
  log('');

  // ── Part A: Disassembly ──

  log('=== Part A: Disassembly ===');
  log('');

  const disasmSections = [];

  for (const range of DISASM_RANGES) {
    log(`--- ${range.label} (${hex(range.start)}-${hex(range.end)}) ---`);
    const rows = disassembleRange(rom, range.start, range.end);
    const lines = rows.map(formatDisasmRow);
    for (const line of lines) log(line);
    log('');
    disasmSections.push({ label: range.label, start: range.start, end: range.end, rows });
  }

  // ── Part B: Seeded history run ──

  log('=== Part B: Seeded History Run ===');
  log('');

  const runtime = createRuntime();
  const { mem, cpu, executor } = runtime;

  coldBoot(executor, cpu, mem);
  log('Cold boot complete.');

  const memInit = runMemInit(runtime);
  log(`MEM_INIT: term=${memInit.termination} steps=${memInit.steps} finalPc=${hex(memInit.finalPc)}`);

  // Prepare call state
  prepareCallState(cpu, mem);
  seedCxContext(mem);
  seedParserState(mem);
  const errFrame = seedErrorFrame(cpu, mem);
  log(`Error frame @ ${hex(errFrame.frameBase)}: [${errFrame.bytes}]`);

  // Seed history buffer
  const histSeed = seedHistoryBuffer(mem);
  log(`History entry @ ${hex(histSeed.entryAddr)}: [${histSeed.entryBytes}]`);
  log(`History end ptr @ ${hex(HISTORY_END_PTR_ADDR)}: [${histSeed.endPtrBytes}] = ${hex(histSeed.endPtrValue)}`);
  log(`numLastEntries = ${mem[NUM_LAST_ENTRIES_ADDR]}`);

  // Set CPU registers for ENTER handler
  cpu.a = K_ENTER;
  cpu.b = K_ENTER;

  // Track which key PCs are hit
  const KEY_PCS = new Map([
    [COMMON_TAIL_PC, 'common_tail_0x058693'],
    [PARSEINP_CALL_SITE, 'ParseInp_call_0x0586E3'],
    [TRAMPOLINE_PC, 'trampoline_0x099910'],
    [PARSEINP_PC, 'ParseInp_0x099914'],
    [HISTORY_MANAGER_PC, 'history_mgr_0x0921CB'],
  ]);

  const hitPcs = new Map();       // pc -> { label, firstStep }
  const pcTrace = [];             // first 500 block PCs
  const PC_TRACE_LIMIT = 500;
  let stoppedEarly = false;

  log('');
  log(`Running ENTER handler @ ${hex(SECOND_PASS_ENTRY)} with A=0x05, B=0x05, budget=100000`);
  log('');

  const run = runDirect(executor, SECOND_PASS_ENTRY, {
    maxSteps: 100000,
    maxLoopIterations: DEFAULT_MAX_LOOP_ITER,
    sentinels: new Map([
      [FAKE_RET, 'return_hit'],
      [0xffffff, 'missing_block_terminal'],
    ]),
    onBlock(pc, mode, meta, stepNumber) {
      if (pcTrace.length < PC_TRACE_LIMIT) pcTrace.push(pc);

      if (KEY_PCS.has(pc) && !hitPcs.has(pc)) {
        hitPcs.set(pc, { label: KEY_PCS.get(pc), firstStep: stepNumber });
      }

      // Stop after ParseInp is reached (give it 200 more steps)
      if (pc === PARSEINP_PC) {
        stoppedEarly = true;
        throw makeSentinelError('parseinp_reached', pc);
      }
    },
    onMissingBlock(pc, mode, stepNumber) {
      if (pcTrace.length < PC_TRACE_LIMIT) pcTrace.push(pc);
      if (KEY_PCS.has(pc) && !hitPcs.has(pc)) {
        hitPcs.set(pc, { label: KEY_PCS.get(pc), firstStep: stepNumber });
      }
    },
  });

  log(`Run result: term=${run.termination} steps=${run.steps} finalPc=${hex(run.finalPc)} loopsForced=${run.loopsForced}`);
  log(`Missing blocks: ${run.missingBlockObserved}`);
  log('');

  // Report key PC hits
  log('=== Key PC Hits ===');
  for (const [pc, info] of KEY_PCS) {
    const hit = hitPcs.get(pc);
    if (hit) {
      log(`  [HIT]  ${hex(pc)} ${hit.label} @ step ${hit.firstStep}`);
    } else {
      log(`  [MISS] ${hex(pc)} ${info}`);
    }
  }
  log('');

  // Report OP1
  const op1Bytes = hexBytes(mem, OP1_ADDR, 9);
  log(`OP1 @ ${hex(OP1_ADDR)}: [${op1Bytes}]`);

  // Report errNo
  const errNo = mem[ERR_NO_ADDR] & 0xff;
  log(`errNo @ ${hex(ERR_NO_ADDR)}: ${hexByte(errNo)}`);

  // ParseInp reached?
  const parseinpReached = hitPcs.has(PARSEINP_PC);
  log(`ParseInp reached: ${parseinpReached}`);
  log('');

  // Print first 50 trace PCs for orientation
  log('=== First 50 Block PCs ===');
  for (let i = 0; i < Math.min(50, pcTrace.length); i++) {
    log(`  ${String(i).padStart(4)}: ${hex(pcTrace[i])}`);
  }
  log('');

  // Print last 30 trace PCs for end-of-run context
  if (pcTrace.length > 50) {
    log('=== Last 30 Block PCs ===');
    const start = Math.max(0, pcTrace.length - 30);
    for (let i = start; i < pcTrace.length; i++) {
      log(`  ${String(i).padStart(4)}: ${hex(pcTrace[i])}`);
    }
    log('');
  }

  // Post-run memory state
  log('=== Post-Run Memory State ===');
  log(`numLastEntries: ${mem[NUM_LAST_ENTRIES_ADDR]}`);
  log(`History end ptr: ${hex(read24(mem, HISTORY_END_PTR_ADDR))}`);
  log(`History buf first 10 bytes: [${hexBytes(mem, HISTORY_BUF_START, 10)}]`);
  log(`SP: ${hex(cpu.sp)}`);
  log(`Stack top 12 bytes: [${hexBytes(mem, cpu.sp, 12)}]`);
  log('');

  // ── Write report ──

  const reportLines = [];
  reportLines.push(`# ${REPORT_TITLE}`);
  reportLines.push('');
  reportLines.push('## Date');
  reportLines.push('');
  reportLines.push(new Date().toISOString());
  reportLines.push('');

  reportLines.push('## Setup');
  reportLines.push('');
  reportLines.push(`- Entry: \`${hex(SECOND_PASS_ENTRY)}\` with \`A=0x05\`, \`B=0x05\``);
  reportLines.push(`- MEM_INIT: \`${memInit.termination}\`, steps=\`${memInit.steps}\``);
  reportLines.push(`- cxMain: \`${hex(HOME_SCREEN_MAIN_HANDLER)}\`, cxCurApp: \`${hexByte(HOME_SCREEN_APP_ID)}\``);
  reportLines.push(`- userMem tokens @ \`${hex(USERMEM_ADDR)}\`: \`${hexArray(INPUT_TOKENS)}\``);
  reportLines.push(`- Error frame @ \`${hex(errFrame.frameBase)}\`: [${errFrame.bytes}]`);
  reportLines.push(`- History entry @ \`${hex(histSeed.entryAddr)}\`: [${histSeed.entryBytes}]`);
  reportLines.push(`- History end ptr @ \`${hex(HISTORY_END_PTR_ADDR)}\`: ${hex(histSeed.endPtrValue)}`);
  reportLines.push(`- numLastEntries: 1`);
  reportLines.push('');

  reportLines.push('## Part A: Disassembly');
  reportLines.push('');
  for (const section of disasmSections) {
    reportLines.push(`### ${section.label} (${hex(section.start)}-${hex(section.end)})`);
    reportLines.push('');
    reportLines.push('```text');
    for (const row of section.rows) {
      reportLines.push(formatDisasmRow(row));
    }
    reportLines.push('```');
    reportLines.push('');
  }

  reportLines.push('## Part B: ENTER Handler with Seeded History');
  reportLines.push('');
  reportLines.push(`- Termination: \`${run.termination}\``);
  reportLines.push(`- Steps: \`${run.steps}\``);
  reportLines.push(`- Final PC: \`${hex(run.finalPc)}\``);
  reportLines.push(`- Loops forced: \`${run.loopsForced}\``);
  reportLines.push(`- Missing blocks: \`${run.missingBlockObserved}\``);
  reportLines.push('');

  reportLines.push('### Key PC Hits');
  reportLines.push('');
  reportLines.push('| PC | Label | Hit? | Step |');
  reportLines.push('|----|-------|------|------|');
  for (const [pc, label] of KEY_PCS) {
    const hit = hitPcs.get(pc);
    if (hit) {
      reportLines.push(`| \`${hex(pc)}\` | ${hit.label} | YES | ${hit.firstStep} |`);
    } else {
      reportLines.push(`| \`${hex(pc)}\` | ${label} | NO | - |`);
    }
  }
  reportLines.push('');

  reportLines.push('### Post-Run State');
  reportLines.push('');
  reportLines.push(`- OP1: \`[${op1Bytes}]\``);
  reportLines.push(`- errNo: \`${hexByte(errNo)}\``);
  reportLines.push(`- ParseInp reached: \`${parseinpReached}\``);
  reportLines.push(`- SP: \`${hex(cpu.sp)}\``);
  reportLines.push('');

  reportLines.push('## Console Output');
  reportLines.push('');
  reportLines.push('```text');
  reportLines.push(...transcript);
  reportLines.push('```');

  writeFileSync(REPORT_PATH, `${reportLines.join('\n')}\n`);
  log(`Report written to ${REPORT_PATH}`);
}

try {
  await main();
} catch (error) {
  const message = error?.stack || error?.message || String(error);
  console.error(message);

  const failLines = [
    `# ${REPORT_TITLE} FAILED`,
    '',
    '## Error',
    '',
    '```text',
    ...String(message).split(/\r?\n/),
    '```',
  ];
  writeFileSync(REPORT_PATH, `${failLines.join('\n')}\n`);
  process.exitCode = 1;
}
