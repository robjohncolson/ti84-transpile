#!/usr/bin/env node

/**
 * Phase 214 Probe: Session-204 JP(HL) table-entry follow-up
 *
 * Goals:
 *   1. Cold-boot + memInit a baseline runtime once, then clone fresh state for each test.
 *   2. Verify the claimed 0x0585D4 3-byte pointer run and compare it against the
 *      session-204 values. Also dump the alternate 0x0585D3 alignment because the
 *      surrounding ROM bytes suggest a table-base ambiguity.
 *   3. Trace the six session-204 entry addresses with digit "1" state
 *      (scan=0x8F, token=0x31) for 200 steps each, logging unique blocks,
 *      BufInsert reachability, ConvKeyToTok reachability, edit-buffer bytes,
 *      and IY+5 before/after.
 *   4. Re-run only the BufInsert-positive entries with "+" (scan=0x80, token=0x70).
 *   5. Show the tail before 0x0585D3 plus any literal 24-bit references that load
 *      0x0585D3 so we can tell whether HL is indexed through RAM/table math or
 *      loaded as an immediate table base.
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const transpiledPath = path.join(__dirname, 'ROM.transpiled.js');
const transpiledGzipPath = `${transpiledPath}.gz`;
const romPath = path.join(__dirname, 'ROM.rom');

if (!existsSync(transpiledPath)) {
  const hint = existsSync(transpiledGzipPath)
    ? 'Gunzip ROM.transpiled.js.gz first so the probe can import ROM.transpiled.js.'
    : 'ROM.transpiled.js is missing.';
  throw new Error(hint);
}

if (!existsSync(romPath)) {
  throw new Error('ROM.rom is missing.');
}

const { PRELIFTED_BLOCKS } = await import('./ROM.transpiled.js');
const rom = readFileSync(romPath);

function normalizeBlocks(rawBlocks) {
  if (Array.isArray(rawBlocks)) {
    return Object.fromEntries(rawBlocks.filter((block) => block?.id).map((block) => [block.id, block]));
  }
  return rawBlocks ?? {};
}

const BLOCKS = normalizeBlocks(PRELIFTED_BLOCKS);
const ADL_BLOCK_STARTS = Object.keys(BLOCKS)
  .filter((key) => key.endsWith(':adl'))
  .map((key) => Number.parseInt(key.slice(0, 6), 16))
  .filter((value) => Number.isInteger(value))
  .sort((left, right) => left - right);

const MEM_SIZE = 0x1000000;

const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const MEM_INIT_ENTRY = 0x09DEE0;
const MEM_INIT_RET = 0x7FFFF6;
const RETURN_SENTINEL = 0x7FFFFE;

const STACK_TOP = 0xD1A87E;
const MBASE = 0xD0;
const IY_ADDR = 0xD00080;
const IX_ADDR = 0xD1A860;
const IY_PLUS_5_ADDR = IY_ADDR + 0x05;
const IY_PLUS_12_ADDR = IY_ADDR + 0x0C;

const OP1_ADDR = 0xD005F8;
const TOKEN_STAGING_ADDR = 0xD0230E;

const KBD_RAW_SCAN_ADDR = 0xD00587;
const KBD_KEY_ADDR = 0xD0058C;
const KBD_GETKY_ADDR = 0xD0058D;
const KBD_GETCSC_SCAN_ADDR = 0xD0058E;

const EDIT_TOP_ADDR = 0xD02437;
const EDIT_CURSOR_ADDR = 0xD0243A;
const EDIT_TAIL_ADDR = 0xD0243D;
const EDIT_BTM_ADDR = 0xD02440;
const EDIT_BUF_START = 0xD00A00;
const EDIT_BUF_END = 0xD00B00;

const BUF_INSERT = 0x05E2A0;
const CONV_KEY_TO_TOK_TARGETS = [0x05E630, 0x05C52C];

const DISPATCH_TABLE_ADDR = 0x0585D3;
const PROMPT_TABLE_ADDR = 0x0585D4;
const HL_LOAD_SCAN_START = 0x058000;
const HL_LOAD_SCAN_END = 0x059000;
const DISPATCH_TAIL_LOOKBACK = 0x20;
const REF_DISASM_LENGTH = 8;

const BOOT_MAX_STEPS = 20000;
const KERNEL_INIT_MAX_STEPS = 100000;
const POST_INIT_MAX_STEPS = 100;
const MEM_INIT_MAX_STEPS = 100000;
const MAX_LOOP_ITERATIONS = 8192;
const TRACE_MAX_STEPS = 200;

const PROMPT_TABLE_EXPECTED = [
  0x058585,
  0x058B19,
  0x058B7E,
  0x0582BC,
  0x058BA9,
  0x058C01,
];

const ALIGNED_TABLE_EXPECTED = [
  0x0585E9,
  0x058B19,
  0x058B7E,
  0x0582BC,
  0x058BA9,
  0x058C01,
];

const ENTRY_SPECS = [
  { index: 0, entry: 0x058585, label: 'session204_entry0_058585' },
  { index: 1, entry: 0x058B19, label: 'session204_entry1_058b19' },
  { index: 2, entry: 0x058B7E, label: 'session204_entry2_058b7e' },
  { index: 3, entry: 0x0582BC, label: 'session204_entry3_0582bc' },
  { index: 4, entry: 0x058BA9, label: 'session204_entry4_058ba9' },
  { index: 5, entry: 0x058C01, label: 'session204_entry5_058c01' },
];

const KEY_CASES = {
  digit1: {
    id: 'digit1',
    label: 'digit 1',
    scanCode: 0x8F,
    token: 0x31,
  },
  plus: {
    id: 'plus',
    label: 'plus',
    scanCode: 0x80,
    token: 0x70,
  },
};

function hex(value, width = 6) {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function bytesFor(buffer, start, length) {
  return Array.from(buffer.slice(start, start + length), (value) =>
    value.toString(16).toUpperCase().padStart(2, '0')
  ).join(' ');
}

function write24(mem, addr, value) {
  const a = addr & 0xFFFFFF;
  mem[a] = value & 0xFF;
  mem[a + 1] = (value >>> 8) & 0xFF;
  mem[a + 2] = (value >>> 16) & 0xFF;
}

function read24(mem, addr) {
  const a = addr & 0xFFFFFF;
  return ((mem[a] & 0xFF) | ((mem[a + 1] & 0xFF) << 8) | ((mem[a + 2] & 0xFF) << 16)) >>> 0;
}

function push24(cpu, mem, value) {
  cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
  write24(mem, cpu.sp, value & 0xFFFFFF);
}

function blockKey(addr, mode = 'adl') {
  return `${addr.toString(16).padStart(6, '0')}:${mode}`;
}

function createMemoryWithRom() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(rom.subarray(0, Math.min(mem.length, rom.length)));
  return mem;
}

function createRuntime(mem) {
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  return { executor, cpu: executor.cpu };
}

function resetOsState(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = MBASE;
  cpu.iy = IY_ADDR;
  cpu.ix = IX_ADDR;
  cpu.hl = 0;
  cpu.de = 0;
  cpu.bc = 0;
  cpu.a = 0x00;
  cpu.f = 0x40;
  cpu.sp = STACK_TOP;
  mem.fill(0xFF, Math.max(0, STACK_TOP - 0x80), Math.min(mem.length, STACK_TOP + 0x20));
}

function coldBoot(executor, cpu, mem) {
  const boot = executor.runFrom(BOOT_ENTRY, 'z80', {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: 32,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const kernelInit = executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: KERNEL_INIT_MAX_STEPS,
    maxLoopIterations: 10000,
  });

  cpu.mbase = MBASE;
  cpu.iy = IY_ADDR;
  cpu.hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const postInit = executor.runFrom(POST_INIT_ENTRY, 'adl', {
    maxSteps: POST_INIT_MAX_STEPS,
    maxLoopIterations: 32,
  });

  return {
    boot: { steps: boot.steps, termination: boot.termination, lastPc: hex(boot.lastPc ?? 0) },
    kernelInit: { steps: kernelInit.steps, termination: kernelInit.termination, lastPc: hex(kernelInit.lastPc ?? 0) },
    postInit: { steps: postInit.steps, termination: postInit.termination, lastPc: hex(postInit.lastPc ?? 0) },
  };
}

function runMemInit(executor, cpu, mem) {
  resetOsState(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEM_INIT_RET);
  let returned = false;
  let result = null;

  try {
    result = executor.runFrom(MEM_INIT_ENTRY, 'adl', {
      maxSteps: MEM_INIT_MAX_STEPS,
      maxLoopIterations: MAX_LOOP_ITERATIONS,
      onBlock(pc) {
        if ((pc & 0xFFFFFF) === MEM_INIT_RET) throw new Error('__MEMINIT_RET__');
      },
      onMissingBlock(pc) {
        if ((pc & 0xFFFFFF) === MEM_INIT_RET) throw new Error('__MEMINIT_RET__');
      },
    });
  } catch (error) {
    if (error?.message === '__MEMINIT_RET__') {
      returned = true;
    } else {
      throw error;
    }
  }

  return {
    returned,
    steps: result?.steps ?? null,
    termination: returned ? 'sentinel' : (result?.termination ?? null),
  };
}

function createBaseline() {
  const mem = createMemoryWithRom();
  const { executor, cpu } = createRuntime(mem);
  const boot = coldBoot(executor, cpu, mem);
  const memInit = runMemInit(executor, cpu, mem);
  return {
    boot,
    memInit,
    memory: new Uint8Array(mem),
    baselineFlags: {
      iyPlus5: hexByte(mem[IY_PLUS_5_ADDR]),
      iyPlus12: hexByte(mem[IY_PLUS_12_ADDR]),
    },
  };
}

function makeTokenRecord(token) {
  const record = new Uint8Array(9);
  record[0] = 0x00;
  record[1] = token & 0xFF;
  return record;
}

function seedEditBuffer(mem) {
  write24(mem, EDIT_TOP_ADDR, EDIT_BUF_START);
  write24(mem, EDIT_CURSOR_ADDR, EDIT_BUF_START);
  write24(mem, EDIT_TAIL_ADDR, EDIT_BUF_START);
  write24(mem, EDIT_BTM_ADDR, EDIT_BUF_END);
  mem.fill(0x00, EDIT_BUF_START, EDIT_BUF_END);
}

function seedKeyboardContext(mem, scanCode) {
  const value = scanCode & 0xFF;
  mem[KBD_RAW_SCAN_ADDR] = value;
  mem[KBD_KEY_ADDR] = value;
  mem[KBD_GETKY_ADDR] = value;
  mem[KBD_GETCSC_SCAN_ADDR] = value;
}

function seedTokenContext(mem, token) {
  const record = makeTokenRecord(token);
  mem.fill(0x00, OP1_ADDR, OP1_ADDR + record.length);
  mem.fill(0x00, TOKEN_STAGING_ADDR, TOKEN_STAGING_ADDR + record.length);
  mem.set(record, OP1_ADDR);
  mem.set(record, TOKEN_STAGING_ADDR);
  return record;
}

function snapshotCpu(cpu) {
  return {
    a: hexByte(cpu.a),
    f: hexByte(cpu.f),
    bc: hex(cpu.bc),
    de: hex(cpu.de),
    hl: hex(cpu.hl),
    ix: hex(cpu.ix),
    iy: hex(cpu.iy),
    sp: hex(cpu.sp),
  };
}

function setupEntryCase(cpu, mem, keyCase) {
  resetOsState(cpu, mem);
  seedEditBuffer(mem);
  seedKeyboardContext(mem, keyCase.scanCode);
  const tokenRecord = seedTokenContext(mem, keyCase.token);

  // Keep the direct-entry experiments in edit mode and out of the level-1
  // "editor active" gate so the second-pass/body handlers can run directly.
  mem[IY_PLUS_5_ADDR] = (mem[IY_PLUS_5_ADDR] | 0x10) & 0xFF;
  mem[IY_PLUS_12_ADDR] = mem[IY_PLUS_12_ADDR] & 0x7F;

  cpu.a = keyCase.scanCode & 0xFF;
  cpu.de = keyCase.token & 0xFF;
  cpu.bc = 0x000001;
  cpu.ix = IX_ADDR;
  cpu.iy = IY_ADDR;

  push24(cpu, mem, RETURN_SENTINEL);

  return {
    scanCode: hexByte(keyCase.scanCode),
    token: hexByte(keyCase.token),
    tokenRecord: bytesFor(tokenRecord, 0, tokenRecord.length),
    seededDe: hex(cpu.de),
    iyPlus5ForcedBit4: true,
    iyPlus12Bit7Cleared: true,
  };
}

function createHit(address) {
  return {
    address: hex(address),
    reached: false,
    firstStep: null,
    firstPc: null,
    cpu: null,
  };
}

function noteHit(hit, address, stepNumber, cpu) {
  if (hit.reached) return;
  hit.reached = true;
  hit.firstStep = stepNumber;
  hit.firstPc = hex(address);
  hit.cpu = snapshotCpu(cpu);
}

function traceEntryCase(baselineMem, entrySpec, keyCase) {
  const mem = new Uint8Array(baselineMem);
  const { executor, cpu } = createRuntime(mem);
  const setup = setupEntryCase(cpu, mem, keyCase);

  const exactBlockExists = Boolean(BLOCKS[blockKey(entrySpec.entry)]);
  const before = {
    editBuffer: bytesFor(mem, EDIT_BUF_START, 16),
    iyPlus5: hexByte(mem[IY_PLUS_5_ADDR]),
    iyPlus12: hexByte(mem[IY_PLUS_12_ADDR]),
    editCursor: hex(read24(mem, EDIT_CURSOR_ADDR)),
    editTail: hex(read24(mem, EDIT_TAIL_ADDR)),
  };

  const uniqueVisited = [];
  const uniqueVisitedSet = new Set();
  const missingBlocks = [];
  const missingSet = new Set();
  const hits = {
    bufInsert: createHit(BUF_INSERT),
    convKeyToTok: Object.fromEntries(CONV_KEY_TO_TOK_TARGETS.map((addr) => [hex(addr), createHit(addr)])),
  };

  let firstExecutableBlock = null;
  let steps = 0;
  let termination = 'max_steps';
  let errorMessage = null;
  let lastPc = entrySpec.entry;

  const noteBlockVisit = (pc, step) => {
    const normalized = pc & 0xFFFFFF;
    const stepNumber = (step ?? 0) + 1;
    steps = Math.max(steps, stepNumber);
    lastPc = normalized;

    if (firstExecutableBlock === null) {
      firstExecutableBlock = normalized;
    }

    if (!uniqueVisitedSet.has(normalized)) {
      uniqueVisitedSet.add(normalized);
      uniqueVisited.push(hex(normalized));
    }

    if (normalized === BUF_INSERT) {
      noteHit(hits.bufInsert, normalized, stepNumber, cpu);
    }

    for (const convAddr of CONV_KEY_TO_TOK_TARGETS) {
      if (normalized === convAddr) {
        noteHit(hits.convKeyToTok[hex(convAddr)], normalized, stepNumber, cpu);
      }
    }
  };

  try {
    const result = executor.runFrom(entrySpec.entry, 'adl', {
      maxSteps: TRACE_MAX_STEPS,
      maxLoopIterations: MAX_LOOP_ITERATIONS,
      onBlock(pc, _mode, _meta, step) {
        noteBlockVisit(pc, step);
        if ((pc & 0xFFFFFF) === RETURN_SENTINEL) throw new Error('__TRACE_STOP__');
      },
      onMissingBlock(pc, _mode, step) {
        const normalized = pc & 0xFFFFFF;
        const stepNumber = (step ?? 0) + 1;
        steps = Math.max(steps, stepNumber);
        lastPc = normalized;
        if (!missingSet.has(normalized)) {
          missingSet.add(normalized);
          missingBlocks.push(hex(normalized));
        }
        if (normalized === RETURN_SENTINEL) throw new Error('__TRACE_STOP__');
      },
    });

    termination = result.termination ?? termination;
    steps = Math.max(steps, result.steps ?? 0);
    lastPc = (result.lastPc ?? lastPc) & 0xFFFFFF;
  } catch (error) {
    if (error?.message === '__TRACE_STOP__') {
      termination = 'sentinel';
    } else {
      termination = 'exception';
      errorMessage = error?.stack ?? String(error);
    }
  }

  const after = {
    editBuffer: bytesFor(mem, EDIT_BUF_START, 16),
    iyPlus5: hexByte(mem[IY_PLUS_5_ADDR]),
    iyPlus12: hexByte(mem[IY_PLUS_12_ADDR]),
    editCursor: hex(read24(mem, EDIT_CURSOR_ADDR)),
    editTail: hex(read24(mem, EDIT_TAIL_ADDR)),
    tokenStaging: bytesFor(mem, TOKEN_STAGING_ADDR, 9),
    op1: bytesFor(mem, OP1_ADDR, 9),
  };

  const reachedAnyConvKeyToTok = Object.values(hits.convKeyToTok).some((hit) => hit.reached);

  return {
    index: entrySpec.index,
    label: entrySpec.label,
    requestedEntry: hex(entrySpec.entry),
    keyCase: keyCase.id,
    exactBlockExists,
    firstExecutableBlock: firstExecutableBlock === null ? null : hex(firstExecutableBlock),
    setup,
    run: {
      steps,
      termination,
      lastPc: hex(lastPc),
      uniqueBlockCount: uniqueVisited.length,
    },
    hits: {
      bufInsert: hits.bufInsert,
      reachedAnyConvKeyToTok,
      convKeyToTok: hits.convKeyToTok,
    },
    before,
    after,
    uniqueBlocks: uniqueVisited,
    missingBlocks,
    finalCpu: snapshotCpu(cpu),
    error: errorMessage,
  };
}

function memAddr(inst) {
  if (!Number.isInteger(inst?.addr)) return null;
  if (inst.modePrefix === 'sis' || inst.modePrefix === 'lis') {
    return (((MBASE & 0xFF) << 16) | (inst.addr & 0xFFFF)) >>> 0;
  }
  return inst.addr >>> 0;
}

function formatInstruction(inst) {
  if (!inst) return 'decode-error';
  const disp = (value) => (value >= 0 ? `+${value}` : `${value}`);
  const prefix = inst.modePrefix ? `${inst.modePrefix} ` : '';

  switch (inst.tag) {
    case 'call': return `${prefix}call ${hex(inst.target)}`;
    case 'call-conditional': return `${prefix}call ${inst.condition}, ${hex(inst.target)}`;
    case 'jp': return `${prefix}jp ${hex(inst.target)}`;
    case 'jp-conditional': return `${prefix}jp ${inst.condition}, ${hex(inst.target)}`;
    case 'jp-indirect': return `${prefix}jp (${inst.indirectRegister})`;
    case 'jr': return `${prefix}jr ${hex(inst.target)}`;
    case 'jr-conditional': return `${prefix}jr ${inst.condition}, ${hex(inst.target)}`;
    case 'ret': return `${prefix}ret`;
    case 'ret-conditional': return `${prefix}ret ${inst.condition}`;
    case 'push': return `${prefix}push ${inst.pair}`;
    case 'pop': return `${prefix}pop ${inst.pair}`;
    case 'inc-pair': return `${prefix}inc ${inst.pair}`;
    case 'dec-pair': return `${prefix}dec ${inst.pair}`;
    case 'inc-reg': return `${prefix}inc ${inst.reg}`;
    case 'dec-reg': return `${prefix}dec ${inst.reg}`;
    case 'ld-pair-imm': return `${prefix}ld ${inst.pair}, ${hex(inst.value)}`;
    case 'ld-pair-mem': return `${prefix}ld ${inst.pair}, (${hex(memAddr(inst) ?? inst.addr)})`;
    case 'ld-mem-pair': return `${prefix}ld (${hex(memAddr(inst) ?? inst.addr)}), ${inst.pair}`;
    case 'ld-reg-imm': return `${prefix}ld ${inst.dest}, ${hexByte(inst.value)}`;
    case 'ld-reg-reg': return `${prefix}ld ${inst.dest}, ${inst.src}`;
    case 'ld-reg-ind': return `${prefix}ld ${inst.dest}, (${inst.src})`;
    case 'ld-ind-reg': return `${prefix}ld (${inst.dest}), ${inst.src}`;
    case 'ld-reg-mem': return `${prefix}ld ${inst.dest}, (${hex(memAddr(inst) ?? inst.addr)})`;
    case 'ld-mem-reg': return `${prefix}ld (${hex(memAddr(inst) ?? inst.addr)}), ${inst.src}`;
    case 'ld-reg-ixd': return `${prefix}ld ${inst.dest}, (${inst.indexRegister}${disp(inst.displacement)})`;
    case 'ld-ixd-reg': return `${prefix}ld (${inst.indexRegister}${disp(inst.displacement)}), ${inst.src}`;
    case 'indexed-cb-bit': return `${prefix}bit ${inst.bit}, (${inst.indexRegister}${disp(inst.displacement)})`;
    case 'indexed-cb-set': return `${prefix}set ${inst.bit}, (${inst.indexRegister}${disp(inst.displacement)})`;
    case 'indexed-cb-res': return `${prefix}res ${inst.bit}, (${inst.indexRegister}${disp(inst.displacement)})`;
    case 'alu-imm': return `${prefix}${inst.op} ${hexByte(inst.value)}`;
    case 'alu-reg': return `${prefix}${inst.op} ${inst.src}`;
    case 'ld-sp-hl': return `${prefix}ld sp, hl`;
    case 'ld-sp-ix': return `${prefix}ld sp, ix`;
    case 'ld-sp-iy': return `${prefix}ld sp, iy`;
    case 'add-pair': return `${prefix}add ${inst.dest}, ${inst.src}`;
    case 'add-hl-pair': return `${prefix}add hl, ${inst.pair}`;
    case 'sbc-hl-pair': return `${prefix}sbc hl, ${inst.pair}`;
    case 'adc-hl-pair': return `${prefix}adc hl, ${inst.pair}`;
    case 'ldir': return `${prefix}ldir`;
    case 'lddr': return `${prefix}lddr`;
    case 'nop': return `${prefix}nop`;
    case 'di': return `${prefix}di`;
    case 'ei': return `${prefix}ei`;
    case 'halt': return `${prefix}halt`;
    case 'or-reg': return `${prefix}or ${inst.src}`;
    case 'and-reg': return `${prefix}and ${inst.src}`;
    case 'xor-reg': return `${prefix}xor ${inst.src}`;
    case 'bit': return `${prefix}bit ${inst.bit}, ${inst.src}`;
    case 'set': return `${prefix}set ${inst.bit}, ${inst.src}`;
    case 'res': return `${prefix}res ${inst.bit}, ${inst.src}`;
    default: return `${prefix}${inst.tag}`;
  }
}

function decodeRange(startPc, endPc) {
  const rows = [];
  let pc = startPc & 0xFFFFFF;
  const stop = endPc & 0xFFFFFF;

  while (pc < stop) {
    try {
      const inst = decodeInstruction(rom, pc, 'adl');
      rows.push({
        pcValue: inst.pc >>> 0,
        pc: hex(inst.pc),
        bytes: bytesFor(rom, inst.pc, inst.length),
        text: formatInstruction(inst),
        tag: inst.tag,
        targetValue: Number.isInteger(inst.target) ? (inst.target >>> 0) : null,
        value: inst.value ?? null,
        pair: inst.pair ?? null,
        dest: inst.dest ?? null,
        src: inst.src ?? null,
      });
      pc = (inst.pc + inst.length) & 0xFFFFFF;
    } catch (error) {
      rows.push({
        pcValue: pc,
        pc: hex(pc),
        bytes: bytesFor(rom, pc, 1),
        text: `decode error: ${error.message}`,
        tag: 'decode-error',
        targetValue: null,
        value: null,
        pair: null,
        dest: null,
        src: null,
      });
      pc = (pc + 1) & 0xFFFFFF;
    }
  }

  return rows;
}

function decodePointerRun(startPc, count, expectedValues = null) {
  const entries = [];

  for (let index = 0; index < count; index++) {
    const pc = startPc + index * 3;
    const value = ((rom[pc] & 0xFF) | ((rom[pc + 1] & 0xFF) << 8) | ((rom[pc + 2] & 0xFF) << 16)) >>> 0;
    const expected = expectedValues?.[index] ?? null;
    entries.push({
      index,
      pc: hex(pc),
      bytes: bytesFor(rom, pc, 3),
      value: hex(value),
      matchesExpected: expected === null ? null : value === expected,
      expected: expected === null ? null : hex(expected),
    });
  }

  return entries;
}

function find24Refs(targetValue, startPc, endPc) {
  const refs = [];
  const low = targetValue & 0xFF;
  const mid = (targetValue >>> 8) & 0xFF;
  const high = (targetValue >>> 16) & 0xFF;

  for (let pc = startPc; pc <= endPc - 3; pc++) {
    if (rom[pc] === low && rom[pc + 1] === mid && rom[pc + 2] === high) {
      refs.push(pc);
    }
  }

  return refs;
}

function findEarliestAlignedBlockStart(targetPc, lookback) {
  const minimum = Math.max(0, targetPc - lookback);
  const candidates = ADL_BLOCK_STARTS.filter((value) => value >= minimum && value <= targetPc);
  return candidates.length > 0 ? candidates[0] : minimum;
}

function analyzeDispatchTail() {
  const startPc = findEarliestAlignedBlockStart(DISPATCH_TABLE_ADDR, DISPATCH_TAIL_LOOKBACK);
  const rows = decodeRange(startPc, DISPATCH_TABLE_ADDR + 1);
  const rowBeforeDispatch = rows.find((row) => row.pcValue === (DISPATCH_TABLE_ADDR - 1));
  const dispatchRow = rows.find((row) => row.pcValue === DISPATCH_TABLE_ADDR);

  return {
    startPc: hex(startPc),
    rows,
    observation: rowBeforeDispatch?.tag === 'ret'
      ? `${hex(DISPATCH_TABLE_ADDR - 1)} is a RET before ${hex(DISPATCH_TABLE_ADDR)}, so the byte at ${hex(DISPATCH_TABLE_ADDR)} is fall-through data/executable encoding rather than the continuation of the preceding block.`
      : null,
    dispatchRow: dispatchRow ?? null,
  };
}

function analyzeHlLoads() {
  const refs = find24Refs(DISPATCH_TABLE_ADDR, HL_LOAD_SCAN_START, HL_LOAD_SCAN_END);
  const decodedRefs = refs.map((refPc) => ({
    refPc: hex(refPc),
    rows: decodeRange(refPc, refPc + REF_DISASM_LENGTH),
  }));

  const immediateLoad = decodedRefs.find((ref) =>
    ref.rows.some((row) => row.tag === 'ld-pair-imm' && row.pair === 'hl' && row.value === DISPATCH_TABLE_ADDR)
  );

  return {
    refs: refs.map((value) => hex(value)),
    decodedRefs,
    inference: immediateLoad
      ? {
          type: 'ld-hl-immediate',
          summary: `${hex(DISPATCH_TABLE_ADDR)} is loaded via an immediate HL assignment before a copy/helper call, not via LD HL,(table+offset) in the local tail.`,
          source: immediateLoad.refPc,
        }
      : {
          type: 'unknown',
          summary: 'No immediate HL load for 0x0585D3 was found in the requested scan window.',
          source: null,
        },
  };
}

function summarizeTraceRows(rows) {
  return rows.map((row) => ({
    index: row.index,
    entry: row.requestedEntry,
    key: row.keyCase,
    firstBlock: row.firstExecutableBlock,
    bufInsert: row.hits.bufInsert.reached,
    convKeyToTok: row.hits.reachedAnyConvKeyToTok,
    steps: row.run.steps,
    termination: row.run.termination,
    uniqueBlocks: row.run.uniqueBlockCount,
    iyPlus5: `${row.before.iyPlus5}->${row.after.iyPlus5}`,
    editHeadBefore: row.before.editBuffer,
    editHeadAfter: row.after.editBuffer,
  }));
}

function formatSummaryTable(rows) {
  const body = [
    ['Idx', 'Entry', 'Key', 'First Block', 'BufInsert', 'ConvKey', 'Steps', 'Term', 'Unique', 'IY+5'],
    ...rows.map((row) => [
      String(row.index),
      row.entry,
      row.key,
      row.firstBlock ?? '-',
      row.bufInsert ? 'YES' : 'NO',
      row.convKeyToTok ? 'YES' : 'NO',
      String(row.steps),
      row.termination,
      String(row.uniqueBlocks),
      row.iyPlus5,
    ]),
  ];

  const widths = body[0].map((_, index) => Math.max(...body.map((row) => String(row[index]).length)));

  return body
    .map((row) => row.map((cell, index) => String(cell).padEnd(widths[index], ' ')).join(' | '))
    .join('\n');
}

function main() {
  const baseline = createBaseline();

  const promptTableDecode = decodePointerRun(PROMPT_TABLE_ADDR, 6, PROMPT_TABLE_EXPECTED);
  const alignedTableDecode = decodePointerRun(DISPATCH_TABLE_ADDR, 6, ALIGNED_TABLE_EXPECTED);
  const dispatchTail = analyzeDispatchTail();
  const hlLoads = analyzeHlLoads();

  const digitRuns = ENTRY_SPECS.map((entrySpec) => traceEntryCase(baseline.memory, entrySpec, KEY_CASES.digit1));
  const plusRuns = digitRuns
    .filter((result) => result.hits.bufInsert.reached)
    .map((result) => {
      const entrySpec = ENTRY_SPECS.find((candidate) => candidate.index === result.index);
      return traceEntryCase(baseline.memory, entrySpec, KEY_CASES.plus);
    });

  const allSummaryRows = [
    ...summarizeTraceRows(digitRuns),
    ...summarizeTraceRows(plusRuns),
  ];

  const observations = [];
  const promptMatches = promptTableDecode.every((entry) => entry.matchesExpected === true);
  const alignedMatches = alignedTableDecode.every((entry) => entry.matchesExpected === true);

  if (!promptMatches) {
    observations.push(
      `Decoding six 24-bit values from ${hex(PROMPT_TABLE_ADDR)} does not match the session-204 claim verbatim; the alternate ${hex(DISPATCH_TABLE_ADDR)} alignment matches the known six-context run instead.`
    );
  }

  if (alignedMatches) {
    observations.push(
      `Decoding from ${hex(DISPATCH_TABLE_ADDR)} yields ${ALIGNED_TABLE_EXPECTED.map((value) => hex(value)).join(', ')}, which matches the known cxMain/cxPPutaway/cxPutaway/cxRedisp/cxErrorEP/cxSizeWind sequence.`
    );
  }

  if (hlLoads.inference.type === 'ld-hl-immediate') {
    observations.push(hlLoads.inference.summary);
  }

  console.log('Phase 214: JP(HL) table-entry dispatch probe');
  console.log('');
  console.log('Boot baseline');
  console.log(JSON.stringify({
    bootSequence: `${hex(BOOT_ENTRY)} -> ${hex(KERNEL_INIT_ENTRY)} -> ${hex(POST_INIT_ENTRY)} -> ${hex(MEM_INIT_ENTRY)}`,
    boot: baseline.boot,
    memInit: baseline.memInit,
    baselineFlags: baseline.baselineFlags,
  }, null, 2));
  console.log('');
  console.log(`Prompt pointer decode at ${hex(PROMPT_TABLE_ADDR)} (6 x 24-bit LE)`);
  console.log(JSON.stringify(promptTableDecode, null, 2));
  console.log('');
  console.log(`Alternate aligned decode at ${hex(DISPATCH_TABLE_ADDR)} (6 x 24-bit LE)`);
  console.log(JSON.stringify(alignedTableDecode, null, 2));
  console.log('');
  console.log(`Tail before ${hex(DISPATCH_TABLE_ADDR)}`);
  console.log(JSON.stringify(dispatchTail, null, 2));
  console.log('');
  console.log(`24-bit references to ${hex(DISPATCH_TABLE_ADDR)} in ${hex(HL_LOAD_SCAN_START)}..${hex(HL_LOAD_SCAN_END)}`);
  console.log(JSON.stringify(hlLoads, null, 2));
  console.log('');
  console.log('Trace summary');
  console.log(formatSummaryTable(allSummaryRows));
  console.log('');
  console.log('Observations');
  for (const observation of observations) {
    console.log(`- ${observation}`);
  }
  console.log('');
  console.log(JSON.stringify({
    probe: 'probe-phase214-jp-hl-table-entries.mjs',
    generatedAt: new Date().toISOString(),
    runtime: {
      traceMaxSteps: TRACE_MAX_STEPS,
      stackTop: hex(STACK_TOP),
      returnSentinel: hex(RETURN_SENTINEL),
      iy: hex(IY_ADDR),
      iyPlus5: hex(IY_PLUS_5_ADDR),
      iyPlus12: hex(IY_PLUS_12_ADDR),
      editBufferStart: hex(EDIT_BUF_START),
      editBufferEnd: hex(EDIT_BUF_END),
      tokenStaging: hex(TOKEN_STAGING_ADDR),
      op1: hex(OP1_ADDR),
      bufInsert: hex(BUF_INSERT),
      convKeyToTokTargets: CONV_KEY_TO_TOK_TARGETS.map((value) => hex(value)),
      promptTableAddr: hex(PROMPT_TABLE_ADDR),
      alignedTableAddr: hex(DISPATCH_TABLE_ADDR),
    },
    tableVerification: {
      promptTableExpected: PROMPT_TABLE_EXPECTED.map((value) => hex(value)),
      promptTableDecode,
      promptMatches,
      alignedExpected: ALIGNED_TABLE_EXPECTED.map((value) => hex(value)),
      alignedTableDecode,
      alignedMatches,
    },
    hlLoadAnalysis: {
      dispatchTail,
      refs: hlLoads.refs,
      decodedRefs: hlLoads.decodedRefs,
      inference: hlLoads.inference,
    },
    observations,
    digitRuns,
    plusRuns,
  }, null, 2));
}

main();
