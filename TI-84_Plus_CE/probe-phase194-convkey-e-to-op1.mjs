#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');

if (!fs.existsSync(TRANSPILED_PATH)) {
  throw new Error(
    'Missing TI-84_Plus_CE/ROM.transpiled.js. Gunzip ROM.transpiled.js.gz first, then rerun this probe.',
  );
}

const romBytes = fs.readFileSync(ROM_PATH);
const romModule = await import(pathToFileURL(TRANSPILED_PATH).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const MEM_SIZE = 0x1000000;
const STACK_TOP = 0xD1A87E;
const MBASE = 0xD0;
const IY_ADDR = 0xD00080;
const IX_ADDR = 0xD1A860;

const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const MEM_INIT_ENTRY = 0x09DEE0;
const CREATE_REAL_ENTRY = 0x08238A;

const CONV_KEY_TO_TOK = 0x05C52C;
const COPY9_CORE = 0x07F978;
const COPY9_TO_OP1 = 0x07F9FB;
const COPY9_FROM_OP1 = 0x07FA0D;

const OP1_ADDR = 0xD005F8;
const TOKEN_STAGING_ADDR = 0xD0230E;
const TOKEN_LENGTH = 9;

const KBD_RAW_SCAN_ADDR = 0xD00587;
const KBD_KEY_ADDR = 0xD0058C;
const KBD_GETKY_ADDR = 0xD0058D;
const KBD_GETCSC_SCAN_ADDR = 0xD0058E;

const ROM_ERRSP_ADDR = 0xD008E0;
const ROM_ERRNO_ADDR = 0xD008DF;

const CREATE_REAL_RET = 0x7FFFFE;
const CREATE_REAL_ERR = 0x7FFFFA;
const MEM_INIT_RET = 0x7FFFF6;
const TRACE_RET = 0x7FFFF0;

const ANS_NAME_OP1 = Uint8Array.from([0x00, 0x72, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
const SEEDED_KEY_CODE = 0x92;
const SEEDED_TOKEN_BYTE = 0x32;

const SEGMENT_STEP_LIMIT = 2000;
const BOOT_MAX_STEPS = 20000;
const KERNEL_INIT_MAX_STEPS = 100000;
const POST_INIT_MAX_STEPS = 100;
const MEM_INIT_MAX_STEPS = 100000;
const CREATE_REAL_MAX_STEPS = 50000;
const OS_MAX_LOOP_ITERATIONS = 8192;

const TRACE_EVENT_LIMIT = 64;
const WRITE_EVENT_LIMIT = 64;
const WATCH_SNAPSHOT_LIMIT = 48;
const BLOCK_DISASM_LIMIT = 16;

const CONTROL_FLOW_TAGS = new Set([
  'call',
  'call-conditional',
  'djnz',
  'jp',
  'jp-conditional',
  'jp-indirect',
  'jr',
  'jr-conditional',
  'ret',
  'ret-conditional',
  'reti',
  'retn',
  'rst',
]);

const WATCH_LABELS = new Map([
  [0x05E620, 'A requested entry'],
  [0x05E630, 'A ConvKeyToTok call site'],
  [0x05E35A, 'A post-call helper'],
  [0x05E37D, 'A alternate post-call helper'],
  [0x05E910, 'B requested entry'],
  [0x05E91A, 'B ConvKeyToTok call site'],
  [0x05C52C, 'ConvKeyToTok'],
  [0x07F978, 'Copy9 core'],
  [0x07F9FB, 'Copy9 wrapper to OP1'],
  [0x07FA0D, 'Copy9 wrapper from OP1'],
  [0x099AE0, 'C requested entry (mid-instruction)'],
  [0x099AE1, 'C first aligned block after requested entry'],
  [0x099AF1, 'C OP1 -> TOKEN_STAGING wrapper'],
  [0x099B56, 'C helper before 0x099AF1'],
  [0x0620E6, 'D helper before 0x06214C'],
  [0x062130, 'D requested entry'],
  [0x06214C, 'D OP1 -> TOKEN_STAGING wrapper'],
]);

const EXPERIMENTS = [
  {
    id: 'A',
    entry: 0x05E620,
    maxSteps: 3000,
    entryDisasmStart: 0x05E620,
    entryDisasmLength: 0x30,
    clearOp1: false,
    notes: [
      '0x05E620 is in the tail of the preceding routine; 0x05E630 starts a new routine after the RET at 0x05E62F.',
      'The stack is seeded with a saved-HL placeholder plus repeated sentinels so the skipped PUSH/POP pattern at 0x05E61F/0x05E624 has something to consume.',
    ],
    setup(cpu, mem) {
      seedKeyContext(mem, cpu);
      pushStackValues(mem, cpu, [TOKEN_STAGING_ADDR, TRACE_RET, TRACE_RET, TRACE_RET, TRACE_RET, TRACE_RET]);
    },
  },
  {
    id: 'B',
    entry: 0x05E910,
    maxSteps: 3000,
    entryDisasmStart: 0x05E910,
    entryDisasmLength: 0x30,
    clearOp1: false,
    notes: [],
    setup(cpu, mem) {
      seedKeyContext(mem, cpu);
      pushStackValues(mem, cpu, [TRACE_RET, TRACE_RET, TRACE_RET, TRACE_RET, TRACE_RET]);
    },
  },
  {
    id: 'C',
    entry: 0x099AE0,
    maxSteps: 1000,
    entryDisasmStart: 0x099AE0,
    entryDisasmLength: 0x20,
    clearOp1: true,
    notes: [
      '0x099AE0 lands on the final byte of the preceding CALL immediate; the executor will likely report a missing block at 0x099AE0 and resume at 0x099AE1.',
    ],
    setup(cpu, mem) {
      seedKeyContext(mem, cpu);
      mem.fill(0x00, OP1_ADDR, OP1_ADDR + TOKEN_LENGTH);
      pushStackValues(mem, cpu, [TRACE_RET, TRACE_RET, TRACE_RET, TRACE_RET, TRACE_RET]);
    },
  },
  {
    id: 'D',
    entry: 0x062130,
    maxSteps: 1000,
    entryDisasmStart: 0x062130,
    entryDisasmLength: 0x30,
    clearOp1: true,
    notes: [],
    setup(cpu, mem) {
      seedKeyContext(mem, cpu);
      mem.fill(0x00, OP1_ADDR, OP1_ADDR + TOKEN_LENGTH);
      pushStackValues(mem, cpu, [TRACE_RET, TRACE_RET, TRACE_RET, TRACE_RET, TRACE_RET]);
    },
  },
];

function hex(value, width = 6) {
  if (value === null || value === undefined) return null;
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return (value & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

function hexBytes(buffer, start, length) {
  const out = [];
  for (let i = 0; i < length; i += 1) {
    out.push(hexByte(buffer[(start + i) & 0xFFFFFF] ?? 0));
  }
  return out.join(' ');
}

function read24(mem, addr) {
  const a = addr & 0xFFFFFF;
  return ((mem[a] & 0xFF) | ((mem[a + 1] & 0xFF) << 8) | ((mem[a + 2] & 0xFF) << 16)) >>> 0;
}

function write24(mem, addr, value) {
  const a = addr & 0xFFFFFF;
  mem[a] = value & 0xFF;
  mem[a + 1] = (value >>> 8) & 0xFF;
  mem[a + 2] = (value >>> 16) & 0xFF;
}

function cap(list, value, limit = TRACE_EVENT_LIMIT) {
  if (list.length < limit) list.push(value);
}

function snapshotCpu(cpu) {
  return {
    pc: hex(cpu._currentBlockPc ?? 0),
    sp: hex(cpu.sp),
    a: hex(cpu.a, 2),
    e: hex(cpu.e, 2),
    f: hex(cpu.f, 2),
    hl: hex(cpu.hl),
    de: hex(cpu.de),
    bc: hex(cpu.bc),
    ix: hex(cpu.ix),
    iy: hex(cpu.iy),
    madl: cpu.madl,
    mbase: hex(cpu.mbase, 2),
  };
}

function memAddr(inst) {
  if (!Number.isInteger(inst?.addr)) return null;
  if (inst.modePrefix === 'sis' || inst.modePrefix === 'lis') {
    return ((MBASE << 16) | (inst.addr & 0xFFFF)) >>> 0;
  }
  return inst.addr >>> 0;
}

function signed(value) {
  return value >= 0 ? `+${value}` : `${value}`;
}

function formatInstruction(inst) {
  if (!inst) return 'decode-error';
  const mode = inst.modePrefix ? `${inst.modePrefix} ` : '';
  const h = (value, width = 6) => hex(value, width);
  switch (inst.tag) {
    case 'nop': return `${mode}nop`;
    case 'call': return `${mode}call ${h(inst.target)}`;
    case 'call-conditional': return `${mode}call ${inst.condition}, ${h(inst.target)}`;
    case 'jp': return `${mode}jp ${h(inst.target)}`;
    case 'jp-conditional': return `${mode}jp ${inst.condition}, ${h(inst.target)}`;
    case 'jp-indirect': return `${mode}jp (${inst.indirectRegister})`;
    case 'jr': return `${mode}jr ${h(inst.target)}`;
    case 'jr-conditional': return `${mode}jr ${inst.condition}, ${h(inst.target)}`;
    case 'ret': return `${mode}ret`;
    case 'ret-conditional': return `${mode}ret ${inst.condition}`;
    case 'push': return `${mode}push ${inst.pair}`;
    case 'pop': return `${mode}pop ${inst.pair}`;
    case 'inc-pair': return `${mode}inc ${inst.pair}`;
    case 'dec-pair': return `${mode}dec ${inst.pair}`;
    case 'inc-reg': return `${mode}inc ${inst.reg}`;
    case 'dec-reg': return `${mode}dec ${inst.reg}`;
    case 'ld-pair-imm': return `${mode}ld ${inst.pair}, ${h(inst.value)}`;
    case 'ld-pair-mem': return `${mode}ld ${inst.pair}, (${h(memAddr(inst) ?? inst.addr)})`;
    case 'ld-mem-pair': return `${mode}ld (${h(memAddr(inst) ?? inst.addr)}), ${inst.pair}`;
    case 'ld-reg-imm': return `${mode}ld ${inst.dest}, ${h(inst.value, 2)}`;
    case 'ld-reg-reg': return `${mode}ld ${inst.dest}, ${inst.src}`;
    case 'ld-reg-ind': return `${mode}ld ${inst.dest}, (${inst.src})`;
    case 'ld-ind-reg': return `${mode}ld (${inst.dest}), ${inst.src}`;
    case 'ld-reg-mem': return `${mode}ld ${inst.dest}, (${h(memAddr(inst) ?? inst.addr)})`;
    case 'ld-mem-reg': return `${mode}ld (${h(memAddr(inst) ?? inst.addr)}), ${inst.src}`;
    case 'ld-reg-ixd': return `${mode}ld ${inst.dest}, (${inst.indexRegister}${signed(inst.displacement)})`;
    case 'ld-ixd-reg': return `${mode}ld (${inst.indexRegister}${signed(inst.displacement)}), ${inst.src}`;
    case 'ld-ixd-imm': return `${mode}ld (${inst.indexRegister}${signed(inst.displacement)}), ${h(inst.value, 2)}`;
    case 'ld-ind-imm': return `${mode}ld (hl), ${h(inst.value, 2)}`;
    case 'alu-imm': return `${mode}${inst.op} ${h(inst.value, 2)}`;
    case 'alu-reg': return `${mode}${inst.op} ${inst.src}`;
    case 'alu-ixd': return `${mode}${inst.op} (${inst.indexRegister}${signed(inst.displacement)})`;
    case 'add-pair': return `${mode}add ${inst.dest}, ${inst.src}`;
    case 'adc-pair': return `${mode}adc hl, ${inst.src}`;
    case 'sbc-pair': return `${mode}sbc hl, ${inst.src}`;
    case 'bit-test': return `${mode}bit ${inst.bit}, ${inst.reg}`;
    case 'bit-test-ind': return `${mode}bit ${inst.bit}, (hl)`;
    case 'indexed-cb-bit': return `${mode}bit ${inst.bit}, (${inst.indexRegister}${signed(inst.displacement)})`;
    case 'indexed-cb-res': return `${mode}res ${inst.bit}, (${inst.indexRegister}${signed(inst.displacement)})`;
    case 'indexed-cb-set': return `${mode}set ${inst.bit}, (${inst.indexRegister}${signed(inst.displacement)})`;
    case 'ldi': return `${mode}ldi`;
    case 'ldir': return `${mode}ldir`;
    case 'ldd': return `${mode}ldd`;
    case 'lddr': return `${mode}lddr`;
    case 'djnz': return `${mode}djnz ${h(inst.target)}`;
    case 'rst': return `${mode}rst ${h(inst.target, 2)}`;
    case 'di': return `${mode}di`;
    case 'ei': return `${mode}ei`;
    case 'halt': return `${mode}halt`;
    case 'ex-af': return `${mode}ex af, af'`;
    case 'ex-de-hl': return `${mode}ex de, hl`;
    case 'ex-sp-hl': return `${mode}ex (sp), hl`;
    case 'exx': return `${mode}exx`;
    case 'scf': return `${mode}scf`;
    case 'ccf': return `${mode}ccf`;
    case 'cpl': return `${mode}cpl`;
    default: return inst.dasm ?? `${mode}${inst.tag}`;
  }
}

function disasmRange(bytes, startAddr, length, mode = 'adl') {
  const rows = [];
  const end = (startAddr + length) & 0xFFFFFF;
  for (let pc = startAddr & 0xFFFFFF; pc < end;) {
    try {
      const inst = decodeInstruction(bytes, pc, mode);
      const row = {
        pc: hex(pc),
        bytes: hexBytes(bytes, pc, inst.length),
        text: formatInstruction(inst),
        tag: inst.tag ?? null,
        length: inst.length,
      };
      rows.push(row);
      pc += Math.max(inst.length, 1);
    } catch (error) {
      rows.push({
        pc: hex(pc),
        bytes: hexBytes(bytes, pc, 1),
        text: `DECODE ERROR: ${error.message}`,
        tag: null,
        length: 1,
      });
      pc += 1;
    }
  }
  return rows;
}

function disassembleBlock(startAddr, mode = 'adl', maxInstructions = BLOCK_DISASM_LIMIT) {
  const rows = [];
  let pc = startAddr & 0xFFFFFF;
  for (let i = 0; i < maxInstructions; i += 1) {
    try {
      const inst = decodeInstruction(romBytes, pc, mode);
      rows.push({
        pc: hex(pc),
        bytes: hexBytes(romBytes, pc, inst.length),
        text: formatInstruction(inst),
        tag: inst.tag ?? null,
        length: inst.length,
      });
      pc += Math.max(inst.length, 1);
      if (CONTROL_FLOW_TAGS.has(inst.tag)) break;
    } catch (error) {
      rows.push({
        pc: hex(pc),
        bytes: hexBytes(romBytes, pc, 1),
        text: `DECODE ERROR: ${error.message}`,
        tag: null,
        length: 1,
      });
      break;
    }
  }
  return rows;
}

function printDisasm(label, rows) {
  console.log(`\n=== ${label} ===`);
  for (const row of rows) {
    console.log(`${row.pc}: ${row.bytes.padEnd(24)} ${row.text}`);
  }
}

function resetCpuForOsCall(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = MBASE;
  cpu._iy = IY_ADDR;
  cpu._ix = IX_ADDR;
  cpu._hl = 0;
  cpu._de = 0;
  cpu._bc = 0;
  cpu.f = 0x40;
  cpu.a = 0x00;
  cpu.sp = STACK_TOP - 12;
  mem.fill(0xFF, cpu.sp, cpu.sp + 12);
}

function makeSentinelError(pc) {
  const error = new Error('__PHASE194_SENTINEL__');
  error.isSentinel = true;
  error.pc = pc & 0xFFFFFF;
  return error;
}

function runStageInSegments(executor, entry, mode, totalMaxSteps, maxLoopIterations) {
  let currentPc = entry & 0xFFFFFF;
  let currentMode = mode;
  let totalSteps = 0;
  let lastResult = { lastPc: currentPc, lastMode: currentMode, termination: null };

  while (totalSteps < totalMaxSteps) {
    const segmentBudget = Math.min(SEGMENT_STEP_LIMIT, totalMaxSteps - totalSteps);
    const result = executor.runFrom(currentPc, currentMode, {
      maxSteps: segmentBudget,
      maxLoopIterations,
    });
    totalSteps += result.steps ?? 0;
    lastResult = result;
    currentPc = (result.lastPc ?? currentPc) & 0xFFFFFF;
    currentMode = result.lastMode ?? currentMode;
    if (result.termination !== 'max_steps') break;
  }

  return {
    steps: totalSteps,
    lastPc: lastResult.lastPc ?? currentPc,
    lastMode: lastResult.lastMode ?? currentMode,
    termination: lastResult.termination ?? null,
  };
}

function runUntilHitSegmented(executor, entry, mode, sentinels, totalMaxSteps, maxLoopIterations) {
  let currentPc = entry & 0xFFFFFF;
  let currentMode = mode;
  let totalSteps = 0;
  let lastPc = currentPc;
  let lastMode = currentMode;
  let hit = null;
  let termination = null;
  let errorMessage = null;

  const notePc = (pc) => {
    const normalizedPc = pc & 0xFFFFFF;
    lastPc = normalizedPc;
    for (const [name, target] of Object.entries(sentinels)) {
      if (normalizedPc === target) {
        hit = name;
        throw makeSentinelError(normalizedPc);
      }
    }
  };

  while (totalSteps < totalMaxSteps && !hit) {
    const segmentBudget = Math.min(SEGMENT_STEP_LIMIT, totalMaxSteps - totalSteps);
    try {
      const result = executor.runFrom(currentPc, currentMode, {
        maxSteps: segmentBudget,
        maxLoopIterations,
        onBlock(pc) { notePc(pc); },
        onMissingBlock(pc) { notePc(pc); },
      });
      totalSteps += result.steps ?? 0;
      lastPc = (result.lastPc ?? lastPc) & 0xFFFFFF;
      lastMode = result.lastMode ?? lastMode;
      currentPc = lastPc;
      currentMode = lastMode;
      termination = result.termination ?? null;
      if (termination !== 'max_steps') {
        if (result.error) errorMessage = result.error?.stack ?? String(result.error);
        break;
      }
    } catch (error) {
      if (error?.isSentinel) {
        termination = 'sentinel';
        lastPc = error.pc;
        break;
      }
      errorMessage = error?.stack ?? String(error);
      termination = 'exception';
      break;
    }
  }

  return { hit, steps: totalSteps, lastPc, lastMode, termination, errorMessage };
}

function bootRuntime(executor, cpu, mem) {
  const boot = runStageInSegments(executor, BOOT_ENTRY, 'z80', BOOT_MAX_STEPS, OS_MAX_LOOP_ITERATIONS);

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const kernelInit = runStageInSegments(executor, KERNEL_INIT_ENTRY, 'adl', KERNEL_INIT_MAX_STEPS, OS_MAX_LOOP_ITERATIONS);

  cpu.mbase = MBASE;
  cpu._iy = IY_ADDR;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const postInit = runStageInSegments(executor, POST_INIT_ENTRY, 'adl', POST_INIT_MAX_STEPS, OS_MAX_LOOP_ITERATIONS);

  return {
    boot: { steps: boot.steps, lastPc: hex(boot.lastPc), termination: boot.termination },
    kernelInit: { steps: kernelInit.steps, lastPc: hex(kernelInit.lastPc), termination: kernelInit.termination },
    postInit: { steps: postInit.steps, lastPc: hex(postInit.lastPc), termination: postInit.termination },
  };
}

function runMemInit(executor, cpu, mem) {
  resetCpuForOsCall(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEM_INIT_RET);
  mem[ROM_ERRNO_ADDR] = 0x00;
  return runUntilHitSegmented(
    executor,
    MEM_INIT_ENTRY,
    'adl',
    { ret: MEM_INIT_RET },
    MEM_INIT_MAX_STEPS,
    OS_MAX_LOOP_ITERATIONS,
  );
}

function runCreateRealAns(executor, cpu, mem) {
  mem.set(ANS_NAME_OP1, OP1_ADDR);
  resetCpuForOsCall(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, CREATE_REAL_RET);
  const errBase = (cpu.sp - 6) & 0xFFFFFF;
  write24(mem, errBase, CREATE_REAL_ERR);
  write24(mem, errBase + 3, 0);
  write24(mem, ROM_ERRSP_ADDR, errBase);
  mem[ROM_ERRNO_ADDR] = 0x00;
  cpu.a = 0x00;
  cpu._hl = 0x000009;
  return {
    errBase: hex(errBase),
    ...runUntilHitSegmented(
      executor,
      CREATE_REAL_ENTRY,
      'adl',
      { ret: CREATE_REAL_RET, err: CREATE_REAL_ERR },
      CREATE_REAL_MAX_STEPS,
      OS_MAX_LOOP_ITERATIONS,
    ),
  };
}

function seedKeyContext(mem, cpu) {
  cpu.a = SEEDED_KEY_CODE;
  mem[KBD_RAW_SCAN_ADDR] = SEEDED_KEY_CODE;
  mem[KBD_KEY_ADDR] = SEEDED_KEY_CODE;
  mem[KBD_GETKY_ADDR] = SEEDED_KEY_CODE;
  mem[KBD_GETCSC_SCAN_ADDR] = SEEDED_KEY_CODE;
}

function pushStackValues(mem, cpu, values) {
  for (let i = values.length - 1; i >= 0; i -= 1) {
    cpu.sp -= 3;
    write24(mem, cpu.sp, values[i] & 0xFFFFFF);
  }
}

function overlapSlice(addr, width, start, length) {
  const overlapStart = Math.max(addr, start);
  const overlapEnd = Math.min(addr + width, start + length);
  if (overlapStart >= overlapEnd) return null;
  return {
    start: overlapStart,
    length: overlapEnd - overlapStart,
    offset: overlapStart - addr,
  };
}

function findByteOffsets(values, target) {
  const offsets = [];
  for (let i = 0; i < values.length; i += 1) {
    if ((values[i] & 0xFF) === (target & 0xFF)) offsets.push(i);
  }
  return offsets;
}

function buildWriteEvent(state, cpu, mem, rangeLabel, addr, width, beforeBytes) {
  const start = rangeLabel === 'OP1' ? OP1_ADDR : TOKEN_STAGING_ADDR;
  const overlap = overlapSlice(addr, width, start, TOKEN_LENGTH);
  if (!overlap) return null;

  const fullSlice = Array.from(mem.slice(start, start + TOKEN_LENGTH));
  const offsets = rangeLabel === 'OP1' ? findByteOffsets(fullSlice, state.targetToken) : [];

  return {
    step: state.currentStep,
    block: hex(state.currentBlockPc),
    mode: state.currentMode,
    writeAddr: hex(addr),
    width,
    overlap: `${hex(overlap.start)}+${overlap.length}`,
    before: Array.from(
      beforeBytes.slice(overlap.offset, overlap.offset + overlap.length),
      (value) => hexByte(value),
    ).join(' '),
    after: hexBytes(mem, overlap.start, overlap.length),
    fullRange: hexBytes(mem, start, TOKEN_LENGTH),
    tokenOffsets: offsets,
    a: hex(cpu.a, 2),
    e: hex(cpu.e, 2),
    hl: hex(cpu.hl),
    de: hex(cpu.de),
    bc: hex(cpu.bc),
    sp: hex(cpu.sp),
  };
}

function installTraceWatchers(cpu, mem, state) {
  const original = {
    write8: cpu.write8.bind(cpu),
    write16: cpu.write16.bind(cpu),
    write24: cpu.write24.bind(cpu),
  };

  function noteEvent(rangeLabel, addr, width, beforeBytes) {
    const event = buildWriteEvent(state, cpu, mem, rangeLabel, addr, width, beforeBytes);
    if (!event) return;

    if (rangeLabel === 'OP1') {
      cap(state.op1WriteEvents, event, WRITE_EVENT_LIMIT);
      if (state.firstOp1Mutation === null && event.fullRange !== state.initialOp1) {
        state.firstOp1Mutation = event;
      }
      if (state.firstTokenAppearance === null && event.tokenOffsets.length > 0) {
        state.firstTokenAppearance = event;
      }
    } else {
      cap(state.tokenStagingWriteEvents, event, WRITE_EVENT_LIMIT);
    }
  }

  function wrapWrite(width, writeFn) {
    return (addr, value) => {
      const normalizedAddr = Number(addr) & 0xFFFFFF;
      const beforeBytes = Array.from(mem.slice(normalizedAddr, normalizedAddr + width));
      writeFn(normalizedAddr, value);
      noteEvent('OP1', normalizedAddr, width, beforeBytes);
      noteEvent('TOKEN_STAGING', normalizedAddr, width, beforeBytes);
    };
  }

  cpu.write8 = wrapWrite(1, original.write8);
  cpu.write16 = wrapWrite(2, original.write16);
  cpu.write24 = wrapWrite(3, original.write24);

  return () => {
    cpu.write8 = original.write8;
    cpu.write16 = original.write16;
    cpu.write24 = original.write24;
  };
}

function makeTraceState(config, executor, mem) {
  return {
    experiment: config.id,
    targetToken: SEEDED_TOKEN_BYTE,
    entryHasCompiledBlock: Boolean(executor.compiledBlocks[`${config.entry.toString(16).padStart(6, '0')}:adl`]),
    uniqueBlocks: [],
    uniqueBlockSet: new Set(),
    missingBlocks: [],
    missingBlockSet: new Set(),
    watchSnapshots: [],
    firstExecutableBlock: null,
    currentStep: 0,
    currentBlockPc: config.entry,
    currentMode: 'adl',
    initialOp1: hexBytes(mem, OP1_ADDR, TOKEN_LENGTH),
    firstOp1Mutation: null,
    firstTokenAppearance: null,
    op1WriteEvents: [],
    tokenStagingWriteEvents: [],
    termination: null,
    hit: null,
    lastPc: config.entry,
    lastMode: 'adl',
    errorMessage: null,
    totalSteps: 0,
  };
}

function maybeSnapshotWatchBlock(state, cpu, mem, pc, missing) {
  const label = WATCH_LABELS.get(pc);
  if (!label && state.watchSnapshots.length >= WATCH_SNAPSHOT_LIMIT) return;
  if (!label && state.watchSnapshots.length >= 16) return;

  cap(state.watchSnapshots, {
    pc: hex(pc),
    missing,
    label: label ?? null,
    step: state.currentStep,
    a: hex(cpu.a, 2),
    e: hex(cpu.e, 2),
    hl: hex(cpu.hl),
    de: hex(cpu.de),
    op1: hexBytes(mem, OP1_ADDR, TOKEN_LENGTH),
    tokenStaging: hexBytes(mem, TOKEN_STAGING_ADDR, TOKEN_LENGTH),
  }, WATCH_SNAPSHOT_LIMIT);
}

function logUniqueBlock(state, cpu, mem, pc, missing) {
  const renderedPc = hex(pc);
  const watchLabel = WATCH_LABELS.get(pc);
  const suffix = watchLabel ? ` ; ${watchLabel}` : '';
  console.log(
    `[${state.experiment}] unique ${String(state.uniqueBlocks.length).padStart(3, '0')} `
      + `${missing ? 'MISSING ' : 'BLOCK   '}${renderedPc} `
      + `E=${hex(cpu.e, 2)} OP1=${hexBytes(mem, OP1_ADDR, TOKEN_LENGTH)}${suffix}`,
  );
}

function noteTraceBlock(state, cpu, mem, pc, mode, missing) {
  const normalizedPc = pc & 0xFFFFFF;
  state.currentBlockPc = normalizedPc;
  state.currentMode = mode ?? state.currentMode;
  state.lastPc = normalizedPc;
  state.lastMode = mode ?? state.lastMode;

  const renderedPc = hex(normalizedPc);
  if (missing) {
    if (!state.missingBlockSet.has(renderedPc)) {
      state.missingBlockSet.add(renderedPc);
      state.missingBlocks.push(renderedPc);
      logUniqueBlock(state, cpu, mem, normalizedPc, true);
      maybeSnapshotWatchBlock(state, cpu, mem, normalizedPc, true);
    }
  } else if (!state.uniqueBlockSet.has(renderedPc)) {
    state.uniqueBlockSet.add(renderedPc);
    state.uniqueBlocks.push(renderedPc);
    if (state.firstExecutableBlock === null) state.firstExecutableBlock = renderedPc;
    logUniqueBlock(state, cpu, mem, normalizedPc, false);
    maybeSnapshotWatchBlock(state, cpu, mem, normalizedPc, false);
  }

  if (normalizedPc === TRACE_RET) {
    state.hit = 'sentinel';
    throw makeSentinelError(normalizedPc);
  }
}

function runTraceInSegments(executor, cpu, mem, state, entry, mode, maxSteps) {
  let currentPc = entry & 0xFFFFFF;
  let currentMode = mode;
  let totalSteps = 0;
  let termination = null;
  let errorMessage = null;

  while (totalSteps < maxSteps && state.hit === null) {
    const segmentBudget = Math.min(SEGMENT_STEP_LIMIT, maxSteps - totalSteps);
    try {
      const result = executor.runFrom(currentPc, currentMode, {
        maxSteps: segmentBudget,
        maxLoopIterations: OS_MAX_LOOP_ITERATIONS,
        onBlock(pc, blockMode, _meta, step) {
          state.currentStep = totalSteps + step;
          noteTraceBlock(state, cpu, mem, pc, blockMode, false);
        },
        onMissingBlock(pc, blockMode, step) {
          state.currentStep = totalSteps + step;
          noteTraceBlock(state, cpu, mem, pc, blockMode, true);
        },
      });

      totalSteps += result.steps ?? 0;
      currentPc = (result.lastPc ?? currentPc) & 0xFFFFFF;
      currentMode = result.lastMode ?? currentMode;
      state.lastPc = currentPc;
      state.lastMode = currentMode;
      termination = result.termination ?? null;

      if (termination !== 'max_steps') {
        if (result.error) errorMessage = result.error?.stack ?? String(result.error);
        break;
      }
    } catch (error) {
      if (error?.isSentinel) {
        termination = 'sentinel';
        state.lastPc = error.pc;
        break;
      }
      termination = 'exception';
      errorMessage = error?.stack ?? String(error);
      break;
    }
  }

  if (totalSteps >= maxSteps && (termination === null || termination === 'max_steps') && state.hit === null) {
    termination = 'step_limit';
  }

  state.totalSteps = totalSteps;
  state.termination = termination ?? 'unknown';
  state.errorMessage = errorMessage;
}

function selectPrimaryChangeEvent(state) {
  return state.firstTokenAppearance ?? state.firstOp1Mutation ?? null;
}

function runExperiment(executor, cpu, mem, baselineMem, config) {
  mem.set(baselineMem);
  resetCpuForOsCall(cpu, mem);

  config.setup(cpu, mem);

  const entryDisassembly = disasmRange(romBytes, config.entryDisasmStart, config.entryDisasmLength, 'adl');
  printDisasm(`Experiment ${config.id} disassembly ${hex(config.entryDisasmStart)}..${hex(config.entryDisasmStart + config.entryDisasmLength)}`, entryDisassembly);

  const state = makeTraceState(config, executor, mem);
  if (config.clearOp1) {
    state.initialOp1 = hexBytes(mem, OP1_ADDR, TOKEN_LENGTH);
  }

  const releaseWatchers = installTraceWatchers(cpu, mem, state);
  try {
    runTraceInSegments(executor, cpu, mem, state, config.entry, 'adl', config.maxSteps);
  } finally {
    releaseWatchers();
  }

  const primaryChange = selectPrimaryChangeEvent(state);
  const changeBlockDisassembly = primaryChange
    ? disassembleBlock(Number.parseInt(primaryChange.block, 16), 'adl', BLOCK_DISASM_LIMIT)
    : [];

  return {
    experiment: config.id,
    entry: hex(config.entry),
    blocks: state.uniqueBlocks.length,
    stepsToOP1Change: primaryChange?.step ?? null,
    op1AtChange: primaryChange?.fullRange ?? null,
    blockAtOP1Change: primaryChange?.block ?? null,
    registerEAtChange: primaryChange?.e ?? null,
    termination: state.termination,
    targetToken: hex(SEEDED_TOKEN_BYTE, 2),
    seededKeyCode: hex(SEEDED_KEY_CODE, 2),
    entryHasCompiledBlock: state.entryHasCompiledBlock,
    effectiveStartBlock: state.firstExecutableBlock,
    requestedEntryDisassembly: entryDisassembly,
    blockDisassemblyAtChange: changeBlockDisassembly,
    uniqueBlocks: state.uniqueBlocks,
    missingBlocks: state.missingBlocks,
    watchSnapshots: state.watchSnapshots,
    firstOp1Mutation: state.firstOp1Mutation,
    firstTokenInOp1: state.firstTokenAppearance,
    op1WriteEvents: state.op1WriteEvents,
    tokenStagingWriteEvents: state.tokenStagingWriteEvents,
    totalSteps: state.totalSteps,
    finalPc: hex(state.lastPc),
    finalMode: state.lastMode,
    finalCpu: snapshotCpu(cpu),
    initialOp1: state.initialOp1,
    finalOp1: hexBytes(mem, OP1_ADDR, TOKEN_LENGTH),
    finalTokenStaging: hexBytes(mem, TOKEN_STAGING_ADDR, TOKEN_LENGTH),
    errorMessage: state.errorMessage,
    notes: config.notes,
  };
}

function main() {
  console.log('=== Phase 194: ConvKeyToTok E -> OP1 Trace Probe ===\n');

  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(romBytes.length, 0x400000)));
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  console.log('[0] Boot + kernel init + post-init');
  const boot = bootRuntime(executor, cpu, mem);
  console.log(JSON.stringify(boot, null, 2));

  console.log('\n[1] MEM_INIT');
  const memInit = runMemInit(executor, cpu, mem);
  console.log(JSON.stringify({
    hit: memInit.hit,
    steps: memInit.steps,
    termination: memInit.termination,
    lastPc: hex(memInit.lastPc),
    errorMessage: memInit.errorMessage,
  }, null, 2));
  if (memInit.hit !== 'ret') {
    console.log(JSON.stringify({
      probe: 'phase194-convkey-e-to-op1',
      status: 'aborted',
      reason: 'MEM_INIT did not return to sentinel',
      boot,
      memInit: {
        hit: memInit.hit,
        steps: memInit.steps,
        termination: memInit.termination,
        lastPc: hex(memInit.lastPc),
        errorMessage: memInit.errorMessage,
      },
    }, null, 2));
    return;
  }

  console.log('\n[2] CreateReal(Ans) baseline');
  const createReal = runCreateRealAns(executor, cpu, mem);
  console.log(JSON.stringify({
    hit: createReal.hit,
    steps: createReal.steps,
    termination: createReal.termination,
    lastPc: hex(createReal.lastPc),
    errBase: createReal.errBase,
    errorMessage: createReal.errorMessage,
  }, null, 2));
  if (createReal.hit !== 'ret') {
    console.log(JSON.stringify({
      probe: 'phase194-convkey-e-to-op1',
      status: 'aborted',
      reason: 'CreateReal(Ans) did not return to sentinel',
      boot,
      createReal: {
        hit: createReal.hit,
        steps: createReal.steps,
        termination: createReal.termination,
        lastPc: hex(createReal.lastPc),
        errBase: createReal.errBase,
        errorMessage: createReal.errorMessage,
      },
    }, null, 2));
    return;
  }

  const baselineMem = mem.slice();
  const results = [];

  for (const config of EXPERIMENTS) {
    console.log(`\n=== Experiment ${config.id} ===`);
    const result = runExperiment(executor, cpu, mem, baselineMem, config);
    console.log(JSON.stringify(result, null, 2));
    results.push(result);
  }

  console.log('\n=== Summary ===');
  console.log(JSON.stringify({
    probe: 'phase194-convkey-e-to-op1',
    status: 'completed',
    boot,
    memInit: {
      hit: memInit.hit,
      steps: memInit.steps,
      termination: memInit.termination,
    },
    createReal: {
      hit: createReal.hit,
      steps: createReal.steps,
      termination: createReal.termination,
      errBase: createReal.errBase,
    },
    experiments: results.map((result) => ({
      experiment: result.experiment,
      entry: result.entry,
      blocks: result.blocks,
      stepsToOP1Change: result.stepsToOP1Change,
      op1AtChange: result.op1AtChange,
      blockAtOP1Change: result.blockAtOP1Change,
      registerEAtChange: result.registerEAtChange,
      termination: result.termination,
      effectiveStartBlock: result.effectiveStartBlock,
    })),
  }, null, 2));
}

main();
