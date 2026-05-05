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
const STACK_TOP = 0xD1A87E;
const MBASE = 0xD0;
const IY_ADDR = 0xD00080;
const IX_ADDR = 0xD1A860;

const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const MEM_INIT_ENTRY = 0x09DEE0;
const CREATE_REAL_ENTRY = 0x08238A;

const TOKEN_STAGING_ADDR = 0xD0230E;
const OP1_ADDR = 0xD005F8;
const TOKEN_LENGTH = 9;

const ROM_ERRSP_ADDR = 0xD008E0;
const ROM_ERRNO_ADDR = 0xD008DF;

const CREATE_REAL_RET = 0x7FFFFE;
const CREATE_REAL_ERR = 0x7FFFFA;
const MEM_INIT_RET = 0x7FFFF6;
const TRACE_RET = 0x7FFFF0;

const COPY9_ENTRY = 0x07F9FB;
const KEY_CLASSIFIER_ENTRY = 0x07F7BD;

const HOME_RANGE_START = 0x058000;
const HOME_RANGE_END = 0x05A000;

const YEQ_TOKEN = 0x8D;
const ENTRY_CANDIDATES = [0x05849F, 0x0584A0, 0x0584A3, 0x05848F];

const SEGMENT_STEP_LIMIT = 2000;
const BOOT_MAX_STEPS = 20000;
const KERNEL_INIT_MAX_STEPS = 100000;
const POST_INIT_MAX_STEPS = 100;
const MEM_INIT_MAX_STEPS = 100000;
const CREATE_REAL_MAX_STEPS = 50000;
const TRACE_MAX_STEPS = 2000;
const OS_MAX_LOOP_ITERATIONS = 8192;

