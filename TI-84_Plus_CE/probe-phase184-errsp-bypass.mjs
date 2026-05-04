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

const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const MEM_INIT_ENTRY = 0x09DEE0;
const CREATE_REAL_ENTRY = 0x08238A;
const PARSEINP_ENTRY = 0x099914;
const BUFINSERT_ENTRY = 0x05E2A0;

const JERROR_ENTRY = 0x061DB2;
const JERROR_AFTER_CALL = 0x061DBA;
const JERROR_ERRSP_LOAD = 0x061DCA;
const PUSH_ERROR_HANDLER_REGION_START = 0x061D90;
const PUSH_ERROR_HANDLER_REGION_END = 0x061E33;
const PUSH_ERROR_HANDLER_ENTRY = 0x061DEF;
const PUSH_ERROR_HANDLER_ERR_STUB = 0x061DD1;
const PUSH_ERROR_HANDLER_RET_STUB = 0x061E27;

const ERROR_WRAPPER_ENTRY = 0x03E1B4;
const ERROR_WRAPPER_AFTER_HELPER = 0x03E1CA;
const ERROR_HELPER_ENTRY = 0x03E187;
const ERROR_HELPER_MIX_ENTRY = 0x03E190;
const ERROR_HELPER_Z80_BODY = 0x03E193;
const ERROR_HELPER_RET_BLOCK = 0x03E1B1;

const OP1_ADDR = 0xD005F8;
const ERRNO_ADDR = 0xD008DF;
const ERRSP_ADDR = 0xD008E0;

const BEGPC_ADDR = 0xD02317;
const CURPC_ADDR = 0xD0231A;
const ENDPC_ADDR = 0xD0231D;

const EDIT_TOP = 0xD02437;
const EDIT_CURSOR = 0xD0243A;
const EDIT_TAIL = 0xD0243D;
const EDIT_BTM = 0xD02440;

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
const PARSEINP_MAX_STEPS = 300000;

const BOOT_MAX_LOOP_ITERATIONS = 32;
const KERNEL_INIT_MAX_LOOP_ITERATIONS = 10000;
const POST_INIT_MAX_LOOP_ITERATIONS = 32;
const OS_MAX_LOOP_ITERATIONS = 8192;

const STOP_ERROR = '__PHASE184_STOP__';

const ANS_NAME_OP1 = Uint8Array.from([0x00, 0x72, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
const INSERT_TOKENS = Uint8Array.from([0x32, 0x70, 0x33]);

const INTERESTING_PCS = new Map([
  [PARSEINP_ENTRY, 'ParseInp'],
  [0x061D3A, 'ErrUndefined dispatch'],
  [JERROR_ENTRY, 'JError'],
  [ERROR_WRAPPER_ENTRY, 'error wrapper'],
  [ERROR_HELPER_ENTRY, 'error helper'],
  [ERROR_HELPER_MIX_ENTRY, 'helper rsmix block'],
  [ERROR_HELPER_Z80_BODY, 'helper z80 body'],
  [ERROR_HELPER_RET_BLOCK, 'helper pop/ret'],
  [ERROR_WRAPPER_AFTER_HELPER, 'wrapper continuation'],
  [JERROR_AFTER_CALL, 'JError after wrapper'],
  [PUSH_ERROR_HANDLER_ENTRY, 'PushErrorHandler'],
  [PUSH_ERROR_HANDLER_ERR_STUB, 'PushErrorHandler error stub'],
  [PUSH_ERROR_HANDLER_RET_STUB, 'PushErrorHandler cleanup stub'],
  [0x000000, 'boot vector'],
  [0x000066, 'isr vector'],
  [ERR_CATCH, 'probe err catch'],
  [FAKE_RET, 'probe fake ret'],
]);

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

function write16(mem, addr, value) {
  mem[addr] = value & 0xFF;
  mem[addr + 1] = (value >>> 8) & 0xFF;
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
    throw new Error(`${label} expected ${expectedHit}, saw ${result.hit ?? 'none'} (lastPc=${hex(result.lastPc)})`);
  }
}

function runStageInSegments(executor, entry, mode, totalMaxSteps, maxLoopIterations) {
  let currentPc = entry & 0xFFFFFF;
  let currentMode = mode;
  let totalSteps = 0;
  let lastResult = { lastPc: currentPc, lastMode: currentMode, termination: null, error: null };
  while (totalSteps < totalMaxSteps) {
    const segmentBudget = Math.min(SEGMENT_STEP_LIMIT, totalMaxSteps - totalSteps);
    const result = executor.runFrom(currentPc, currentMode, { maxSteps: segmentBudget, maxLoopIterations });
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
    error: lastResult.error ?? null,
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
        throw new Error(STOP_ERROR);
      }
    }
  };

  while (totalSteps < totalMaxSteps && !hit) {
    const segmentBudget = Math.min(SEGMENT_STEP_LIMIT, totalMaxSteps - totalSteps);
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
    if (result.termination === 'error' && result.error?.message === STOP_ERROR) {
      termination = 'sentinel';
      break;
    }
    termination = result.termination ?? null;
    if (result.error) errorMessage = result.error?.stack ?? String(result.error);
    if (termination !== 'max_steps') break;
  }

  return { hit, steps: totalSteps, lastPc, lastMode, termination, errorMessage };
}

