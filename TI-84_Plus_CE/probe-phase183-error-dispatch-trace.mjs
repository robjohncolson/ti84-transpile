#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const MEM_SIZE = 0x1000000;
const ROM_END = 0x400000;
const STACK_TOP = 0xD1A87E;

const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const MEM_INIT_ENTRY = 0x09DEE0;
const CREATE_REAL_ENTRY = 0x08238A;
const PARSEINP_ENTRY = 0x099914;
const BUFINSERT_ENTRY = 0x05E2A0;

const OP1_ADDR = 0xD005F8;
const CUR_ROW_ADDR = 0xD00595;
const CUR_COL_ADDR = 0xD00596;
const ERRNO_ADDR = 0xD008DF;
const ERRSP_ADDR = 0xD008E0;

const BEGPC_ADDR = 0xD02317;
const CURPC_ADDR = 0xD0231A;
const ENDPC_ADDR = 0xD0231D;

const EDIT_TOP = 0xD02437;
const EDIT_CURSOR = 0xD0243A;
const EDIT_TAIL = 0xD0243D;
const EDIT_BTM = 0xD02440;

const VECTOR_TABLE_START = 0xD02500;
const VECTOR_TABLE_END = 0xD025FF;
const FPSBASE_ADDR = 0xD0258A;
const FPS_ADDR = 0xD0258D;
const OPS_ADDR = 0xD02593;

const BUF_START = 0xD00A00;
const BUF_END = 0xD00B00;

const FAKE_RET = 0x7FFFFE;
const ERR_CATCH = 0x7FFFFA;
const MEM_INIT_RET = 0x7FFFF6;

const SEGMENT_STEP_LIMIT = 2000;
const BOOT_MAX_STEPS = 20000;
const KERNEL_INIT_MAX_STEPS = 100000;
const POST_INIT_MAX_STEPS = 100;
const MEM_INIT_MAX_STEPS = 100000;
const CREATE_REAL_MAX_STEPS = 50000;
const BUFINSERT_MAX_STEPS = 10000;
const PARSEINP_MAX_STEPS = 1500000;

const BOOT_MAX_LOOP_ITERATIONS = 32;
const KERNEL_INIT_MAX_LOOP_ITERATIONS = 10000;
const POST_INIT_MAX_LOOP_ITERATIONS = 32;
const OS_MAX_LOOP_ITERATIONS = 8192;

const TRACE_STOP = '__PHASE183_TRACE_STOP__';
const RUN_SENTINEL_STOP = '__PHASE183_SENTINEL_STOP__';