const ANS_NAME_OP1 = Uint8Array.from([0x00, 0x72, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

const YEQ_ENTRY_POINTS = new Map([
  [0x09CB14, 'Y= attribute status line'],
  [0x05E7D2, 'Y= attribute parent'],
  [0x05E481, 'Y= attribute parent'],
]);

const YEQ_RANGES = [
  { start: 0x09C000, end: 0x09D000, label: '0x09C000-0x09D000 Y= editor page' },
  { start: 0x06B300, end: 0x06B400, label: '0x06B300-0x06B400 Y= range hypothesis' },
];

const WATCH_LABELS = new Map([
  [0x05848F, 'fallback entry before helper calls'],
  [0x05849F, 'ld hl, TOKEN_STAGING'],
  [0x0584A3, 'call Copy9 TOKEN_STAGING->OP1'],
  [0x0584A7, 'call key classifier'],
  [0x0584AB, 'cp 0x06'],
  [0x0584B1, 'cp 0x05'],
  [0x0584B5, 'type-5 branch'],
  [0x0584C1, 'general key branch'],
  [0x0584D5, 'call 0x091BEB with de=0x2A'],
  [0x0584DA, 'call 0x08CA85'],
  [0x0584EE, 'call 0x091BEB with de=0x04'],
  [0x0584F4, 'call 0x058569'],
  [0x058500, 'call 0x0583F2'],
  [0x05850C, 'error tail'],
  [0x058514, 'call 0x09927F'],
  [0x058518, 'post type-5 error check'],
  [0x058520, 'BufInsert site #1'],
  [0x05852A, 'BufInsert site #2'],
  [0x058530, 'call 0x058569'],
  [0x05853C, 'BufInsert site #3'],
  [0x058540, 'jp z, 0x061D42'],
  [0x058569, 'helper after general branch'],
  [0x0585AD, 'BufInsert site #4'],
  [0x0585CA, 'BufInsert site #5'],
  [0x0585D3, 'dispatch table jp (hl)'],
  [0x05E2A0, 'BufInsert'],
  [0x061D42, 'special/error handler'],
  [0x07F7BD, 'key classifier'],
  [0x07F9FB, 'Copy9 helper'],
  [0x0800B8, 'general branch helper'],
  [0x082C2F, 'type-5 secondary helper'],
  [0x082C50, 'general branch helper'],
  [0x08384F, 'type-5 primary helper'],
  [0x08CA85, 'post-copy helper'],
  [0x091BEB, 'comparison/helper'],
  [0x09CB14, 'Y= attribute status line'],
]);

function hex(value, width = 6) {
  if (value === null || value === undefined) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return (value & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

function hexBytes(buffer, start, length) {
  const out = [];
  for (let index = 0; index < length; index += 1) {
    out.push(hexByte(buffer[(start + index) & 0xFFFFFF] ?? 0));
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

function snapshotCpu(cpu) {
  return {
    pc: hex(cpu._currentBlockPc ?? 0),
    sp: hex(cpu.sp),
    a: hex(cpu.a, 2),
    f: hex(cpu.f, 2),
    bc: hex(cpu._bc),
    de: hex(cpu._de),
    hl: hex(cpu._hl),
    ix: hex(cpu._ix),
    iy: hex(cpu._iy),
    madl: cpu.madl,
    mbase: hex(cpu.mbase, 2),
  };
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

function makeSentinelError(termination, pc) {
  const error = new Error('__PHASE191_SENTINEL__');
  error.isSentinel = true;
  error.termination = termination;
  error.pc = pc & 0xFFFFFF;
  return error;
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
        throw makeSentinelError('sentinel', normalizedPc);
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
        termination = error.termination;
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
  const bootResult = runStageInSegments(executor, BOOT_ENTRY, 'z80', BOOT_MAX_STEPS, 32);

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const kernelInitResult = runStageInSegments(executor, KERNEL_INIT_ENTRY, 'adl', KERNEL_INIT_MAX_STEPS, 10000);

  cpu.mbase = MBASE;
  cpu._iy = IY_ADDR;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const postInitResult = runStageInSegments(executor, POST_INIT_ENTRY, 'adl', POST_INIT_MAX_STEPS, 32);

  return {
    boot: { steps: bootResult.steps, lastPc: hex(bootResult.lastPc), termination: bootResult.termination },
    kernelInit: { steps: kernelInitResult.steps, lastPc: hex(kernelInitResult.lastPc), termination: kernelInitResult.termination },
    postInit: { steps: postInitResult.steps, lastPc: hex(postInitResult.lastPc), termination: postInitResult.termination },
  };
}

function runMemInit(executor, cpu, mem) {
  resetCpuForOsCall(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEM_INIT_RET);
  mem[ROM_ERRNO_ADDR] = 0x00;
  return runUntilHitSegmented(executor, MEM_INIT_ENTRY, 'adl', { ret: MEM_INIT_RET }, MEM_INIT_MAX_STEPS, OS_MAX_LOOP_ITERATIONS);
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

function memAddr(inst) {
  if (!Number.isInteger(inst?.addr)) return null;
  if (inst.modePrefix === 'sis' || inst.modePrefix === 'lis') {
    return ((MBASE << 16) | (inst.addr & 0xFFFF)) >>> 0;
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
    case 'djnz': return `${prefix}djnz ${hex(inst.target)}`;
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
    case 'ld-reg-imm': return `${prefix}ld ${inst.dest}, ${hex(inst.value, 2)}`;
    case 'ld-reg-reg': return `${prefix}ld ${inst.dest}, ${inst.src}`;
    case 'ld-reg-ind': return `${prefix}ld ${inst.dest}, (${inst.src})`;
    case 'ld-ind-reg': return `${prefix}ld (${inst.dest}), ${inst.src}`;
    case 'ld-reg-mem': return `${prefix}ld ${inst.dest}, (${hex(memAddr(inst) ?? inst.addr)})`;
    case 'ld-mem-reg': return `${prefix}ld (${hex(memAddr(inst) ?? inst.addr)}), ${inst.src}`;
    case 'ld-reg-ixd': return `${prefix}ld ${inst.dest}, (${inst.indexRegister}${disp(inst.displacement)})`;
    case 'ld-ixd-reg': return `${prefix}ld (${inst.indexRegister}${disp(inst.displacement)}), ${inst.src}`;
    case 'ld-ixd-imm': return `${prefix}ld (${inst.indexRegister}${disp(inst.displacement)}), ${hex(inst.value, 2)}`;
    case 'ld-ind-imm': return `${prefix}ld (hl), ${hex(inst.value, 2)}`;
    case 'alu-imm': return `${prefix}${inst.op} ${hex(inst.value, 2)}`;
    case 'alu-reg': return `${prefix}${inst.op} ${inst.src}`;
    case 'add-pair': return `${prefix}add ${inst.dest}, ${inst.src}`;
    case 'adc-pair': return `${prefix}adc hl, ${inst.src}`;
    case 'sbc-pair': return `${prefix}sbc hl, ${inst.src}`;
    case 'indexed-cb-res': return `${prefix}res ${inst.bit}, (${inst.indexRegister}${disp(inst.displacement)})`;
    case 'indexed-cb-set': return `${prefix}set ${inst.bit}, (${inst.indexRegister}${disp(inst.displacement)})`;
    case 'indexed-cb-bit': return `${prefix}bit ${inst.bit}, (${inst.indexRegister}${disp(inst.displacement)})`;
    case 'ex-de-hl': return `${prefix}ex de, hl`;
    case 'ldir': return `${prefix}ldir`;
    case 'lddr': return `${prefix}lddr`;
    case 'di': return `${prefix}di`;
    case 'ei': return `${prefix}ei`;
    case 'halt': return `${prefix}halt`;
    default: return `${prefix}${inst.tag}`;
  }
}

function disassembleRange(start, end, mode = 'adl') {
  const rows = [];
  for (let pc = start; pc < end;) {
    try {
      const inst = decodeInstruction(romBytes, pc, mode);
      rows.push({
        pc: inst.pc ?? pc,
        bytes: hexBytes(romBytes, pc, inst.length),
        text: formatInstruction(inst),
        length: inst.length,
      });
      pc += Math.max(inst.length ?? 1, 1);
    } catch (error) {
      rows.push({
        pc,
        bytes: hexBytes(romBytes, pc, 1),
        text: `decode error: ${error.message}`,
        length: 1,
      });
      pc += 1;
    }
  }
  return rows;
}

function classifyRangeHit(pc) {
  const hits = [];
  for (const [addr, label] of YEQ_ENTRY_POINTS) {
    if (pc === addr) hits.push(label);
  }
  for (const range of YEQ_RANGES) {
    if (pc >= range.start && pc < range.end) hits.push(range.label);
  }
  return hits;
}

function traceBypassAttempt(executor, cpu, mem, entry) {
  mem.fill(0x00, TOKEN_STAGING_ADDR, TOKEN_STAGING_ADDR + TOKEN_LENGTH);
  mem[TOKEN_STAGING_ADDR] = YEQ_TOKEN;
  mem.fill(0x00, OP1_ADDR, OP1_ADDR + TOKEN_LENGTH);

  resetCpuForOsCall(cpu, mem);
  cpu.a = YEQ_TOKEN;
  cpu._hl = TOKEN_STAGING_ADDR;
  cpu.sp -= 3;
  write24(mem, cpu.sp, TRACE_RET);

  const trace = [];
  const visitedCounts = new Map();
  const homeRangeBlocks = [];
  const homeRangeSet = new Set();
  const yeqHits = [];
  const yeqSet = new Set();
  const bufInsertSites = [];
  const missingBlocks = [];

  let totalSteps = 0;
  let currentPc = entry & 0xFFFFFF;
  let currentMode = 'adl';
  let termination = null;
  let errorMessage = null;
  let hit = null;
  let lastPc = currentPc;
  let lastMode = currentMode;

  let copy9Fired = false;
  let copy9Snapshot = null;
  let classificationSnapshot = null;
  let cp06Snapshot = null;
  let cp05Snapshot = null;
  let dispatchPath = null;
  let helper058569Reached = false;
  let jumpTableReached = false;

  const noteBlock = (pc, mode, stepBase, stepInSegment, missing = false) => {
    const normalizedPc = pc & 0xFFFFFF;
    const stepNumber = stepBase + ((stepInSegment ?? 0) + 1);
    lastPc = normalizedPc;
    lastMode = mode ?? lastMode;

    visitedCounts.set(normalizedPc, (visitedCounts.get(normalizedPc) ?? 0) + 1);

    if (normalizedPc >= HOME_RANGE_START && normalizedPc < HOME_RANGE_END && !homeRangeSet.has(normalizedPc)) {
      homeRangeSet.add(normalizedPc);
      homeRangeBlocks.push(normalizedPc);
    }

    const yeqLabels = classifyRangeHit(normalizedPc);
    if (yeqLabels.length > 0 && !yeqSet.has(normalizedPc)) {
      yeqSet.add(normalizedPc);
      yeqHits.push({ pc: normalizedPc, labels: yeqLabels });
    }

    if (normalizedPc === COPY9_ENTRY) {
      copy9Fired = true;
      if (!copy9Snapshot) {
        copy9Snapshot = {
          hl: cpu._hl >>> 0,
          tokenStaging: hexBytes(mem, TOKEN_STAGING_ADDR, TOKEN_LENGTH),
          op1BeforeCopy: hexBytes(mem, OP1_ADDR, TOKEN_LENGTH),
        };
      }
    }

    if (normalizedPc === KEY_CLASSIFIER_ENTRY && !classificationSnapshot) {
      classificationSnapshot = {
        op1Bytes: hexBytes(mem, OP1_ADDR, TOKEN_LENGTH),
        op1_0: mem[OP1_ADDR] & 0xFF,
        classValue: mem[OP1_ADDR] & 0x3F,
        aAtEntry: cpu.a & 0xFF,
        hl: cpu._hl >>> 0,
      };
    }

    if (normalizedPc === 0x0584AB && !cp06Snapshot) {
      cp06Snapshot = { aBeforeCp: cpu.a & 0xFF };
    }
    if (normalizedPc === 0x061D42 && !dispatchPath) {
      dispatchPath = 'cp 0x06 matched -> jp z 0x061D42';
    }

    if (normalizedPc === 0x0584B1 && !cp05Snapshot) {
      cp05Snapshot = { aBeforeCp: cpu.a & 0xFF };
    }
    if (normalizedPc === 0x0584B5 && !dispatchPath) {
      dispatchPath = 'cp 0x05 matched -> type-5 branch via 0x08384F / 0x082C2F';
    }
    if (normalizedPc === 0x0584C1 && !dispatchPath) {
      dispatchPath = 'cp 0x06 no, cp 0x05 no -> general insertion branch';
    }

    if ([0x058520, 0x05852A, 0x05853C, 0x0585AD, 0x0585CA, 0x05E2A0].includes(normalizedPc)) {
      bufInsertSites.push(normalizedPc);
    }
    if (normalizedPc === 0x058569) helper058569Reached = true;
    if (normalizedPc === 0x0585D3) jumpTableReached = true;
    if (missing) missingBlocks.push(normalizedPc);

    trace.push({
      step: stepNumber,
      pc: normalizedPc,
      mode: mode ?? 'adl',
      missing,
      a: cpu.a & 0xFF,
      f: cpu.f & 0xFF,
      hl: cpu._hl >>> 0,
      de: cpu._de >>> 0,
      sp: cpu.sp >>> 0,
      label: WATCH_LABELS.get(normalizedPc) ?? null,
      yeqLabels,
    });

    if (normalizedPc === TRACE_RET) {
      hit = 'ret';
      throw makeSentinelError('sentinel', normalizedPc);
    }
  };

  while (totalSteps < TRACE_MAX_STEPS && !hit) {
    const segmentBudget = Math.min(SEGMENT_STEP_LIMIT, TRACE_MAX_STEPS - totalSteps);
    const stepBase = totalSteps;
    try {
      const result = executor.runFrom(currentPc, currentMode, {
        maxSteps: segmentBudget,
        maxLoopIterations: OS_MAX_LOOP_ITERATIONS,
        onBlock(pc, mode, _meta, step) {
          noteBlock(pc, mode, stepBase, step, false);
        },
        onMissingBlock(pc, mode, step) {
          noteBlock(pc, mode, stepBase, step, true);
        },
      });

      totalSteps += result.steps ?? 0;
      currentPc = (result.lastPc ?? currentPc) & 0xFFFFFF;
      currentMode = result.lastMode ?? currentMode;
      lastPc = currentPc;
      lastMode = currentMode;
      termination = result.termination ?? null;

      if (termination !== 'max_steps') {
        if (result.error) errorMessage = result.error?.stack ?? String(result.error);
        break;
      }
    } catch (error) {
      if (error?.isSentinel) {
        termination = error.termination;
        lastPc = error.pc;
        break;
      }
      errorMessage = error?.stack ?? String(error);
      termination = 'exception';
      break;
    }
  }

  if (totalSteps >= TRACE_MAX_STEPS && !hit && termination === 'max_steps') {
    termination = 'step_limit';
  } else if (totalSteps >= TRACE_MAX_STEPS && !hit && termination === null) {
    termination = 'step_limit';
  } else if (termination === null) {
    termination = 'completed';
  }

  if (!dispatchPath && classificationSnapshot) {
    const value = classificationSnapshot.classValue;
    if (value === 0x06) {
      dispatchPath = 'classification says type 6, but branch block was not observed';
    } else if (value === 0x05) {
      dispatchPath = 'classification says type 5, but branch block was not observed';
    } else {
      dispatchPath = `classification says fallthrough token type ${hex(value, 2)} (decimal ${value})`;
    }
  }

  const topPcs = [...visitedCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([pc, count]) => ({
      pc,
      count,
      label: WATCH_LABELS.get(pc) ?? null,
    }));

  return {
    entry,
    hit,
    totalSteps,
    termination,
    errorMessage,
    copy9Fired,
    copy9Snapshot,
    classificationFired: Boolean(classificationSnapshot),
    classificationSnapshot,
    cp06Snapshot,
    cp05Snapshot,
    dispatchPath,
    bufInsertSites,
    helper058569Reached,
    jumpTableReached,
    yeqHits,
    homeRangeBlocks,
    missingBlocks,
    topPcs,
    trace,
    finalCpu: snapshotCpu(cpu),
    tokenStagingAfter: hexBytes(mem, TOKEN_STAGING_ADDR, TOKEN_LENGTH),
    op1After: hexBytes(mem, OP1_ADDR, TOKEN_LENGTH),
    stackTop12: hexBytes(mem, cpu.sp & 0xFFFFFF, 12),
    sentinelReturn: read24(mem, cpu.sp & 0xFFFFFF),
    lastPc: hex(lastPc),
    lastMode,
  };
}

function printDisassembly(rows) {
  for (const row of rows) {
    console.log(`  ${hex(row.pc)}: ${row.bytes.padEnd(24, ' ')} ${row.text}`);
  }
}

function printAttempt(result) {
  console.log(`  Entry: ${hex(result.entry)}`);
  console.log(`  Termination: ${result.termination}`);
  console.log(`  Steps: ${result.totalSteps}`);
  console.log(`  Sentinel hit: ${result.hit ?? 'no'}`);
  console.log(`  Last PC: ${result.lastPc} (${result.lastMode})`);
  console.log(`  Copy9 fired: ${result.copy9Fired}`);
  if (result.copy9Snapshot) {
    console.log(`  Copy9 snapshot: HL=${hex(result.copy9Snapshot.hl)} TOKEN_STAGING=[${result.copy9Snapshot.tokenStaging}] OP1-before=[${result.copy9Snapshot.op1BeforeCopy}]`);
  }
  console.log(`  Key classifier fired: ${result.classificationFired}`);
  if (result.classificationSnapshot) {
    console.log(`  Classifier sees OP1=[${result.classificationSnapshot.op1Bytes}]`);
    console.log(`  OP1[0]: ${hex(result.classificationSnapshot.op1_0, 2)}`);
    console.log(`  OP1[0] & 0x3F: ${hex(result.classificationSnapshot.classValue, 2)} (decimal ${result.classificationSnapshot.classValue})`);
  }
  if (result.cp06Snapshot) {
    console.log(`  At cp 0x06, A=${hex(result.cp06Snapshot.aBeforeCp, 2)}`);
  }
  if (result.cp05Snapshot) {
    console.log(`  At cp 0x05, A=${hex(result.cp05Snapshot.aBeforeCp, 2)}`);
  }
  console.log(`  Dispatch path: ${result.dispatchPath ?? 'n/a'}`);
  console.log(`  BufInsert-related PCs: ${result.bufInsertSites.length > 0 ? result.bufInsertSites.map((pc) => hex(pc)).join(', ') : 'none'}`);
  console.log(`  Helper 0x058569 reached: ${result.helper058569Reached}`);
  console.log(`  Jump table 0x0585D3 reached: ${result.jumpTableReached}`);
  console.log(`  Y= editor hits: ${result.yeqHits.length > 0 ? result.yeqHits.map((hit) => `${hex(hit.pc)} [${hit.labels.join('; ')}]`).join(', ') : 'none'}`);
  console.log(`  New 0x058xxx-0x059xxx blocks: ${result.homeRangeBlocks.length > 0 ? result.homeRangeBlocks.map((pc) => hex(pc)).join(', ') : 'none'}`);
  console.log(`  Missing blocks: ${result.missingBlocks.length > 0 ? result.missingBlocks.map((pc) => hex(pc)).join(', ') : 'none'}`);
  console.log(`  TOKEN_STAGING after: [${result.tokenStagingAfter}]`);
  console.log(`  OP1 after: [${result.op1After}]`);
  console.log(`  Stack top 12 after: [${result.stackTop12}]`);
  console.log(`  Final CPU: ${JSON.stringify(result.finalCpu)}`);

  console.log('  Top visited PCs:');
  for (const entry of result.topPcs) {
    const label = entry.label ? ` (${entry.label})` : '';
    console.log(`    ${hex(entry.pc)}: ${entry.count}${label}`);
  }

  console.log('  Full block trace:');
  for (const row of result.trace) {
    const missing = row.missing ? ' MISSING' : '';
    const label = row.label ? ` [${row.label}]` : '';
    const yeq = row.yeqLabels.length > 0 ? ` <${row.yeqLabels.join('; ')}>` : '';
    console.log(`    ${String(row.step).padStart(4, ' ')} ${hex(row.pc)}${missing}${label}${yeq} A=${hex(row.a, 2)} F=${hex(row.f, 2)} HL=${hex(row.hl)} DE=${hex(row.de)} SP=${hex(row.sp)}`);
  }

  if (result.errorMessage) {
    console.log('  Error detail:');
    console.log(result.errorMessage);
  }
}

function summarizeAttempts(attempts) {
  return attempts.map((attempt) => ({
    entry: hex(attempt.entry),
    termination: attempt.termination,
    steps: attempt.totalSteps,
    classifier: attempt.classificationFired,
    classValue: attempt.classificationSnapshot ? hex(attempt.classificationSnapshot.classValue, 2) : null,
    dispatchPath: attempt.dispatchPath,
    yeqHits: attempt.yeqHits.map((hit) => ({
      pc: hex(hit.pc),
      labels: hit.labels,
    })),
    homeRangeBlocks: attempt.homeRangeBlocks.map((pc) => hex(pc)),
    missingBlocks: attempt.missingBlocks.map((pc) => hex(pc)),
  }));
}

function main() {
  console.log('=== Phase 191: Y= dispatch bypass probe ===\n');

  console.log('[0] Static disassembly of 0x05849F-0x0584F0\n');
  const disasm = disassembleRange(0x05849F, 0x0584F0);
  printDisassembly(disasm);

  console.log('\n[1] Booting runtime and preparing baseline state\n');
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(romBytes.length, 0x400000)));

  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  const boot = bootRuntime(executor, cpu, mem);
  console.log(`  Boot: ${JSON.stringify(boot.boot)}`);
  console.log(`  KernelInit: ${JSON.stringify(boot.kernelInit)}`);
  console.log(`  PostInit: ${JSON.stringify(boot.postInit)}`);

  const memInit = runMemInit(executor, cpu, mem);
  console.log(`  MemInit: hit=${memInit.hit} steps=${memInit.steps} termination=${memInit.termination}`);
  if (memInit.hit !== 'ret') {
    console.log('  MemInit did not return. Aborting.');
    return;
  }

  const createReal = runCreateRealAns(executor, cpu, mem);
  console.log(`  CreateReal(Ans): hit=${createReal.hit} steps=${createReal.steps} termination=${createReal.termination} errBase=${createReal.errBase}`);
  if (createReal.hit !== 'ret') {
    console.log('  CreateReal(Ans) did not return. Aborting.');
    return;
  }

  const baselineMem = mem.slice();

  console.log('\n[2] Entry attempts\n');
  const attempts = [];
  for (const entry of ENTRY_CANDIDATES) {
    mem.set(baselineMem);
    const attempt = traceBypassAttempt(executor, cpu, mem, entry);
    attempts.push(attempt);
    console.log(`\n--- Attempt ${hex(entry)} ---`);
    printAttempt(attempt);
  }

  const bestAttempt =
    attempts.find((attempt) => attempt.classificationFired && attempt.dispatchPath) ??
    attempts.find((attempt) => attempt.classificationFired) ??
    attempts.find((attempt) => attempt.dispatchPath) ??
    attempts[0];

  console.log('\n=== Best Attempt Summary ===');
  console.log(`  Best entry: ${hex(bestAttempt.entry)}`);
  console.log(`  Classifier fired: ${bestAttempt.classificationFired}`);
  console.log(`  Class value: ${bestAttempt.classificationSnapshot ? `${hex(bestAttempt.classificationSnapshot.classValue, 2)} (decimal ${bestAttempt.classificationSnapshot.classValue})` : 'n/a'}`);
  console.log(`  Dispatch path: ${bestAttempt.dispatchPath ?? 'n/a'}`);
  console.log(`  Y= editor reached: ${bestAttempt.yeqHits.length > 0 ? 'YES' : 'NO'}`);
  if (bestAttempt.yeqHits.length > 0) {
    console.log(`  Y= hit detail: ${bestAttempt.yeqHits.map((hit) => `${hex(hit.pc)} [${hit.labels.join('; ')}]`).join(', ')}`);
  }
  console.log(`  New home-range blocks: ${bestAttempt.homeRangeBlocks.length > 0 ? bestAttempt.homeRangeBlocks.map((pc) => hex(pc)).join(', ') : 'none'}`);

  console.log('\n=== JSON Summary ===');
  console.log(JSON.stringify({
    staticDisassembly: disasm.map((row) => ({
      pc: hex(row.pc),
      bytes: row.bytes,
      text: row.text,
    })),
    attempts: summarizeAttempts(attempts),
    bestAttempt: {
      entry: hex(bestAttempt.entry),
      termination: bestAttempt.termination,
      steps: bestAttempt.totalSteps,
      classifier: bestAttempt.classificationFired,
      classValue: bestAttempt.classificationSnapshot ? {
        hex: hex(bestAttempt.classificationSnapshot.classValue, 2),
        decimal: bestAttempt.classificationSnapshot.classValue,
      } : null,
      dispatchPath: bestAttempt.dispatchPath,
      yeqHits: bestAttempt.yeqHits.map((hit) => ({
        pc: hex(hit.pc),
        labels: hit.labels,
      })),
      homeRangeBlocks: bestAttempt.homeRangeBlocks.map((pc) => hex(pc)),
      missingBlocks: bestAttempt.missingBlocks.map((pc) => hex(pc)),
      finalCpu: bestAttempt.finalCpu,
      op1After: bestAttempt.op1After,
      tokenStagingAfter: bestAttempt.tokenStagingAfter,
    },
  }, null, 2));
}

main();