function bootRuntime(executor, cpu, mem) {
  const bootResult = runStageInSegments(executor, BOOT_ENTRY, 'z80', BOOT_MAX_STEPS, BOOT_MAX_LOOP_ITERATIONS);
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);
  const kernelInitResult = runStageInSegments(executor, KERNEL_INIT_ENTRY, 'adl', KERNEL_INIT_MAX_STEPS, KERNEL_INIT_MAX_LOOP_ITERATIONS);
  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);
  const postInitResult = runStageInSegments(executor, POST_INIT_ENTRY, 'adl', POST_INIT_MAX_STEPS, POST_INIT_MAX_LOOP_ITERATIONS);
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
  mem[ERRNO_ADDR] = 0x00;
  return runUntilHitSegmented(executor, MEM_INIT_ENTRY, 'adl', { ret: MEM_INIT_RET }, MEM_INIT_MAX_STEPS, OS_MAX_LOOP_ITERATIONS);
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
    ...runUntilHitSegmented(executor, CREATE_REAL_ENTRY, 'adl', { ret: FAKE_RET, err: ERR_CATCH }, CREATE_REAL_MAX_STEPS, OS_MAX_LOOP_ITERATIONS),
  };
}

function runBufInsertToken(executor, cpu, mem, token) {
  resetCpuForOsCall(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, FAKE_RET);
  cpu._de = token & 0xFF;
  return runUntilHitSegmented(executor, BUFINSERT_ENTRY, 'adl', { ret: FAKE_RET }, BUFINSERT_MAX_STEPS, OS_MAX_LOOP_ITERATIONS);
}