const ANS_NAME_OP1 = Uint8Array.from([0x00, 0x72, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
const INSERT_TOKENS = Uint8Array.from([0x32, 0x70, 0x33]);

function hex(value, width = 6) {
  if (value === null || value === undefined) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return (value & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

function hexBytes(buffer, start, length) {
  return Array.from(buffer.slice(start, start + length), (value) => hexByte(value)).join(' ');
}

function read24(mem, addr) {
  return ((mem[addr] & 0xFF) | ((mem[addr + 1] & 0xFF) << 8) | ((mem[addr + 2] & 0xFF) << 16)) >>> 0;
}

function write24(mem, addr, value) {
  mem[addr] = value & 0xFF;
  mem[addr + 1] = (value >>> 8) & 0xFF;
  mem[addr + 2] = (value >>> 16) & 0xFF;
}

function isErasedFlashFill(mem, addr, sampleLength = 16) {
  if (addr < 0 || addr >= ROM_END) return false;
  const end = Math.min(addr + sampleLength, ROM_END);
  for (let index = addr; index < end; index += 1) {
    if ((mem[index] & 0xFF) !== 0xFF) return false;
  }
  return end > addr;
}

function dumpVectorTable(snapshotBytes) {
  const lines = [];
  for (let offset = 0; offset < snapshotBytes.length; offset += 16) {
    const addr = VECTOR_TABLE_START + offset;
    lines.push(`${hex(addr)}: ${Array.from(snapshotBytes.slice(offset, offset + 16), (value) => hexByte(value)).join(' ')}`);
  }
  return {
    start: hex(VECTOR_TABLE_START),
    end: hex(VECTOR_TABLE_END),
    lines,
  };
}

function normalizeTarget(value) {
  return typeof value === 'number' ? (value & 0xFFFFFF) : null;
}

function rangeOverlaps(addr, size, start, endInclusive) {
  const lo = addr & 0xFFFFFF;
  const hi = (lo + Math.max(0, size - 1)) & 0xFFFFFF;
  return lo <= endInclusive && hi >= start;
}

function snapshotRegisters(cpu) {
  return {
    a: hex(cpu.a, 2),
    f: hex(cpu.f, 2),
    bc: hex(cpu.bc),
    de: hex(cpu.de),
    hl: hex(cpu.hl),
    ix: hex(cpu.ix),
    iy: hex(cpu.iy),
    sp: hex(cpu.sp),
    madl: cpu.madl ? 'adl' : 'z80',
    mbase: hex(cpu.mbase, 2),
    halted: Boolean(cpu.halted),
  };
}

function resetCpuForOsCall(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu.f = 0x40;
  cpu._ix = 0xD1A860;
  cpu.sp = STACK_TOP - 12;
  mem.fill(0xFF, cpu.sp, cpu.sp + 12);
}

function requireHit(label, result, expectedHit) {
  if (result.errorMessage) {
    throw new Error(`${label} threw ${result.errorMessage}`);
  }

  if (result.hit !== expectedHit) {
    throw new Error(
      `${label} expected ${expectedHit}, saw ${result.hit ?? 'none'} (termination=${result.termination ?? 'n/a'} lastPc=${hex(result.lastPc)})`,
    );
  }
}

function runStageInSegments(executor, entry, mode, totalMaxSteps, maxLoopIterations) {
  let currentPc = entry & 0xFFFFFF;
  let currentMode = mode;
  let totalSteps = 0;
  let lastResult = {
    lastPc: currentPc,
    lastMode: currentMode,
    termination: null,
    error: null,
  };

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

    if (result.termination !== 'max_steps') {
      break;
    }
  }

  return {
    steps: totalSteps,
    lastPc: lastResult.lastPc ?? currentPc,
    lastMode: lastResult.lastMode ?? currentMode,
    termination: lastResult.termination ?? null,
    error: lastResult.error ?? null,
  };
}

function runUntilHitSegmented(executor, mem, entry, mode, sentinels, totalMaxSteps, maxLoopIterations, watchErasedFlash = false) {
  let currentPc = entry & 0xFFFFFF;
  let currentMode = mode;
  let totalSteps = 0;
  let lastPc = currentPc;
  let lastMode = currentMode;
  let termination = null;
  let hit = null;
  let errorMessage = null;

  const notePc = (pc) => {
    const normalizedPc = pc & 0xFFFFFF;
    lastPc = normalizedPc;

    for (const [name, target] of Object.entries(sentinels)) {
      if (normalizedPc === target) {
        hit = name;
        throw new Error(RUN_SENTINEL_STOP);
      }
    }

    if (watchErasedFlash && isErasedFlashFill(mem, normalizedPc)) {
      hit = 'erased_flash';
      throw new Error(RUN_SENTINEL_STOP);
    }
  };

  while (totalSteps < totalMaxSteps && !hit) {
    const segmentBudget = Math.min(SEGMENT_STEP_LIMIT, totalMaxSteps - totalSteps);

    try {
      const result = executor.runFrom(currentPc, currentMode, {
        maxSteps: segmentBudget,
        maxLoopIterations,
        onBlock(pc) {
          notePc(pc);
        },
        onMissingBlock(pc) {
          notePc(pc);
        },
      });

      totalSteps += result.steps ?? 0;
      lastPc = (result.lastPc ?? lastPc) & 0xFFFFFF;
      lastMode = result.lastMode ?? lastMode;
      currentPc = lastPc;
      currentMode = lastMode;
      termination = result.termination ?? null;

      if (!hit && watchErasedFlash && isErasedFlashFill(mem, lastPc)) {
        hit = 'erased_flash';
        termination = 'erased_flash';
        break;
      }

      if (termination !== 'max_steps') {
        if (result.error) {
          errorMessage = result.error?.stack ?? String(result.error);
        }
        break;
      }
    } catch (error) {
      if (error?.message === RUN_SENTINEL_STOP) {
        termination = hit === 'erased_flash' ? 'erased_flash' : 'sentinel';
        break;
      }
      errorMessage = error?.stack ?? String(error);
      termination = 'exception';
      break;
    }
  }

  return {
    hit,
    steps: totalSteps,
    lastPc,
    lastMode,
    termination,
    errorMessage,
  };
}

function bootRuntime(executor, cpu, mem) {
  const bootResult = runStageInSegments(
    executor,
    BOOT_ENTRY,
    'z80',
    BOOT_MAX_STEPS,
    BOOT_MAX_LOOP_ITERATIONS,
  );

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const kernelInitResult = runStageInSegments(
    executor,
    KERNEL_INIT_ENTRY,
    'adl',
    KERNEL_INIT_MAX_STEPS,
    KERNEL_INIT_MAX_LOOP_ITERATIONS,
  );

  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const postInitResult = runStageInSegments(
    executor,
    POST_INIT_ENTRY,
    'adl',
    POST_INIT_MAX_STEPS,
    POST_INIT_MAX_LOOP_ITERATIONS,
  );

  return {
    boot: {
      steps: bootResult.steps ?? null,
      lastPc: hex(bootResult.lastPc),
      termination: bootResult.termination ?? null,
    },
    kernelInit: {
      steps: kernelInitResult.steps ?? null,
      lastPc: hex(kernelInitResult.lastPc),
      termination: kernelInitResult.termination ?? null,
    },
    postInit: {
      steps: postInitResult.steps ?? null,
      lastPc: hex(postInitResult.lastPc),
      termination: postInitResult.termination ?? null,
    },
  };
}

function runMemInit(executor, cpu, mem) {
  resetCpuForOsCall(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEM_INIT_RET);
  mem[ERRNO_ADDR] = 0x00;

  return runUntilHitSegmented(
    executor,
    mem,
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
  write24(mem, cpu.sp, FAKE_RET);
  const errBase = (cpu.sp - 6) & 0xFFFFFF;
  write24(mem, errBase, ERR_CATCH);
  write24(mem, errBase + 3, 0);
  write24(mem, ERRSP_ADDR, errBase);
  mem[ERRNO_ADDR] = 0x00;
  cpu.a = 0x00;
  cpu._hl = 0x000009;

  return {
    errBase: hex(errBase),
    ...runUntilHitSegmented(
      executor,
      mem,
      CREATE_REAL_ENTRY,
      'adl',
      { ret: FAKE_RET, err: ERR_CATCH },
      CREATE_REAL_MAX_STEPS,
      OS_MAX_LOOP_ITERATIONS,
    ),
  };
}

function runBufInsertToken(executor, cpu, mem, token) {
  resetCpuForOsCall(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, FAKE_RET);
  cpu._de = token & 0xFF;

  return runUntilHitSegmented(
    executor,
    mem,
    BUFINSERT_ENTRY,
    'adl',
    { ret: FAKE_RET },
    BUFINSERT_MAX_STEPS,
    OS_MAX_LOOP_ITERATIONS,
  );
}

function formatInstruction(inst) {
  const prefix = inst.modePrefix ? `${inst.modePrefix} ` : '';
  const disp = (value) => (value >= 0 ? `+${value}` : `${value}`);

  let text = inst.tag;

  switch (inst.tag) {
    case 'nop': text = 'nop'; break;
    case 'call': text = `call ${hex(inst.target)}`; break;
    case 'call-conditional': text = `call ${inst.condition}, ${hex(inst.target)}`; break;
    case 'jp': text = `jp ${hex(inst.target)}`; break;
    case 'jp-conditional': text = `jp ${inst.condition}, ${hex(inst.target)}`; break;
    case 'jr': text = `jr ${hex(inst.target)}`; break;
    case 'jr-conditional': text = `jr ${inst.condition}, ${hex(inst.target)}`; break;
    case 'ret': text = 'ret'; break;
    case 'ret-conditional': text = `ret ${inst.condition}`; break;
    case 'push': text = `push ${inst.pair}`; break;
    case 'pop': text = `pop ${inst.pair}`; break;
    case 'ex-af': text = "ex af, af'"; break;
    case 'ex-de-hl': text = 'ex de, hl'; break;
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
    case 'ld-ind-imm': text = `ld (hl), ${hex(inst.value, 2)}`; break;
    case 'ld-reg-ixd': text = `ld ${inst.dest}, (${inst.indexRegister}${disp(inst.displacement)})`; break;
    case 'ld-ixd-reg': text = `ld (${inst.indexRegister}${disp(inst.displacement)}), ${inst.src}`; break;
    case 'ld-ixd-imm': text = `ld (${inst.indexRegister}${disp(inst.displacement)}), ${hex(inst.value, 2)}`; break;
    case 'bit-test-ind': text = `bit ${inst.bit}, (hl)`; break;
    case 'indexed-cb-res': text = `res ${inst.bit}, (${inst.indexRegister}${disp(inst.displacement)})`; break;
    case 'indexed-cb-set': text = `set ${inst.bit}, (${inst.indexRegister}${disp(inst.displacement)})`; break;
    case 'indexed-cb-bit': text = `bit ${inst.bit}, (${inst.indexRegister}${disp(inst.displacement)})`; break;
    case 'indexed-cb-rotate': text = `${inst.operation} (${inst.indexRegister}${disp(inst.displacement)})`; break;
    case 'inc-pair': text = `inc ${inst.pair}`; break;
    case 'dec-pair': text = `dec ${inst.pair}`; break;
    case 'inc-reg': text = `inc ${inst.reg}`; break;
    case 'dec-reg': text = `dec ${inst.reg}`; break;
    case 'add-pair': text = `add ${inst.dest}, ${inst.src}`; break;
    case 'alu-reg': text = `${inst.op} ${inst.src}`; break;
    case 'alu-imm': text = `${inst.op} ${hex(inst.value, 2)}`; break;
    case 'sbc-pair': text = `sbc hl, ${inst.src}`; break;
    case 'adc-pair': text = `adc hl, ${inst.src}`; break;
    case 'rst': text = `rst ${hex(inst.target, 2)}`; break;
    case 'di': text = 'di'; break;
    case 'ei': text = 'ei'; break;
    case 'halt': text = 'halt'; break;
    case 'djnz': text = `djnz ${hex(inst.target)}`; break;
    case 'ldir': text = 'ldir'; break;
    case 'lddr': text = 'lddr'; break;
    case 'ldi': text = 'ldi'; break;
    case 'ldd': text = 'ldd'; break;
    case 'cpir': text = 'cpir'; break;
    case 'cpdr': text = 'cpdr'; break;
    case 'cpi': text = 'cpi'; break;
    case 'cpd': text = 'cpd'; break;
    case 'ld-sp-hl': text = 'ld sp, hl'; break;
    case 'ld-sp-ix': text = `ld sp, ${inst.indexRegister || 'ix'}`; break;
    case 'ld-sp-pair': text = `ld sp, ${inst.pair}`; break;
    case 'ex-sp-hl': text = 'ex (sp), hl'; break;
    case 'ex-sp-ix': text = `ex (sp), ${inst.indexRegister || 'ix'}`; break;
    case 'ex-sp-pair': text = `ex (sp), ${inst.pair}`; break;
    case 'ld-reg-reg': text = `ld ${inst.dest}, ${inst.src}`; break;
    case 'bit-test': text = `bit ${inst.bit}, ${inst.reg}`; break;
    case 'bit-set': text = `set ${inst.bit}, ${inst.reg}`; break;
    case 'bit-reset': text = `res ${inst.bit}, ${inst.reg}`; break;
    case 'rotate': text = `${inst.op} ${inst.reg}`; break;
    case 'rotate-reg': text = `${inst.op} ${inst.reg}`; break;
    case 'rotate-ind': text = `${inst.op} (${inst.indirectRegister})`; break;
    case 'shift': text = `${inst.op} ${inst.reg}`; break;
    case 'in': text = `in ${inst.dest}, (${inst.port !== undefined ? hex(inst.port, 2) : 'c'})`; break;
    case 'out': text = `out (${inst.port !== undefined ? hex(inst.port, 2) : 'c'}), ${inst.src}`; break;
    case 'in0': text = `in0 ${inst.reg}, (${hex(inst.port, 2)})`; break;
    case 'out0': text = `out0 (${hex(inst.port, 2)}), ${inst.reg}`; break;
    case 'neg': text = 'neg'; break;
    case 'rla': text = 'rla'; break;
    case 'rra': text = 'rra'; break;
    case 'rlca': text = 'rlca'; break;
    case 'rrca': text = 'rrca'; break;
    case 'cpl': text = 'cpl'; break;
    case 'scf': text = 'scf'; break;
    case 'ccf': text = 'ccf'; break;
    case 'daa': text = 'daa'; break;
    case 'reti': text = 'reti'; break;
    case 'retn': text = 'retn'; break;
    case 'im': text = `im ${inst.mode ?? inst.value}`; break;
    case 'exx': text = 'exx'; break;
    case 'jp-hl': text = 'jp (hl)'; break;
    case 'jp-ix': text = `jp (${inst.indexRegister || 'ix'})`; break;
    case 'jp-indirect': text = `jp (${inst.indirectRegister})`; break;
    case 'ld-a-i': text = 'ld a, i'; break;
    case 'ld-i-a': text = 'ld i, a'; break;
    case 'ld-a-r': text = 'ld a, r'; break;
    case 'ld-r-a': text = 'ld r, a'; break;
    case 'ld-special': text = `ld ${inst.dest}, ${inst.src}`; break;
    case 'inc-ixd': text = `inc (${inst.indexRegister}${disp(inst.displacement)})`; break;
    case 'dec-ixd': text = `dec (${inst.indexRegister}${disp(inst.displacement)})`; break;
    case 'alu-ixd': text = `${inst.op} (${inst.indexRegister}${disp(inst.displacement)})`; break;
    case 'rsmix': text = 'rsmix'; break;
    case 'stmix': text = 'stmix'; break;
    default: break;
  }

  return `${prefix}${text}`;
}

function decodeBlockDisassembly(meta, defaultMode) {
  if (!meta?.instructions?.length) {
    return ['<no block metadata available>'];
  }

  const rows = [];
  for (const instruction of meta.instructions) {
    try {
      const decoded = decodeInstruction(romBytes, instruction.pc, instruction.mode ?? defaultMode);
      const rawBytes = hexBytes(romBytes, instruction.pc, decoded.length);
      rows.push(`${hex(instruction.pc)}: ${rawBytes.padEnd(20, ' ')} ${formatInstruction(decoded)}`);
    } catch (error) {
      const rawBytes = instruction.bytes ?? '';
      const text = instruction.dasm ?? `decode-error: ${error?.message ?? String(error)}`;
      rows.push(`${hex(instruction.pc)}: ${rawBytes.padEnd(20, ' ')} ${text}`);
    }
  }

  return rows;
}

function blockContainsIndirectJump(meta) {
  if (!meta?.instructions?.length) return false;
  return meta.instructions.some((instruction) => {
    try {
      const decoded = decodeInstruction(romBytes, instruction.pc, instruction.mode ?? meta.mode ?? 'adl');
      return decoded.tag === 'jp-indirect' || decoded.tag === 'jp-hl' || decoded.tag === 'jp-ix';
    } catch {
      return false;
    }
  });
}

function createTraceHarness(executor, cpu, mem) {
  const originalFns = new Map();
  const originalCpu = {
    read8: cpu.read8.bind(cpu),
    read16: cpu.read16.bind(cpu),
    read24: cpu.read24.bind(cpu),
    write8: cpu.write8.bind(cpu),
    write16: cpu.write16.bind(cpu),
    write24: cpu.write24.bind(cpu),
  };

  const trace = {
    captureActive: false,
    sequence: 0,
    errNoSetBlock: null,
    errSPValue: null,
    vectorTableSnapshot: null,
    dispatchChain: [],
    stopKind: null,
    stopTarget: null,
    finalSourcePc: null,
    finalSourceHadIndirectJump: false,
    topLevelEvents: [],
    currentEvents: null,
  };

  function pushEvent(kind, addr, size, value) {
    if (!trace.captureActive || !trace.currentEvents) return;

    const normalizedAddr = addr & 0xFFFFFF;
    const tags = [];

    if (rangeOverlaps(normalizedAddr, size, ERRSP_ADDR, ERRSP_ADDR + 2)) {
      tags.push('errSP');
    }
    if (rangeOverlaps(normalizedAddr, size, VECTOR_TABLE_START, VECTOR_TABLE_END)) {
      tags.push('vectorTable');
    }

    if (tags.length === 0) return;

    const formattedValue = size === 1 ? hex(value, 2) : size === 2 ? hex(value, 4) : hex(value, 6);
    trace.currentEvents.push({
      kind,
      addr: hex(normalizedAddr),
      size,
      value: formattedValue,
      tags,
    });
  }

  cpu.read8 = (addr) => {
    const value = originalCpu.read8(addr);
    pushEvent('read', addr, 1, value);
    return value;
  };
  cpu.read16 = (addr) => {
    const value = originalCpu.read16(addr);
    pushEvent('read', addr, 2, value);
    return value;
  };
  cpu.read24 = (addr) => {
    const value = originalCpu.read24(addr);
    pushEvent('read', addr, 3, value);
    return value;
  };
  cpu.write8 = (addr, value) => {
    originalCpu.write8(addr, value);
    pushEvent('write', addr, 1, value);
  };
  cpu.write16 = (addr, value) => {
    originalCpu.write16(addr, value);
    pushEvent('write', addr, 2, value);
  };
  cpu.write24 = (addr, value) => {
    originalCpu.write24(addr, value);
    pushEvent('write', addr, 3, value);
  };

  for (const [key, fn] of Object.entries(executor.compiledBlocks)) {
    originalFns.set(key, fn);
    executor.compiledBlocks[key] = function tracedBlock(innerCpu) {
      if (!trace.captureActive) {
        return fn(innerCpu);
      }

      const meta = executor.blockMeta[key];
      const [pcHex, mode = 'adl'] = key.split(':');
      const blockPc = Number.parseInt(pcHex, 16) & 0xFFFFFF;
      const beforeErrNo = mem[ERRNO_ADDR] & 0xFF;
      const beforeRegs = snapshotRegisters(innerCpu);
      const events = [];

      trace.currentEvents = events;
      let result;
      try {
        result = fn(innerCpu);
      } finally {
        trace.currentEvents = null;
      }

      const afterErrNo = mem[ERRNO_ADDR] & 0xFF;
      const justSetErrNo = trace.errNoSetBlock === null && beforeErrNo === 0x00 && afterErrNo === 0x8D;
      const shouldRecord = justSetErrNo || trace.errNoSetBlock !== null;
      const normalizedTarget = normalizeTarget(result);
      const stopOnSentinel = normalizedTarget === FAKE_RET || normalizedTarget === ERR_CATCH;
      const stopOnErasedFlash = normalizedTarget !== null && isErasedFlashFill(mem, normalizedTarget);
      const needsIndirectJumpInfo = shouldRecord || stopOnSentinel || stopOnErasedFlash;
      const indirectJump = needsIndirectJumpInfo ? blockContainsIndirectJump(meta) : false;

      if (justSetErrNo) {
        trace.errNoSetBlock = hex(blockPc);
        trace.errSPValue = hex(read24(mem, ERRSP_ADDR));
        trace.vectorTableSnapshot = mem.slice(VECTOR_TABLE_START, VECTOR_TABLE_END + 1);
      }

      if (shouldRecord) {
        trace.sequence += 1;
        const notes = [];

        if (justSetErrNo) {
          notes.push(`errNo changed 0x00 -> 0x8D; errSP=${hex(read24(mem, ERRSP_ADDR))}`);
        }
        for (const event of events) {
          notes.push(`${event.kind} ${event.addr}/${event.size} -> ${event.value} [${event.tags.join(',')}]`);
        }

        const staticExit = normalizedTarget !== null
          ? Boolean(meta?.exits?.some((exit) => exit.target === normalizedTarget))
          : false;
        if (normalizedTarget !== null && !staticExit) {
          notes.push(`dynamic target ${hex(normalizedTarget)}`);
        }
        if (indirectJump && normalizedTarget !== null) {
          notes.push(`indirect jump target ${hex(normalizedTarget)}`);
        }

        trace.dispatchChain.push({
          sequence: trace.sequence,
          pc: hex(blockPc),
          mode,
          disassembly: decodeBlockDisassembly(meta, mode),
          registers_snapshot: beforeRegs,
          registers_after: snapshotRegisters(innerCpu),
          nextPc: normalizedTarget !== null ? hex(normalizedTarget) : String(result),
          notes,
        });
      }

      if (normalizedTarget !== null && (stopOnSentinel || stopOnErasedFlash)) {
        trace.stopTarget = hex(normalizedTarget);
        trace.finalSourcePc = hex(blockPc);
        trace.finalSourceHadIndirectJump = indirectJump;
        trace.stopKind = normalizedTarget === FAKE_RET
          ? 'return'
          : normalizedTarget === ERR_CATCH
            ? 'err_catch'
            : 'erased_flash';

        if (trace.errNoSetBlock !== null) {
          trace.topLevelEvents.push({
            type: trace.stopKind,
            from: hex(blockPc),
            target: hex(normalizedTarget),
            indirectJump,
          });
        }

        if (stopOnErasedFlash && trace.errNoSetBlock !== null) {
          trace.dispatchChain.push({
            sequence: trace.sequence + 1,
            pc: hex(normalizedTarget),
            mode: 'adl',
            disassembly: [`${hex(normalizedTarget)}: ${hexBytes(romBytes, normalizedTarget, 16)}  erased flash (0xFF fill)`],
            registers_snapshot: snapshotRegisters(innerCpu),
            notes: [`terminal target reached from ${hex(blockPc)}`],
          });
        }

        throw new Error(TRACE_STOP);
      }

      return result;
    };
  }

  return {
    trace,
    restore() {
      for (const [key, fn] of originalFns.entries()) {
        executor.compiledBlocks[key] = fn;
      }
      cpu.read8 = originalCpu.read8;
      cpu.read16 = originalCpu.read16;
      cpu.read24 = originalCpu.read24;
      cpu.write8 = originalCpu.write8;
      cpu.write16 = originalCpu.write16;
      cpu.write24 = originalCpu.write24;
    },
  };
}

function runParseTrace(executor, cpu, mem) {
  resetCpuForOsCall(cpu, mem);
  mem.fill(0x00, OP1_ADDR, OP1_ADDR + 9);
  cpu.sp -= 3;
  write24(mem, cpu.sp, FAKE_RET);

  const errBase = (cpu.sp - 6) & 0xFFFFFF;
  write24(mem, errBase, ERR_CATCH);
  write24(mem, errBase + 3, 0);
  write24(mem, ERRSP_ADDR, errBase);
  mem[ERRNO_ADDR] = 0x00;

  const harness = createTraceHarness(executor, cpu, mem);
  harness.trace.captureActive = true;

  let currentPc = PARSEINP_ENTRY;
  let currentMode = 'adl';
  let totalSteps = 0;
  let termination = null;
  let errorMessage = null;
  let lastPc = currentPc;
  let lastMode = currentMode;

  try {
    while (totalSteps < PARSEINP_MAX_STEPS) {
      const segmentBudget = Math.min(SEGMENT_STEP_LIMIT, PARSEINP_MAX_STEPS - totalSteps);
      const result = executor.runFrom(currentPc, currentMode, {
        maxSteps: segmentBudget,
        maxLoopIterations: OS_MAX_LOOP_ITERATIONS,
      });

      totalSteps += result.steps ?? 0;
      lastPc = (result.lastPc ?? lastPc) & 0xFFFFFF;
      lastMode = result.lastMode ?? lastMode;
      currentPc = lastPc;
      currentMode = lastMode;

      if (result.termination === 'error' && result.error?.message === TRACE_STOP) {
        termination = harness.trace.stopKind ?? 'trace_stop';
        break;
      }

      if (result.termination !== 'max_steps') {
        termination = result.termination ?? null;
        if (result.error) {
          errorMessage = result.error?.stack ?? String(result.error);
        }
        break;
      }
    }
  } finally {
    harness.trace.captureActive = false;
    harness.restore();
  }

  const vectorSnapshot = harness.trace.vectorTableSnapshot ?? mem.slice(VECTOR_TABLE_START, VECTOR_TABLE_END + 1);

  return {
    errFrameBase: hex(errBase),
    totalSteps,
    lastPc: hex(lastPc),
    lastMode,
    termination,
    errorMessage,
    errNo: hex(mem[ERRNO_ADDR] & 0xFF, 2),
    errSP: hex(read24(mem, ERRSP_ADDR)),
    trace: harness.trace,
    vectorTableDump: dumpVectorTable(vectorSnapshot),
  };
}

function summarizeKeyFinding(parseResult) {
  const trace = parseResult.trace;
  if (!trace.errNoSetBlock) {
    return 'ParseInp did not set errNo to 0x8D during the traced call.';
  }

  const errSpRead = trace.dispatchChain
    .flatMap((entry) => entry.notes ?? [])
    .find((note) => note.includes('[errSP]'));
  const vectorRead = trace.dispatchChain
    .flatMap((entry) => entry.notes ?? [])
    .find((note) => note.includes('[vectorTable]'));

  const parts = [`errNo first becomes 0x8D in block ${trace.errNoSetBlock}`];
  if (errSpRead) parts.push(`the dispatch chain reads errSP (${errSpRead})`);
  if (vectorRead) parts.push(`touches the appErr/vector area (${vectorRead})`);
  if (trace.stopTarget) {
    parts.push(
      `${trace.finalSourceHadIndirectJump ? 'an indirect jump' : 'a dynamic target'} from ${trace.finalSourcePc} lands at ${trace.stopTarget}`,
    );
  }

  return `${parts.join(', ')}.`;
}

function main() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);

  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  const boot = bootRuntime(executor, cpu, mem);

  const memInit = runMemInit(executor, cpu, mem);
  requireHit('MEM_INIT', memInit, 'ret');

  const createReal = runCreateRealAns(executor, cpu, mem);
  if (createReal.hit === 'err') {
    throw new Error(`CreateReal(Ans) hit ERR_CATCH with errNo=${hex(mem[ERRNO_ADDR], 2)}`);
  }
  requireHit('CreateReal(Ans)', createReal, 'ret');

  const postCreatePointers = {
    ops: read24(mem, OPS_ADDR),
    fps: read24(mem, FPS_ADDR),
    fpsBase: read24(mem, FPSBASE_ADDR),
  };

  write24(mem, EDIT_TOP, BUF_START);
  write24(mem, EDIT_CURSOR, BUF_START);
  write24(mem, EDIT_TAIL, BUF_END);
  write24(mem, EDIT_BTM, BUF_END);
  mem.fill(0x00, BUF_START, BUF_END);

  const bufInsertRuns = [];
  for (const token of INSERT_TOKENS) {
    const result = runBufInsertToken(executor, cpu, mem, token);
    requireHit(`BufInsert(${hex(token, 2)})`, result, 'ret');
    bufInsertRuns.push({
      token: hex(token, 2),
      steps: result.steps,
      lastPc: hex(result.lastPc),
      termination: result.termination,
    });
  }

  const cursor = read24(mem, EDIT_CURSOR);
  const preGapLen = cursor - BUF_START;

  write24(mem, BEGPC_ADDR, BUF_START);
  write24(mem, CURPC_ADDR, BUF_START);
  write24(mem, ENDPC_ADDR, BUF_START + preGapLen - 1);

  write24(mem, OPS_ADDR, postCreatePointers.ops);
  write24(mem, FPS_ADDR, postCreatePointers.fps);
  write24(mem, FPSBASE_ADDR, postCreatePointers.fpsBase);

  const parseResult = runParseTrace(executor, cpu, mem);

  const report = {
    probe: 'phase183-error-dispatch-trace',
    generatedAt: new Date().toISOString(),
    setup: {
      boot,
      memInit: {
        steps: memInit.steps,
        lastPc: hex(memInit.lastPc),
        termination: memInit.termination,
      },
      createReal: {
        steps: createReal.steps,
        lastPc: hex(createReal.lastPc),
        termination: createReal.termination,
        errBase: createReal.errBase,
      },
      bufInsertRuns,
      editBuffer: {
        start: hex(BUF_START),
        cursor: hex(cursor),
        preGapLength: preGapLen,
        bytes: hexBytes(mem, BUF_START, Math.max(0, cursor - BUF_START)),
      },
      parserPointers: {
        begPC: hex(read24(mem, BEGPC_ADDR)),
        curPC: hex(read24(mem, CURPC_ADDR)),
        endPC: hex(read24(mem, ENDPC_ADDR)),
        curRow: hex(mem[CUR_ROW_ADDR], 2),
        curCol: hex(mem[CUR_COL_ADDR], 2),
      },
    },
    errNoSetBlock: parseResult.trace.errNoSetBlock,
    dispatchChain: parseResult.trace.dispatchChain,
    vectorTableDump: parseResult.vectorTableDump,
    errSPValue: parseResult.trace.errSPValue,
    keyFinding: summarizeKeyFinding(parseResult),
    traceSummary: {
      totalSteps: parseResult.totalSteps,
      termination: parseResult.termination,
      lastPc: parseResult.lastPc,
      lastMode: parseResult.lastMode,
      errNo: parseResult.errNo,
      errSP: parseResult.errSP,
      errFrameBase: parseResult.errFrameBase,
      finalTarget: parseResult.trace.stopTarget,
      finalSourcePc: parseResult.trace.finalSourcePc,
      finalSourceHadIndirectJump: parseResult.trace.finalSourceHadIndirectJump,
      topLevelEvents: parseResult.trace.topLevelEvents,
      errorMessage: parseResult.errorMessage,
    },
  };

  console.log(JSON.stringify(report, null, 2));
}

try {
  main();
} catch (error) {
  console.log(JSON.stringify({
    probe: 'phase183-error-dispatch-trace',
    generatedAt: new Date().toISOString(),
    error: error?.stack ?? String(error),
  }, null, 2));
  process.exitCode = 1;
}
