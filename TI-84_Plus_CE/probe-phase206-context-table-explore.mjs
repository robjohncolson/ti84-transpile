#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { PRELIFTED_BLOCKS } from './ROM.transpiled.js';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rom = readFileSync(path.join(__dirname, 'ROM.rom'));

const MEM_SIZE = 0x1000000;

const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const MEM_INIT_ENTRY = 0x09DEE0;

const STACK_TOP = 0xD1A87E;
const REQUESTED_SP = 0xD1A860;
const MBASE = 0xD0;
const IY_ADDR = 0xD00080;
const IX_ADDR = 0xD1A860;

const MEM_INIT_RET = 0x7FFFF6;
const RETURN_SENTINEL = 0x7FFFFE;

const BOOT_MAX_STEPS = 20000;
const KERNEL_INIT_MAX_STEPS = 100000;
const POST_INIT_MAX_STEPS = 100;
const MEM_INIT_MAX_STEPS = 100000;
const TRACE_STEP_LIMIT = 500;
const CLASS_SWEEP_STEP_LIMIT = 200;
const MAX_LOOP_ITERATIONS = 8192;

const BUF_INSERT = 0x05E2A0;
const HOME_BODY_ENTRY = 0x0582BC;

const STAT_RANGE = { start: 0x091E00, end: 0x0930FF };
const YEQ_RANGE = { start: 0x09CB00, end: 0x09CB30 };
const FP_RANGE = { start: 0x07B000, end: 0x07D000 };

const OP1_ADDR = 0xD005F8;
const TOKEN_STAGING_ADDR = 0xD0230E;
const IY_PLUS_12_ADDR = IY_ADDR + 12;

const EDIT_TOP_ADDR = 0xD02437;
const EDIT_CURSOR_ADDR = 0xD0243A;
const EDIT_TAIL_ADDR = 0xD0243D;
const EDIT_BTM_ADDR = 0xD02440;
const EDIT_BUF_START = 0xD00A00;
const EDIT_BUF_END = 0xD00B00;

const DIGIT4_TOKEN = Uint8Array.from([
  0x00, 0x34, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
]);

const TABLE_ENTRIES = [
  { index: 0, entry: 0x058585, label: 'entry0_unknown' },
  { index: 1, entry: 0x058B19, label: 'entry1_cxPPutaway' },
  { index: 2, entry: 0x058B7E, label: 'entry2_unknown' },
  { index: 3, entry: 0x0582BC, label: 'entry3_home_body_baseline' },
  { index: 4, entry: 0x058BA9, label: 'entry4_cxErrorEP_stat' },
  { index: 5, entry: 0x058C01, label: 'entry5_unknown' },
];

const DISASSEMBLY_TARGETS = [
  { index: 0, entry: 0x058585, label: 'entry0_unknown' },
  { index: 2, entry: 0x058B7E, label: 'entry2_unknown' },
  { index: 5, entry: 0x058C01, label: 'entry5_unknown' },
];

const CLASS_SWEEP = [
  { classValue: 0x00, label: 'digit' },
  { classValue: 0x01, label: 'operator' },
  { classValue: 0x02, label: 'function' },
  { classValue: 0x03, label: 'unknown_3' },
  { classValue: 0x04, label: 'unknown_4' },
  { classValue: 0x05, label: 'special' },
];

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
  mem[addr] = value & 0xFF;
  mem[addr + 1] = (value >>> 8) & 0xFF;
  mem[addr + 2] = (value >>> 16) & 0xFF;
}

function createMemory() {
  return new Uint8Array(MEM_SIZE);
}