function formatInstruction(inst) {
  const prefix = inst.modePrefix ? `${inst.modePrefix} ` : '';
  const disp = (value) => (value >= 0 ? `+${value}` : `${value}`);
  const a = (value) => hex(value);
  let text = inst.tag;
  switch (inst.tag) {
    case 'call': text = `call ${a(inst.target)}`; break;
    case 'call-conditional': text = `call ${inst.condition}, ${a(inst.target)}`; break;
    case 'jp': text = `jp ${a(inst.target)}`; break;
    case 'jp-conditional': text = `jp ${inst.condition}, ${a(inst.target)}`; break;
    case 'jr': text = `jr ${a(inst.target)}`; break;
    case 'jr-conditional': text = `jr ${inst.condition}, ${a(inst.target)}`; break;
    case 'ret': text = 'ret'; break;
    case 'push': text = `push ${inst.pair}`; break;
    case 'pop': text = `pop ${inst.pair}`; break;
    case 'ld-pair-imm': text = `ld ${inst.pair}, ${a(inst.value)}`; break;
    case 'ld-pair-mem':
      text = inst.direction === 'to-mem' ? `ld (${a(inst.addr)}), ${inst.pair}` : `ld ${inst.pair}, (${a(inst.addr)})`;
      break;
    case 'ld-mem-pair': text = `ld (${a(inst.addr)}), ${inst.pair}`; break;
    case 'ld-reg-imm': text = `ld ${inst.dest}, ${hex(inst.value, 2)}`; break;
    case 'ld-reg-mem': text = `ld ${inst.dest}, (${a(inst.addr)})`; break;
    case 'ld-mem-reg': text = `ld (${a(inst.addr)}), ${inst.src}`; break;
    case 'ld-reg-ind': text = `ld ${inst.dest}, (${inst.src})`; break;
    case 'ld-ind-reg': text = `ld (${inst.dest}), ${inst.src}`; break;
    case 'indexed-cb-res': text = `res ${inst.bit}, (${inst.indexRegister}${disp(inst.displacement)})`; break;
    case 'inc-pair': text = `inc ${inst.pair}`; break;
    case 'dec-pair': text = `dec ${inst.pair}`; break;
    case 'add-pair': text = `add ${inst.dest}, ${inst.src}`; break;
    case 'sbc-pair': text = `sbc hl, ${inst.src}`; break;
    case 'di': text = 'di'; break;
    case 'ei': text = 'ei'; break;
    case 'im': text = `im ${inst.mode ?? inst.value}`; break;
    case 'jp-indirect': text = `jp (${inst.indirectRegister})`; break;
    case 'rsmix': text = 'rsmix'; break;
    case 'out0': text = `out0 (${hex(inst.port, 2)}), ${inst.reg}`; break;
    case 'in0': text = `in0 ${inst.reg}, (${hex(inst.port, 2)})`; break;
    case 'ex-de-hl': text = 'ex de, hl'; break;
    case 'nop': text = 'nop'; break;
    default: break;
  }
  return `${prefix}${text}`;
}

function disassembleRange(start, endExclusive, mode) {
  const rows = [];
  let pc = start;
  while (pc < endExclusive) {
    const inst = decodeInstruction(romBytes, pc, mode);
    rows.push({ pcNum: inst.pc, pc: hex(inst.pc), mode, bytes: hexBytes(romBytes, inst.pc, inst.length), text: formatInstruction(inst), inst });
    pc = inst.nextPc;
  }
  return rows;
}

function compactRows(rows) {
  return rows.map((row) => ({ pc: row.pc, mode: row.mode, bytes: row.bytes, text: row.text }));
}

function buildStaticAnalysis() {
  const jErrorRows = disassembleRange(0x061DB2, 0x061DE1, 'adl');
  const pushRegionRows = disassembleRange(PUSH_ERROR_HANDLER_REGION_START, PUSH_ERROR_HANDLER_REGION_END, 'adl');
  const helperPreludeRows = disassembleRange(ERROR_HELPER_ENTRY, ERROR_HELPER_Z80_BODY, 'adl');
  const helperZ80Rows = disassembleRange(ERROR_HELPER_Z80_BODY, 0x03E1B4, 'z80');
  const wrapperRows = disassembleRange(ERROR_WRAPPER_ENTRY, 0x03E1D9, 'adl');

  const jErrorCall = jErrorRows.find((row) => row.inst.tag === 'call' && row.inst.target === ERROR_WRAPPER_ENTRY);
  const errSpLoad = jErrorRows.find((row) => row.inst.tag === 'ld-pair-mem' && row.inst.pair === 'sp' && row.inst.addr === ERRSP_ADDR);
  const helperCall = wrapperRows.find((row) => row.inst.tag === 'call' && row.inst.target === ERROR_HELPER_ENTRY);
  const errSpStore = pushRegionRows.find((row) => row.inst.tag === 'ld-mem-pair' && row.inst.pair === 'sp' && row.inst.addr === ERRSP_ADDR);

  return {
    jErrorDisassembly: compactRows(jErrorRows),
    pushErrorHandlerRegionDisassembly: compactRows(pushRegionRows),
    errorHelperMixedDisassembly: { adlPrelude: compactRows(helperPreludeRows), z80Body: compactRows(helperZ80Rows), adlWrapper: compactRows(wrapperRows) },
    findings: {
      requestedPushErrorHandlerStart: hex(PUSH_ERROR_HANDLER_REGION_START),
      actualPushErrorHandlerEntry: hex(PUSH_ERROR_HANDLER_ENTRY),
      errNoAddress: hex(ERRNO_ADDR),
      errSpAddress: hex(ERRSP_ADDR),
      jErrorCall: jErrorCall ? { pc: hex(jErrorCall.pcNum), target: hex(jErrorCall.inst.target), returnAddress: hex(jErrorCall.inst.fallthrough) } : null,
      jErrorErrSpLoad: errSpLoad ? { pc: hex(errSpLoad.pcNum), address: hex(errSpLoad.inst.addr) } : null,
      helperCall: helperCall ? { pc: hex(helperCall.pcNum), target: hex(helperCall.inst.target), returnAddress: hex(helperCall.inst.fallthrough) } : null,
      pushErrorHandlerErrSpStore: errSpStore ? { pc: hex(errSpStore.pcNum), address: hex(errSpStore.inst.addr) } : null,
      blockAvailability: {
        helperContinuationAdl: Boolean(BLOCKS['03e1ca:adl']),
        helperContinuationZ80: Boolean(BLOCKS['03e1ca:z80']),
        jErrorAfterCallAdl: Boolean(BLOCKS['061dba:adl']),
        jErrorAfterCallZ80: Boolean(BLOCKS['061dba:z80']),
        helperRetZ80: Boolean(BLOCKS['03e1b1:z80']),
      },
      helperReturnMechanics: {
        helperCallPushesAdlReturn: hex(ERROR_WRAPPER_AFTER_HELPER),
        jErrorCallPushesAdlReturn: hex(JERROR_AFTER_CALL),
        z80PopReadsFrom: '(MBASE << 16) | (SP & 0xFFFF)',
        z80PopWidthBytes: 2,
        z80RetWidthBytes: 2,
      },
    },
    pushErrorHandlerFrame: {
      entry: hex(PUSH_ERROR_HANDLER_ENTRY),
      slotsFromSavedErrSp: [
        { offset: 0, bytes: 3, role: 'normal cleanup stub return', value: hex(PUSH_ERROR_HANDLER_RET_STUB), builtBy: ['0x061E14', '0x061E18'] },
        { offset: 3, bytes: 3, role: 'error restore stub', value: hex(PUSH_ERROR_HANDLER_ERR_STUB), builtBy: ['0x061E0F', '0x061E13'] },
        { offset: 6, bytes: 3, role: 'OPS - OPBase delta', value: 'dynamic', builtBy: ['0x061E03..0x061E0E'] },
        { offset: 9, bytes: 3, role: 'FPS - FPSbase delta', value: 'dynamic', builtBy: ['0x061DF6..0x061E02'] },
        { offset: 12, bytes: 3, role: 'previous errSP', value: 'dynamic', builtBy: ['0x061DF1', '0x061DF5'] },
        { offset: 15, bytes: 3, role: 'caller HL payload', value: 'dynamic', builtBy: ['0x061DF0'] },
      ],
    },
  };
}