function createCPU(mem) {
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(PRELIFTED_BLOCKS, mem, { peripherals });
  return { cpu: executor.cpu, executor };
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
  executor.runFrom(BOOT_ENTRY, 'z80', {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: 32,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
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

  executor.runFrom(POST_INIT_ENTRY, 'adl', {
    maxSteps: POST_INIT_MAX_STEPS,
    maxLoopIterations: 32,
  });
}

function runMemInit(executor, cpu, mem) {
  resetOsState(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEM_INIT_RET);
  let returned = false;

  try {
    executor.runFrom(MEM_INIT_ENTRY, 'adl', {
      maxSteps: MEM_INIT_MAX_STEPS,
      maxLoopIterations: MAX_LOOP_ITERATIONS,
      onBlock(pc) {
        if ((pc & 0xFFFFFF) === MEM_INIT_RET) throw new Error('__RET__');
      },
      onMissingBlock(pc) {
        if ((pc & 0xFFFFFF) === MEM_INIT_RET) throw new Error('__RET__');
      },
    });
  } catch (error) {
    if (error?.message === '__RET__') returned = true;
    else throw error;
  }

  return { returned };
}

function createBaseline() {
  const mem = createMemory();
  mem.set(rom.subarray(0, Math.min(mem.length, rom.length)));
  const { cpu, executor } = createCPU(mem);
  coldBoot(executor, cpu, mem);
  const memInit = runMemInit(executor, cpu, mem);
  return {
    mem: new Uint8Array(mem),
    memInitReturned: memInit.returned,
  };
}

function seedEditBuffer(mem) {
  write24(mem, EDIT_TOP_ADDR, EDIT_BUF_START);
  write24(mem, EDIT_CURSOR_ADDR, EDIT_BUF_START);
  write24(mem, EDIT_TAIL_ADDR, EDIT_BUF_END);
  write24(mem, EDIT_BTM_ADDR, EDIT_BUF_END);
  mem.fill(0x00, EDIT_BUF_START, EDIT_BUF_END);
}

function seedDirectEntry(cpu, mem, classValue, tokenBytes = DIGIT4_TOKEN) {
  resetOsState(cpu, mem);

  mem.fill(0x00, OP1_ADDR, OP1_ADDR + 9);
  mem.fill(0x00, TOKEN_STAGING_ADDR, TOKEN_STAGING_ADDR + 9);
  mem.set(tokenBytes, OP1_ADDR);
  mem.set(tokenBytes, TOKEN_STAGING_ADDR);

  seedEditBuffer(mem);
  mem[IY_PLUS_12_ADDR] &= 0x7F;

  cpu.a = classValue & 0xFF;
  cpu.b = classValue & 0xFF;
  cpu.c = 0x00;
  cpu.d = 0x00;
  cpu.e = 0x00;
  cpu.ix = IX_ADDR;
  cpu.iy = IY_ADDR;

  mem.fill(0xFF, Math.max(0, REQUESTED_SP - 0x40), Math.min(mem.length, REQUESTED_SP + 0x10));
  cpu.sp = REQUESTED_SP;
  cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
  write24(mem, cpu.sp, RETURN_SENTINEL);

  return {
    classValue: hexByte(classValue),
    mirroredB: hexByte(classValue),
    ix: hex(cpu.ix),
    iy: hex(cpu.iy),
    requestedSp: hex(REQUESTED_SP),
    entrySp: hex(cpu.sp),
    mbase: hexByte(cpu.mbase),
    tokenBytes: bytesFor(tokenBytes, 0, tokenBytes.length),
  };
}

function inRange(value, range) {
  return value >= range.start && value <= range.end;
}

function createAreaHit(label) {
  return {
    label,
    reached: false,
    firstStep: null,
    firstPc: null,
  };
}

function recordHit(hit, pc, step) {
  if (hit.reached) return;
  hit.reached = true;
  hit.firstStep = step;
  hit.firstPc = hex(pc);
}

function makeReturnSentinel() {
  const error = new Error('__RET__');
  error.isReturnSentinel = true;
  return error;
}

function classifyTrace(hits, missingBlocks, termination) {
  if (hits.bufInsert.reached) return 'BufInsert path';
  if (hits.statArea.reached) return 'STAT-area path';
  if (hits.yEqArea.reached) return 'Y=-area path';
  if (hits.fpArea.reached) return 'FP/math-area path';
  if (missingBlocks.length > 0) return 'missing-block exit';
  if (termination === 'return') return 'returned to sentinel';
  if (termination === 'missing_block') return 'missing-block termination';
  if (termination === 'error') return 'executor error';
  return 'local/unclassified path';
}

function traceEntry(baselineMem, spec) {
  const mem = new Uint8Array(baselineMem);
  const { cpu, executor } = createCPU(mem);
  const setup = seedDirectEntry(cpu, mem, spec.classValue ?? 0x00, spec.tokenBytes ?? DIGIT4_TOKEN);

  const visitedSet = new Set();
  const visitedBlocks = [];
  const missingSet = new Set();
  const missingBlocks = [];

  const hits = {
    bufInsert: createAreaHit('BufInsert'),
    statArea: createAreaHit('STAT'),
    yEqArea: createAreaHit('Y='),
    fpArea: createAreaHit('FP/math'),
  };

  let steps = 0;
  let lastPc = spec.entry;
  let termination = 'max_steps';
  let errorMessage = null;

  const notePc = (pc, step) => {
    const normalized = pc & 0xFFFFFF;
    const stepNumber = (step ?? 0) + 1;
    steps = Math.max(steps, stepNumber);
    lastPc = normalized;

    if (!visitedSet.has(normalized)) {
      visitedSet.add(normalized);
      visitedBlocks.push(normalized);
    }

    if (normalized === BUF_INSERT) recordHit(hits.bufInsert, normalized, stepNumber);
    if (inRange(normalized, STAT_RANGE)) recordHit(hits.statArea, normalized, stepNumber);
    if (inRange(normalized, YEQ_RANGE)) recordHit(hits.yEqArea, normalized, stepNumber);
    if (inRange(normalized, FP_RANGE)) recordHit(hits.fpArea, normalized, stepNumber);

    if (normalized === RETURN_SENTINEL) throw makeReturnSentinel();
  };

  try {
    const result = executor.runFrom(spec.entry, 'adl', {
      maxSteps: spec.stepLimit ?? TRACE_STEP_LIMIT,
      maxLoopIterations: MAX_LOOP_ITERATIONS,
      onBlock(pc, _mode, _meta, step) {
        notePc(pc, step);
      },
      onMissingBlock(pc, _mode, step) {
        const normalized = pc & 0xFFFFFF;
        notePc(pc, step);
        if (!missingSet.has(normalized)) {
          missingSet.add(normalized);
          missingBlocks.push(normalized);
        }
      },
    });

    termination = result.termination ?? termination;
    steps = Math.max(steps, result.steps ?? 0);
    lastPc = (result.lastPc ?? lastPc) & 0xFFFFFF;

    if (result.error) {
      errorMessage = result.error?.stack ?? String(result.error);
    }
  } catch (error) {
    if (error?.isReturnSentinel) {
      termination = 'return';
    } else {
      termination = 'exception';
      errorMessage = error?.stack ?? String(error);
    }
  }

  const visitedBlocksHex = visitedBlocks.map((pc) => hex(pc));
  const missingBlocksHex = missingBlocks.map((pc) => hex(pc));

  return {
    index: spec.index ?? null,
    label: spec.label,
    entry: hex(spec.entry),
    setup,
    run: {
      stepLimit: spec.stepLimit ?? TRACE_STEP_LIMIT,
      steps,
      termination,
      uniqueBlockCount: visitedBlocks.length,
      visitedBlocksFirst30: visitedBlocksHex.slice(0, 30),
      pathNote: classifyTrace(hits, missingBlocksHex, termination),
      pathPreview: visitedBlocksHex.slice(0, 12),
    },
    hits,
    final: {
      pc: hex(lastPc),
      sp: hex(cpu.sp),
      a: hexByte(cpu.a),
    },
    missingBlocks: missingBlocksHex,
    error: errorMessage,
  };
}

function formatInstruction(inst) {
  const prefix = inst.modePrefix ? `${inst.modePrefix} ` : '';
  const disp = (value) => (value >= 0 ? `+${value}` : `${value}`);

  switch (inst.tag) {
    case 'nop': return `${prefix}nop`;
    case 'halt': return `${prefix}halt`;
    case 'di': return `${prefix}di`;
    case 'ei': return `${prefix}ei`;
    case 'rlca': return `${prefix}rlca`;
    case 'rrca': return `${prefix}rrca`;
    case 'rla': return `${prefix}rla`;
    case 'rra': return `${prefix}rra`;
    case 'daa': return `${prefix}daa`;
    case 'cpl': return `${prefix}cpl`;
    case 'scf': return `${prefix}scf`;
    case 'ccf': return `${prefix}ccf`;
    case 'exx': return `${prefix}exx`;
    case 'ex-af': return `${prefix}ex af, af'`;
    case 'ex-de-hl': return `${prefix}ex de, hl`;
    case 'ex-sp-hl': return `${prefix}ex (sp), hl`;
    case 'ex-sp-pair': return `${prefix}ex (sp), ${inst.pair}`;
    case 'neg': return `${prefix}neg`;
    case 'retn': return `${prefix}retn`;
    case 'reti': return `${prefix}reti`;
    case 'rrd': return `${prefix}rrd`;
    case 'rld': return `${prefix}rld`;
    case 'ldi': return `${prefix}ldi`;
    case 'ldd': return `${prefix}ldd`;
    case 'ldir': return `${prefix}ldir`;
    case 'lddr': return `${prefix}lddr`;
    case 'cpi': return `${prefix}cpi`;
    case 'cpd': return `${prefix}cpd`;
    case 'cpir': return `${prefix}cpir`;
    case 'cpdr': return `${prefix}cpdr`;
    case 'ini': return `${prefix}ini`;
    case 'outi': return `${prefix}outi`;
    case 'ind': return `${prefix}ind`;
    case 'outd': return `${prefix}outd`;
    case 'inir': return `${prefix}inir`;
    case 'otir': return `${prefix}otir`;
    case 'indr': return `${prefix}indr`;
    case 'otdr': return `${prefix}otdr`;
    case 'otimr': return `${prefix}otimr`;
    case 'slp': return `${prefix}slp`;
    case 'stmix': return `${prefix}stmix`;
    case 'rsmix': return `${prefix}rsmix`;
    case 'ld-mb-a': return `${prefix}ld mb, a`;
    case 'ld-a-mb': return `${prefix}ld a, mb`;
    case 'ld-sp-hl': return `${prefix}ld sp, hl`;
    case 'ld-sp-pair': return `${prefix}ld sp, ${inst.pair}`;
    case 'im': return `${prefix}im ${inst.value}`;
    case 'ld-special': return `${prefix}ld ${inst.dest}, ${inst.src}`;
    case 'push': return `${prefix}push ${inst.pair}`;
    case 'pop': return `${prefix}pop ${inst.pair}`;
    case 'ld-pair-imm': return `${prefix}ld ${inst.pair}, ${hex(inst.value)}`;
    case 'ld-pair-mem': return `${prefix}ld ${inst.pair}, (${hex(inst.addr)})`;
    case 'ld-mem-pair': return `${prefix}ld (${hex(inst.addr)}), ${inst.pair}`;
    case 'ld-reg-imm': return `${prefix}ld ${inst.dest}, ${hexByte(inst.value)}`;
    case 'ld-reg-reg': return `${prefix}ld ${inst.dest}, ${inst.src}`;
    case 'ld-reg-ind': return `${prefix}ld ${inst.dest}, (${inst.src})`;
    case 'ld-ind-reg': return `${prefix}ld (${inst.dest}), ${inst.src}`;
    case 'ld-ind-imm': return `${prefix}ld (hl), ${hexByte(inst.value)}`;
    case 'ld-reg-mem': return `${prefix}ld ${inst.dest}, (${hex(inst.addr)})`;
    case 'ld-mem-reg': return `${prefix}ld (${hex(inst.addr)}), ${inst.src}`;
    case 'ld-reg-ixd':
      return `${prefix}ld ${inst.dest}, (${inst.indexRegister}${disp(inst.displacement)})`;
    case 'ld-ixd-reg':
      return `${prefix}ld (${inst.indexRegister}${disp(inst.displacement)}), ${inst.src}`;
    case 'ld-ixd-imm':
      return `${prefix}ld (${inst.indexRegister}${disp(inst.displacement)}), ${hexByte(inst.value)}`;
    case 'inc-ixd':
      return `${prefix}inc (${inst.indexRegister}${disp(inst.displacement)})`;
    case 'dec-ixd':
      return `${prefix}dec (${inst.indexRegister}${disp(inst.displacement)})`;
    case 'alu-imm': return `${prefix}${inst.op} ${hexByte(inst.value)}`;
    case 'alu-reg': return `${prefix}${inst.op} ${inst.src}`;
    case 'alu-ixd':
      return `${prefix}${inst.op} (${inst.indexRegister}${disp(inst.displacement)})`;
    case 'call': return `${prefix}call ${hex(inst.target)}`;
    case 'call-conditional': return `${prefix}call ${inst.condition}, ${hex(inst.target)}`;
    case 'jp': return `${prefix}jp ${hex(inst.target)}`;
    case 'jp-conditional': return `${prefix}jp ${inst.condition}, ${hex(inst.target)}`;
    case 'jp-indirect': return `${prefix}jp (${inst.indirectRegister})`;
    case 'jr': return `${prefix}jr ${hex(inst.target)}`;
    case 'jr-conditional': return `${prefix}jr ${inst.condition}, ${hex(inst.target)}`;
    case 'djnz': return `${prefix}djnz ${hex(inst.target)}`;
    case 'ret': return `${prefix}ret`;
    case 'ret-conditional': return `${prefix}ret ${inst.condition}`;
    case 'rst': return `${prefix}rst ${hexByte(inst.target)}`;
    case 'inc-pair': return `${prefix}inc ${inst.pair}`;
    case 'dec-pair': return `${prefix}dec ${inst.pair}`;
    case 'inc-reg': return `${prefix}inc ${inst.reg}`;
    case 'dec-reg': return `${prefix}dec ${inst.reg}`;
    case 'add-pair': return `${prefix}add ${inst.dest}, ${inst.src}`;
    case 'adc-pair': return `${prefix}adc hl, ${inst.src}`;
    case 'sbc-pair': return `${prefix}sbc hl, ${inst.src}`;
    case 'mlt': return `${prefix}mlt ${inst.reg}`;
    case 'rotate-reg': return `${prefix}${inst.op} ${inst.reg}`;
    case 'rotate-ind': return `${prefix}${inst.op} (hl)`;
    case 'bit-test': return `${prefix}bit ${inst.bit}, ${inst.reg}`;
    case 'bit-test-ind': return `${prefix}bit ${inst.bit}, (hl)`;
    case 'bit-res': return `${prefix}res ${inst.bit}, ${inst.reg}`;
    case 'bit-res-ind': return `${prefix}res ${inst.bit}, (hl)`;
    case 'bit-set': return `${prefix}set ${inst.bit}, ${inst.reg}`;
    case 'bit-set-ind': return `${prefix}set ${inst.bit}, (hl)`;
    case 'indexed-cb-rotate':
      return `${prefix}${inst.operation} (${inst.indexRegister}${disp(inst.displacement)})`;
    case 'indexed-cb-bit':
      return `${prefix}bit ${inst.bit}, (${inst.indexRegister}${disp(inst.displacement)})`;
    case 'indexed-cb-res':
      return `${prefix}res ${inst.bit}, (${inst.indexRegister}${disp(inst.displacement)})`;
    case 'indexed-cb-set':
      return `${prefix}set ${inst.bit}, (${inst.indexRegister}${disp(inst.displacement)})`;
    case 'out-imm': return `${prefix}out (${hexByte(inst.port)}), a`;
    case 'in-imm': return `${prefix}in a, (${hexByte(inst.port)})`;
    case 'out-reg': return `${prefix}out (c), ${inst.reg}`;
    case 'in-reg': return `${prefix}in ${inst.reg}, (c)`;
    case 'in0': return `${prefix}in0 ${inst.reg}, (${hexByte(inst.port)})`;
    case 'out0': return `${prefix}out0 (${hexByte(inst.port)}), ${inst.reg}`;
    case 'tst-reg': return `${prefix}tst a, ${inst.reg}`;
    case 'tst-ind': return `${prefix}tst a, (hl)`;
    case 'tst-imm': return `${prefix}tst a, ${hexByte(inst.value)}`;
    case 'tstio': return `${prefix}tstio ${hexByte(inst.value)}`;
    case 'lea':
      return `${prefix}lea ${inst.dest}, ${inst.base}${disp(inst.displacement)}`;
    case 'ld-pair-indexed':
      return `${prefix}ld ${inst.pair}, (${inst.indexRegister}${disp(inst.displacement)})`;
    case 'ld-indexed-pair':
      return `${prefix}ld (${inst.indexRegister}${disp(inst.displacement)}), ${inst.pair}`;
    case 'ld-ixiy-indexed':
      return `${prefix}ld ${inst.dest}, (${inst.indexRegister}${disp(inst.displacement)})`;
    case 'ld-indexed-ixiy':
      return `${prefix}ld (${inst.indexRegister}${disp(inst.displacement)}), ${inst.src}`;
    case 'ld-pair-ind': return `${prefix}ld ${inst.pair}, (${inst.src})`;
    case 'ld-ind-pair': return `${prefix}ld (${inst.dest}), ${inst.pair}`;
    default: return `${prefix}${inst.tag}`;
  }
}

function disassembleSequential(entry, count) {
  const rows = [];
  let pc = entry & 0xFFFFFF;

  for (let index = 0; index < count; index += 1) {
    try {
      const inst = decodeInstruction(rom, pc, 'adl');
      rows.push({
        index,
        pc: hex(inst.pc),
        bytes: bytesFor(rom, inst.pc, inst.length),
        text: formatInstruction(inst),
        tag: inst.tag,
        length: inst.length,
      });
      pc = (inst.pc + inst.length) & 0xFFFFFF;
    } catch (error) {
      rows.push({
        index,
        pc: hex(pc),
        bytes: bytesFor(rom, pc, 1),
        text: `decode error: ${error?.message ?? String(error)}`,
        tag: 'decode-error',
        length: 1,
      });
      pc = (pc + 1) & 0xFFFFFF;
    }
  }

  return rows;
}

function summarizeEntry(entryResult) {
  return {
    label: entryResult.label,
    entry: entryResult.entry,
    uniqueBlocks: entryResult.run.uniqueBlockCount,
    pathNote: entryResult.run.pathNote,
    bufInsert: entryResult.hits.bufInsert.reached,
    statArea: entryResult.hits.statArea.reached,
    yEqArea: entryResult.hits.yEqArea.reached,
    fpArea: entryResult.hits.fpArea.reached,
    finalPc: entryResult.final.pc,
    finalSp: entryResult.final.sp,
    finalA: entryResult.final.a,
    missingBlocks: entryResult.missingBlocks,
  };
}

function main() {
  const baseline = createBaseline();

  const tableEntryResults = TABLE_ENTRIES.map((spec) =>
    traceEntry(baseline.mem, {
      ...spec,
      classValue: 0x00,
      tokenBytes: DIGIT4_TOKEN,
      stepLimit: TRACE_STEP_LIMIT,
    })
  );

  const classSweepResults = CLASS_SWEEP.map((spec) =>
    traceEntry(baseline.mem, {
      index: 3,
      label: `home_body_class_${spec.label}`,
      entry: HOME_BODY_ENTRY,
      classValue: spec.classValue,
      tokenBytes: DIGIT4_TOKEN,
      stepLimit: CLASS_SWEEP_STEP_LIMIT,
    })
  );

  const disassembly = Object.fromEntries(
    DISASSEMBLY_TARGETS.map((spec) => [
      spec.label,
      {
        entry: hex(spec.entry),
        instructions: disassembleSequential(spec.entry, 10),
      },
    ])
  );

  return {
    probe: 'probe-phase206-context-table-explore.mjs',
    generatedAt: new Date().toISOString(),
    runtime: {
      timerInterrupt: false,
      baselineMemInitReturned: baseline.memInitReturned,
      entryTraceStepLimit: TRACE_STEP_LIMIT,
      classSweepStepLimit: CLASS_SWEEP_STEP_LIMIT,
      requestedRegisters: {
        ix: hex(IX_ADDR),
        iy: hex(IY_ADDR),
        sp: hex(REQUESTED_SP),
        mbase: hexByte(MBASE),
      },
      tokenControl: {
        label: 'digit4_control',
        bytes: bytesFor(DIGIT4_TOKEN, 0, DIGIT4_TOKEN.length),
        note: 'OP1/token staging stays on the digit4 payload for the table sweep and the home-body class sweep so only the entry point or class value changes.',
      },
      traceAreas: {
        bufInsert: hex(BUF_INSERT),
        statRange: `${hex(STAT_RANGE.start)}..${hex(STAT_RANGE.end)}`,
        yEqRange: `${hex(YEQ_RANGE.start)}..${hex(YEQ_RANGE.end)}`,
        fpRange: `${hex(FP_RANGE.start)}..${hex(FP_RANGE.end)}`,
      },
    },
    tableEntries: tableEntryResults,
    staticDisassembly: disassembly,
    homeBodyClassSweep: classSweepResults,
    summary: {
      tableEntries: tableEntryResults.map(summarizeEntry),
      homeBodyClassSweep: classSweepResults.map((result) => ({
        label: result.label,
        classValue: result.setup.classValue,
        uniqueBlocks: result.run.uniqueBlockCount,
        pathNote: result.run.pathNote,
        pathPreview: result.run.pathPreview,
        bufInsert: result.hits.bufInsert.reached,
        statArea: result.hits.statArea.reached,
        yEqArea: result.hits.yEqArea.reached,
        fpArea: result.hits.fpArea.reached,
        finalPc: result.final.pc,
        finalSp: result.final.sp,
        finalA: result.final.a,
      })),
    },
  };
}

try {
  console.log(JSON.stringify(main(), null, 2));
} catch (error) {
  console.log(JSON.stringify({
    probe: 'probe-phase206-context-table-explore.mjs',
    error: {
      message: error?.message ?? String(error),
      stack: error?.stack ?? String(error),
    },
  }, null, 2));
  process.exitCode = 1;
}