function buildPreparedState() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  const boot = bootRuntime(executor, cpu, mem);
  const memInit = runMemInit(executor, cpu, mem);
  requireHit('MEM_INIT', memInit, 'ret');
  const createReal = runCreateRealAns(executor, cpu, mem);
  if (createReal.hit === 'err') throw new Error(`CreateReal(Ans) hit ERR_CATCH with errNo=${hex(mem[ERRNO_ADDR], 2)}`);
  requireHit('CreateReal(Ans)', createReal, 'ret');

  const postCreatePointers = { ops: read24(mem, OPS_ADDR), fps: read24(mem, FPS_ADDR), fpsBase: read24(mem, FPSBASE_ADDR) };
  write24(mem, EDIT_TOP, BUF_START);
  write24(mem, EDIT_CURSOR, BUF_START);
  write24(mem, EDIT_TAIL, BUF_END);
  write24(mem, EDIT_BTM, BUF_END);
  mem.fill(0x00, BUF_START, BUF_END);

  const bufInsertRuns = [];
  for (const token of INSERT_TOKENS) {
    const result = runBufInsertToken(executor, cpu, mem, token);
    requireHit(`BufInsert(${hex(token, 2)})`, result, 'ret');
    bufInsertRuns.push({ token: hex(token, 2), steps: result.steps, lastPc: hex(result.lastPc), termination: result.termination });
  }

  const cursor = read24(mem, EDIT_CURSOR);
  const preGapLength = cursor - BUF_START;
  write24(mem, BEGPC_ADDR, BUF_START);
  write24(mem, CURPC_ADDR, BUF_START);
  write24(mem, ENDPC_ADDR, BUF_START + preGapLength - 1);
  write24(mem, OPS_ADDR, postCreatePointers.ops);
  write24(mem, FPS_ADDR, postCreatePointers.fps);
  write24(mem, FPSBASE_ADDR, postCreatePointers.fpsBase);

  return {
    baseMem: mem,
    setup: {
      boot,
      memInit: { steps: memInit.steps, lastPc: hex(memInit.lastPc), termination: memInit.termination },
      createReal: { steps: createReal.steps, lastPc: hex(createReal.lastPc), termination: createReal.termination, errBase: createReal.errBase },
      bufInsertRuns,
      editBuffer: { start: hex(BUF_START), cursor: hex(cursor), preGapLength, bytes: hexBytes(mem, BUF_START, Math.max(0, cursor - BUF_START)) },
      parserPointers: { begPC: hex(read24(mem, BEGPC_ADDR)), curPC: hex(read24(mem, CURPC_ADDR)), endPC: hex(read24(mem, ENDPC_ADDR)) },
      allocatorPointers: { ops: hex(read24(mem, OPS_ADDR)), fps: hex(read24(mem, FPS_ADDR)), fpsBase: hex(read24(mem, FPSBASE_ADDR)) },
    },
  };
}

function seedOuterErrFrame(cpu, mem) {
  resetCpuForOsCall(cpu, mem);
  mem.fill(0x00, OP1_ADDR, OP1_ADDR + 9);
  cpu.sp -= 3;
  write24(mem, cpu.sp, FAKE_RET);
  const errFrameBase = (cpu.sp - 6) & 0xFFFFFF;
  write24(mem, errFrameBase, 0x000000);
  write24(mem, errFrameBase + 3, ERR_CATCH);
  write24(mem, ERRSP_ADDR, errFrameBase);
  mem[ERRNO_ADDR] = 0x00;
  return {
    errFrameBase: hex(errFrameBase),
    errFrameBytes: hexBytes(mem, errFrameBase, 6),
    fakeReturnSp: hex(cpu.sp),
    fakeReturnBytes: hexBytes(mem, cpu.sp, 3),
    errSpValue: hex(read24(mem, ERRSP_ADDR)),
  };
}

function stopReason(reason) {
  const error = new Error(STOP_ERROR);
  error.reason = reason;
  return error;
}

function runScenario(baseMem, scenario) {
  const mem = new Uint8Array(baseMem);
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  const outerErrFrame = seedOuterErrFrame(cpu, mem);
  const trace = { interestingHits: [], popEvents: [], errSpEvents: [], plantInfo: null };

  let currentMode = 'adl';
  let popContext = 'normal';

  const original = {
    pop: cpu.pop.bind(cpu),
    popReturn: cpu.popReturn.bind(cpu),
    read24: cpu.read24.bind(cpu),
    write24: cpu.write24.bind(cpu),
  };

  cpu.popReturn = function patchedPopReturn() {
    const previous = popContext;
    popContext = 'return';
    try {
      return original.popReturn();
    } finally {
      popContext = previous;
    }
  };

  cpu.pop = function patchedPop() {
    const mode = this.madl ? 'adl' : 'z80';
    const spBefore = this.sp & 0xFFFFFF;
    const linearAddr = this.madl ? spBefore : (((this.mbase & 0xFF) << 16) | (spBefore & 0xFFFF));
    const width = this.madl ? 3 : 2;
    const bytesBefore = hexBytes(mem, linearAddr, width);
    const value = original.pop();
    if (mode === 'z80' || this._currentBlockPc === JERROR_AFTER_CALL || this._currentBlockPc === ERROR_HELPER_RET_BLOCK) {
      trace.popEvents.push({
        kind: popContext === 'return' ? 'popReturn' : 'pop',
        blockPc: hex(this._currentBlockPc ?? 0),
        mode,
        spBefore: hex(spBefore),
        linearAddr: hex(linearAddr),
        bytesBefore,
        value: hex(value, this.madl ? 6 : 4),
      });
    }
    return value;
  };

  cpu.read24 = function patchedRead24(addr) {
    const value = original.read24(addr);
    if (addr === ERRSP_ADDR) {
      trace.errSpEvents.push({
        kind: 'read24',
        blockPc: hex(this._currentBlockPc ?? 0),
        mode: this.madl ? 'adl' : 'z80',
        value: hex(value),
      });
    }
    return value;
  };

  cpu.write24 = function patchedWrite24(addr, value) {
    original.write24(addr, value);
    if (addr === ERRSP_ADDR) {
      trace.errSpEvents.push({
        kind: 'write24',
        blockPc: hex(this._currentBlockPc ?? 0),
        mode: this.madl ? 'adl' : 'z80',
        value: hex(value),
      });
    }
  };

  const result = executor.runFrom(PARSEINP_ENTRY, 'adl', {
    maxSteps: PARSEINP_MAX_STEPS,
    maxLoopIterations: OS_MAX_LOOP_ITERATIONS,
    onBlock(pc, mode, _meta, step) {
      currentMode = mode;
      const normalizedPc = pc & 0xFFFFFF;

      if (INTERESTING_PCS.has(normalizedPc)) {
        trace.interestingHits.push({
          step,
          pc: hex(normalizedPc),
          mode,
          label: INTERESTING_PCS.get(normalizedPc),
          sp: hex(cpu.sp),
          errNo: hex(mem[ERRNO_ADDR] & 0xFF, 2),
          errSP: hex(read24(mem, ERRSP_ADDR)),
        });
      }

      if (scenario.returnTargetLow16 !== null && trace.plantInfo === null && normalizedPc === ERROR_HELPER_Z80_BODY && mode === 'z80') {
        const linearAddr = (((cpu.mbase & 0xFF) << 16) | (cpu.sp & 0xFFFF)) & 0xFFFFFF;
        const before = hexBytes(mem, linearAddr, 4);
        write16(mem, linearAddr, 0x0000);
        write16(mem, linearAddr + 2, scenario.returnTargetLow16);
        trace.plantInfo = {
          whenPc: hex(normalizedPc),
          mode,
          spAtPlant: hex(cpu.sp),
          linearAddr: hex(linearAddr),
          beforeBytes: before,
          afterBytes: hexBytes(mem, linearAddr, 4),
          plantedPopAfWord: hex(0x0000, 4),
          plantedRetWord: hex(scenario.returnTargetLow16, 4),
          requestedFullTarget: scenario.requestedFullTarget ? hex(scenario.requestedFullTarget) : null,
        };
      }

      if (normalizedPc === ERR_CATCH) throw stopReason('err_catch');
      if (normalizedPc === FAKE_RET) throw stopReason('fake_ret');
      if (normalizedPc === 0x000000 && step > 0) throw stopReason('boot_vector');
      if (normalizedPc === 0x000066) throw stopReason('isr_vector');
    },
    onMissingBlock(pc, mode, step) {
      currentMode = mode;
      const normalizedPc = pc & 0xFFFFFF;
      throw stopReason({ kind: 'missing_block', step, pc: hex(normalizedPc), mode });
    },
  });

  const stop = result.termination === 'error' && result.error?.message === STOP_ERROR ? result.error.reason : null;
  const interestingPcs = new Set(trace.interestingHits.map((entry) => entry.pc));
  const reachedJErrorAfterCall = interestingPcs.has(hex(JERROR_AFTER_CALL));
  const reachedErrSpLoadInsideJError = trace.errSpEvents.some((event) => event.kind === 'read24' && event.blockPc === hex(JERROR_AFTER_CALL));

  return {
    description: scenario.description,
    requestedFullTarget: scenario.requestedFullTarget ? hex(scenario.requestedFullTarget) : null,
    requestedLow16: scenario.returnTargetLow16 !== null ? hex(scenario.returnTargetLow16, 4) : null,
    outerErrFrame,
    result: {
      stopReason: stop,
      termination: result.termination,
      finalPc: hex(result.lastPc),
      finalMode: result.lastMode ?? currentMode,
      steps: result.steps,
      errNo: hex(mem[ERRNO_ADDR] & 0xFF, 2),
      errSP: hex(read24(mem, ERRSP_ADDR)),
      sp: hex(cpu.sp),
      registers: snapshotRegisters(cpu),
      reachedJErrorAfterCall,
      reachedErrSpLoadInsideJError,
      reachedErrCatch: stop === 'err_catch',
      reachedBootVector: stop === 'boot_vector',
      reachedIsrVector: stop === 'isr_vector',
      dynamicTargets: (result.dynamicTargets ?? []).map((value) => hex(value)),
      missingBlocks: (result.missingBlocks ?? []).map((value) => String(value)),
      trace,
    },
  };
}

function main() {
  const staticAnalysis = buildStaticAnalysis();
  const prepared = buildPreparedState();

  const scenarios = [
    {
      name: 'baseline',
      description: 'No D0 stack planting; observe the helper z80 pop/ret path as-is.',
      requestedFullTarget: null,
      returnTargetLow16: null,
    },
    {
      name: 'plant_helper_return_low16',
      description: 'Plant low16(0x03E1CA) so helper RET tries to resume the wrapper continuation after CALL 0x03E187.',
      requestedFullTarget: ERROR_WRAPPER_AFTER_HELPER,
      returnTargetLow16: ERROR_WRAPPER_AFTER_HELPER & 0xFFFF,
    },
    {
      name: 'plant_jerror_after_call_low16',
      description: 'Plant low16(0x061DBA) to test the direct jump-to-JError-after-call hypothesis.',
      requestedFullTarget: JERROR_AFTER_CALL,
      returnTargetLow16: JERROR_AFTER_CALL & 0xFFFF,
    },
  ].map((scenario) => ({ name: scenario.name, ...runScenario(prepared.baseMem, scenario) }));

  const report = {
    probe: 'phase184-errsp-bypass',
    generatedAt: new Date().toISOString(),
    setup: prepared.setup,
    staticAnalysis,
    scenarios,
    conclusions: [
      `JError reads errSP from ${hex(ERRSP_ADDR)} at ${hex(JERROR_ERRSP_LOAD)} and the wrapper CALL is at ${hex(0x061DB6)} with fallthrough ${hex(JERROR_AFTER_CALL)}.`,
      `The actual PushErrorHandler frame builder starts at ${hex(PUSH_ERROR_HANDLER_ENTRY)}, while ${hex(PUSH_ERROR_HANDLER_REGION_START)} is still dispatch-table tail code.`,
      `The helper unwind is nested: ${hex(0x03E1C6)} pushes ${hex(ERROR_WRAPPER_AFTER_HELPER)} before ${hex(ERROR_HELPER_ENTRY)} switches to z80 and executes pop/ret from (MBASE << 16) | (SP & 0xFFFF).`,
      `In this executor, ${hex(ERROR_WRAPPER_AFTER_HELPER)} and ${hex(JERROR_AFTER_CALL)} exist only as ADL blocks, while the helper RET executes in z80 mode; the scenario traces show whether low16 D0-stack planting is enough anyway.`,
    ],
  };

  console.log(JSON.stringify(report, null, 2));
}

try {
  main();
} catch (error) {
  console.log(JSON.stringify({
    probe: 'phase184-errsp-bypass',
    generatedAt: new Date().toISOString(),
    error: error?.stack ?? String(error),
  }, null, 2));
  process.exitCode = 1;
}
