#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { PRELIFTED_BLOCKS } from './ROM.transpiled.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romPath = path.join(__dirname, 'ROM.rom');

if (!fs.existsSync(romPath)) {
  throw new Error('ROM.rom is missing.');
}

const rom = fs.readFileSync(romPath);

const FLAG_C = 0x01;
const FLAG_N = 0x02;
const FLAG_PV = 0x04;
const FLAG_H = 0x10;
const FLAG_Z = 0x40;
const FLAG_S = 0x80;

const MEM_SIZE = 0x1000000;

const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const MEM_INIT_ENTRY = 0x09DEE0;
const MEM_INIT_RET = 0x7FFFF6;
const MAX_LOOP_ITERATIONS = 8192;

const STACK_TOP = 0xD1A87E;
const IX_ADDR = 0xD1A860;
const IY_ADDR = 0xD00080;
const IY_PLUS_5 = 0xD00085;
const MBASE = 0xD0;
const RETURN_SENTINEL = 0x7FFFFE;

const FORMAT_BUFFER = 0xD0060E;
const EDIT_BUF_START = 0xD00A00;
const EDIT_BUF_END = 0xD00B00;
const EDIT_TOP = 0xD02437;
const EDIT_CURSOR = 0xD0243A;
const EDIT_TAIL = 0xD0243D;
const EDIT_BTM = 0xD02440;

const DISPLAY_RESULT_LOOP_ENTRY = 0x080CFE;
const DISPLAY_RESULT_CALL_STUB = 0x080D08;
const RETURN_FROM_BUF_INSERT = 0x080D0D;
const DISPLAY_RESULT_EXIT = 0x080D14;
const DISPLAY_RESULT_RET = 0x080D18;
const BUF_INSERT = 0x05E2A0;
const BUF_INSERT_POST = 0x05E3AE;

const WATCH_RAM_START = 0xD00000;
const WATCH_RAM_END = 0xD04000;
const MAX_TRACKED_WRITES_PER_STEP = 256;
const LOOP_STEP_LIMIT = 500;
const POST_LOOP_STEP_LIMIT = 200;

const STRING_42_5 = Uint8Array.from([0x34, 0x32, 0x2E, 0x35, 0x00]);
const STRING_5 = Uint8Array.from([0x35, 0x00]);

function normalizeBlocks(rawBlocks) {
  if (Array.isArray(rawBlocks)) {
    return Object.fromEntries(
      rawBlocks
        .filter((block) => block?.id)
        .map((block) => [block.id, block]),
    );
  }

  return rawBlocks ?? {};
}

const BLOCKS = normalizeBlocks(PRELIFTED_BLOCKS);

function hex(value, width = 6) {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function hexBytes(values) {
  return Array.from(values, (value) => (value & 0xFF).toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

function asciiPreview(values) {
  let out = '';
  for (const value of values) {
    const byte = value & 0xFF;
    if (byte === 0x00) break;
    out += byte >= 0x20 && byte <= 0x7E ? String.fromCharCode(byte) : '.';
  }
  return out;
}

function sliceBytes(buffer, start, length) {
  const safeStart = Math.max(0, Math.min(buffer.length, start >>> 0));
  const safeEnd = Math.max(safeStart, Math.min(buffer.length, safeStart + Math.max(0, length)));
  return Array.from(buffer.slice(safeStart, safeEnd));
}

function bytesToHex(buffer, start, length) {
  return hexBytes(sliceBytes(buffer, start, length));
}

function blockKey(addr, mode = 'adl') {
  return `${(addr & 0xFFFFFF).toString(16).padStart(6, '0')}:${mode}`;
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

function flagsObject(f) {
  const z = (f & FLAG_Z) !== 0;
  const c = (f & FLAG_C) !== 0;
  return {
    raw: hexByte(f),
    z,
    nz: !z,
    c,
    nc: !c,
    n: (f & FLAG_N) !== 0,
    pv: (f & FLAG_PV) !== 0,
    h: (f & FLAG_H) !== 0,
    s: (f & FLAG_S) !== 0,
  };
}

function printableChar(value) {
  const byte = value & 0xFF;
  return byte >= 0x20 && byte <= 0x7E ? String.fromCharCode(byte) : null;
}

function formatWriteValue(value, size) {
  return size === 1 ? hexByte(value) : hex(value, size * 2);
}

function writeBytes(value, size) {
  const bytes = [];
  for (let index = 0; index < size; index += 1) {
    bytes.push(((value >>> (8 * index)) & 0xFF).toString(16).toUpperCase().padStart(2, '0'));
  }
  return bytes.join(' ');
}

function shouldTrackWrite(addr) {
  const normalized = addr & 0xFFFFFF;
  return normalized >= WATCH_RAM_START && normalized < WATCH_RAM_END;
}

function installWriteTracer(cpu, stepWrites, onDrop) {
  const originals = {
    write8: cpu.write8,
    write16: cpu.write16,
    write24: cpu.write24,
  };

  function record(kind, addr, size, value) {
    const normalizedAddr = addr & 0xFFFFFF;
    if (!shouldTrackWrite(normalizedAddr)) return;
    if (stepWrites.length >= MAX_TRACKED_WRITES_PER_STEP) {
      onDrop();
      return;
    }
    stepWrites.push({
      kind,
      addr: hex(normalizedAddr),
      addrValue: normalizedAddr,
      size,
      value: formatWriteValue(value, size),
      bytes: writeBytes(value, size),
      pc: hex(cpu._currentBlockPc ?? 0),
    });
  }

  cpu.write8 = function tracedWrite8(addr, value) {
    record('write8', addr, 1, value);
    return originals.write8.call(this, addr, value);
  };

  cpu.write16 = function tracedWrite16(addr, value) {
    record('write16', addr, 2, value);
    return originals.write16.call(this, addr, value);
  };

  cpu.write24 = function tracedWrite24(addr, value) {
    record('write24', addr, 3, value);
    return originals.write24.call(this, addr, value);
  };

  return () => {
    cpu.write8 = originals.write8;
    cpu.write16 = originals.write16;
    cpu.write24 = originals.write24;
  };
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
    maxSteps: 20000,
    maxLoopIterations: 32,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const kernelInit = executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: 100000,
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
    maxSteps: 100,
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
  push24(cpu, mem, MEM_INIT_RET);

  let returned = false;
  let result = null;

  try {
    result = executor.runFrom(MEM_INIT_ENTRY, 'adl', {
      maxSteps: 100000,
      maxLoopIterations: MAX_LOOP_ITERATIONS,
      onBlock(pc) {
        if ((pc & 0xFFFFFF) === MEM_INIT_RET) throw new Error('__MEM_INIT_RET__');
      },
      onMissingBlock(pc) {
        if ((pc & 0xFFFFFF) === MEM_INIT_RET) throw new Error('__MEM_INIT_RET__');
      },
    });
  } catch (error) {
    if (error?.message === '__MEM_INIT_RET__') {
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
    memory: new Uint8Array(mem),
    boot,
    memInit,
    pointersAfterMemInit: {
      top: hex(read24(mem, EDIT_TOP)),
      cursor: hex(read24(mem, EDIT_CURSOR)),
      tail: hex(read24(mem, EDIT_TAIL)),
      bottom: hex(read24(mem, EDIT_BTM)),
      iyPlus5: hexByte(mem[IY_PLUS_5]),
    },
  };
}

function seedFormatBuffer(mem, bytes) {
  mem.fill(0x00, FORMAT_BUFFER, FORMAT_BUFFER + 0x20);
  mem.set(bytes, FORMAT_BUFFER);
}

function resolveNextMode(meta, returnedPc, currentMode) {
  if (!meta?.exits) return currentMode;
  for (const exit of meta.exits) {
    if (exit.target === returnedPc && exit.targetMode) {
      return exit.targetMode;
    }
  }
  return currentMode;
}

function captureState(cpu, mem) {
  const editCursorValue = read24(mem, EDIT_CURSOR);
  const editBuffer16Bytes = sliceBytes(mem, EDIT_BUF_START, 0x10);
  const cursorWindow16Bytes = sliceBytes(mem, editCursorValue, 0x10);
  return {
    aValue: cpu.a & 0xFF,
    fValue: cpu.f & 0xFF,
    bcValue: cpu.bc >>> 0,
    deValue: cpu.de >>> 0,
    hlValue: cpu.hl >>> 0,
    spValue: cpu.sp >>> 0,
    editCursorValue,
    editBuffer16Bytes,
    cursorWindow16Bytes,
  };
}

function serializeStateValues(state) {
  return {
    a: hexByte(state.aValue),
    f: hexByte(state.fValue),
    flags: flagsObject(state.fValue),
    bc: hex(state.bcValue),
    de: hex(state.deValue),
    hl: hex(state.hlValue),
    sp: hex(state.spValue),
    editCursor: hex(state.editCursorValue),
    editCursorValue: state.editCursorValue,
    editBuffer16Hex: hexBytes(state.editBuffer16Bytes),
    editBuffer16Ascii: asciiPreview(state.editBuffer16Bytes),
    cursorWindow16Hex: hexBytes(state.cursorWindow16Bytes),
    cursorWindow16Ascii: asciiPreview(state.cursorWindow16Bytes),
  };
}

function executeStep(executor, cpu, mem, state, stepNumber) {
  const key = blockKey(state.pc, state.mode);
  const meta = executor.blockMeta[key] ?? null;
  const fn = executor.compiledBlocks[key] ?? null;
  const before = captureState(cpu, mem);
  const stepWrites = [];
  let droppedWriteCount = 0;
  const restoreTracer = installWriteTracer(cpu, stepWrites, () => {
    droppedWriteCount += 1;
  });

  cpu.madl = state.mode === 'adl' ? 1 : 0;
  cpu._currentBlockPc = state.pc & 0xFFFFFF;

  let result = null;
  let termination = null;
  let error = null;

  if (!fn) {
    termination = 'missing_block';
  } else {
    try {
      result = fn(cpu);
    } catch (caught) {
      termination = 'error';
      error = {
        message: caught?.message ?? String(caught),
        stack: caught?.stack ?? null,
      };
    }
  }

  restoreTracer();

  if (!termination) {
    if (result === undefined || result === null) {
      termination = 'no_return';
    } else if (result < 0) {
      termination = result === -1 ? 'halt' : 'sleep';
    }
  }

  let nextPcValue = null;
  let nextMode = state.mode;
  if (typeof result === 'number' && result >= 0) {
    nextPcValue = result & 0xFFFFFF;
    nextMode = resolveNextMode(meta, nextPcValue, state.mode);
  }

  const after = captureState(cpu, mem);
  const instructionDasm = (meta?.instructions ?? []).map((inst) => inst.dasm);
  const instructionTags = (meta?.instructions ?? []).map((inst) => inst.tag);
  const ldirLddrOps = (meta?.instructions ?? [])
    .filter((inst) => inst.tag === 'ldir' || inst.tag === 'lddr')
    .map((inst) => inst.dasm);

  return {
    step: stepNumber,
    pcValue: state.pc & 0xFFFFFF,
    pc: hex(state.pc),
    mode: state.mode,
    nextPcValue,
    nextPc: nextPcValue === null ? null : hex(nextPcValue),
    nextMode,
    termination,
    error,
    instructionDasm,
    instructionTags,
    ldirLddrOps,
    writes: stepWrites,
    writeCount: stepWrites.length,
    droppedWriteCount,
    before,
    after,
    afterView: serializeStateValues(after),
    deBefore: hex(before.deValue),
    deBeforeValue: before.deValue,
    deAfter: hex(after.deValue),
    deAfterValue: after.deValue,
  };
}

function sanitizeStep(step) {
  return {
    step: step.step,
    pc: step.pc,
    mode: step.mode,
    nextPc: step.nextPc,
    nextMode: step.nextMode,
    termination: step.termination,
    error: step.error,
    instructionDasm: step.instructionDasm,
    instructionTags: step.instructionTags,
    ldirLddrOps: step.ldirLddrOps,
    writeCount: step.writeCount,
    droppedWriteCount: step.droppedWriteCount,
    writes: step.writes,
    deBefore: step.deBefore,
    deAfter: step.deAfter,
    ...step.afterView,
  };
}

function sanitizeCallEvent(call) {
  return {
    callIndex: call.callIndex,
    tokenDe: call.tokenDe,
    tokenByte: call.tokenByte,
    tokenChar: call.tokenChar,
    callerStep: call.callerStep,
    callerPc: call.callerPc,
    entry: call.entry,
    return: call.return,
    completed: Boolean(call.return),
  };
}

function diffByteArrays(before, after, startAddr) {
  const limit = Math.min(before.length, after.length);
  const diff = [];
  for (let index = 0; index < limit; index += 1) {
    if ((before[index] & 0xFF) !== (after[index] & 0xFF)) {
      diff.push({
        addr: hex((startAddr + index) & 0xFFFFFF),
        before: hexByte(before[index]),
        after: hexByte(after[index]),
      });
    }
  }
  return diff;
}

function hasAnyNonZero(values) {
  return values.some((value) => (value & 0xFF) !== 0);
}

function findSequenceMatches(buffer, start, end, sequence, limit = 32) {
  const matches = [];
  if (!sequence || sequence.length === 0) return matches;
  const safeStart = Math.max(0, start >>> 0);
  const safeEnd = Math.max(safeStart, Math.min(buffer.length, end >>> 0));
  const maxStart = Math.max(safeStart, safeEnd - sequence.length);

  for (let addr = safeStart; addr <= maxStart; addr += 1) {
    let matched = true;
    for (let index = 0; index < sequence.length; index += 1) {
      if ((buffer[addr + index] & 0xFF) !== (sequence[index] & 0xFF)) {
        matched = false;
        break;
      }
    }
    if (matched) {
      matches.push({
        address: hex(addr),
        bytes: bytesToHex(buffer, addr, sequence.length),
      });
      if (matches.length >= limit) break;
    }
  }

  return matches;
}

function summarizeWrites(steps) {
  const editBufferWrites = [];
  const pointerWrites = [];
  const otherWatchWrites = [];
  const editBufferAddressSet = new Set();
  const pointerAddressSet = new Set();

  for (const step of steps) {
    for (const write of step.writes) {
      if (write.addrValue >= EDIT_BUF_START && write.addrValue < EDIT_BUF_END) {
        editBufferWrites.push({ step: step.step, ...write });
        editBufferAddressSet.add(write.addr);
      } else if (write.addrValue >= EDIT_TOP && write.addrValue <= (EDIT_BTM + 2)) {
        pointerWrites.push({ step: step.step, ...write });
        pointerAddressSet.add(write.addr);
      } else {
        otherWatchWrites.push({ step: step.step, ...write });
      }
    }
  }

  return {
    editBufferWriteCount: editBufferWrites.length,
    editBufferAddresses: [...editBufferAddressSet],
    editBufferWritesHead: editBufferWrites.slice(0, 64),
    pointerWriteCount: pointerWrites.length,
    pointerAddresses: [...pointerAddressSet],
    pointerWritesHead: pointerWrites.slice(0, 64),
    otherWatchWriteCount: otherWatchWrites.length,
    otherWatchWritesHead: otherWatchWrites.slice(0, 64),
  };
}

function finalDump(mem, inputLength = 0) {
  const cursorValue = read24(mem, EDIT_CURSOR);
  const backtrackStart = Math.max(0, cursorValue - Math.max(0, inputLength));
  return {
    editCursor: hex(cursorValue),
    editCursorValue: cursorValue,
    editBuffer32Hex: bytesToHex(mem, EDIT_BUF_START, 0x20),
    editBuffer32Ascii: asciiPreview(sliceBytes(mem, EDIT_BUF_START, 0x20)),
    memoryAtCursor16Hex: bytesToHex(mem, cursorValue, 0x10),
    memoryAtCursor16Ascii: asciiPreview(sliceBytes(mem, cursorValue, 0x10)),
    backtrackStart: hex(backtrackStart),
    memoryBacktrack16Hex: bytesToHex(mem, backtrackStart, 0x10),
    memoryBacktrack16Ascii: asciiPreview(sliceBytes(mem, backtrackStart, 0x10)),
  };
}

function traceLoopScenario(baselineMem, label, formatBytes) {
  const mem = new Uint8Array(baselineMem);
  const { executor, cpu } = createRuntime(mem);
  resetOsState(cpu, mem);
  seedFormatBuffer(mem, formatBytes);
  write24(mem, EDIT_CURSOR, EDIT_BUF_START);
  mem[IY_PLUS_5] = (mem[IY_PLUS_5] | 0x10) & 0xFF;
  cpu.hl = FORMAT_BUFFER;
  cpu.de = 0x000000;
  push24(cpu, mem, RETURN_SENTINEL);

  const initialState = {
    pc: DISPLAY_RESULT_LOOP_ENTRY,
    mode: 'adl',
  };

  const steps = [];
  const callEvents = [];
  let activeCall = null;
  let currentState = initialState;
  let loopExit = null;
  let termination = 'max_steps';

  for (let stepNumber = 1; stepNumber <= LOOP_STEP_LIMIT; stepNumber += 1) {
    const step = executeStep(executor, cpu, mem, currentState, stepNumber);
    steps.push(step);

    if (step.nextPcValue === BUF_INSERT) {
      activeCall = {
        callIndex: callEvents.length + 1,
        tokenDe: step.deAfter,
        tokenByte: hexByte(step.deAfterValue),
        tokenChar: printableChar(step.deAfterValue),
        callerStep: step.step,
        callerPc: step.pc,
        entry: null,
        return: null,
      };
    }

    if (step.pcValue === BUF_INSERT) {
      if (!activeCall) {
        activeCall = {
          callIndex: callEvents.length + 1,
          tokenDe: step.deBefore,
          tokenByte: hexByte(step.deBeforeValue),
          tokenChar: printableChar(step.deBeforeValue),
          callerStep: null,
          callerPc: null,
          entry: null,
          return: null,
        };
      }
      activeCall.entry = {
        step: step.step,
        pc: step.pc,
        nextPc: step.nextPc,
        editCursor: step.afterView.editCursor,
        editCursorValue: step.afterView.editCursorValue,
        deBefore: step.deBefore,
        deAfter: step.deAfter,
        editBuffer16Hex: step.afterView.editBuffer16Hex,
        cursorWindow16Hex: step.afterView.cursorWindow16Hex,
        writes: step.writes,
      };
    }

    if (activeCall && step.nextPcValue === RETURN_FROM_BUF_INSERT) {
      activeCall.return = {
        step: step.step,
        pc: step.pc,
        nextPc: step.nextPc,
        editCursor: step.afterView.editCursor,
        editCursorValue: step.afterView.editCursorValue,
        deBefore: step.deBefore,
        deAfter: step.deAfter,
        editBuffer16Hex: step.afterView.editBuffer16Hex,
        cursorWindow16Hex: step.afterView.cursorWindow16Hex,
        writes: step.writes,
      };
      callEvents.push(activeCall);
      activeCall = null;
    }

    if (step.pcValue === DISPLAY_RESULT_LOOP_ENTRY && step.nextPcValue === DISPLAY_RESULT_EXIT) {
      loopExit = {
        step: step.step,
        pc: step.pc,
        nextPc: step.nextPc,
        aAfter: step.afterView.a,
        flagsAfter: step.afterView.flags,
        editCursor: step.afterView.editCursor,
        editBuffer16Hex: step.afterView.editBuffer16Hex,
      };
      termination = 'loop_exit';
      currentState = {
        pc: step.nextPcValue,
        mode: step.nextMode,
      };
      break;
    }

    if (step.termination) {
      termination = step.termination;
      currentState = null;
      break;
    }

    currentState = {
      pc: step.nextPcValue,
      mode: step.nextMode,
    };
  }

  if (activeCall) {
    callEvents.push(activeCall);
  }

  const payloadBytes = formatBytes[formatBytes.length - 1] === 0x00
    ? Array.from(formatBytes.slice(0, -1))
    : Array.from(formatBytes);

  return {
    label,
    initialState: {
      entryPc: hex(DISPLAY_RESULT_LOOP_ENTRY),
      formatBufferHex: bytesToHex(mem, FORMAT_BUFFER, Math.max(6, formatBytes.length + 2)),
      editCursorSeededTo: hex(EDIT_BUF_START),
      iyPlus5: hexByte(mem[IY_PLUS_5]),
      stackTopReturnSentinel: hex(RETURN_SENTINEL),
    },
    termination,
    loopExit,
    nextState: currentState
      ? { pc: hex(currentState.pc), pcValue: currentState.pc, mode: currentState.mode }
      : null,
    steps: steps.map(sanitizeStep),
    bufInsertCallCount: callEvents.filter((call) => call.entry).length,
    bufInsertEvents: callEvents.map(sanitizeCallEvent),
    writeSummary: summarizeWrites(steps),
    final: finalDump(mem, payloadBytes.length),
    sequenceMatchesInWatchWindow: payloadBytes.length > 1
      ? findSequenceMatches(mem, WATCH_RAM_START, WATCH_RAM_END, payloadBytes)
      : [],
    rawMemory: mem,
    rawExecutor: executor,
    rawCpu: cpu,
    rawSteps: steps,
    rawNextState: currentState,
  };
}

function tracePostLoop(executor, cpu, mem, state, payloadBytes) {
  if (!state) {
    return {
      skipped: true,
      reason: 'Loop did not reach 0x080D14, so there is no post-loop trace to run.',
    };
  }

  const steps = [];
  const bufferChanges = [];
  const ldirLddrHits = [];
  let currentState = { pc: state.pcValue, mode: state.mode };
  let previousBuffer = sliceBytes(mem, EDIT_BUF_START, 0x10);
  let termination = 'max_steps';

  for (let stepNumber = 1; stepNumber <= POST_LOOP_STEP_LIMIT; stepNumber += 1) {
    const step = executeStep(executor, cpu, mem, currentState, stepNumber);
    const currentBuffer = sliceBytes(mem, EDIT_BUF_START, 0x10);
    const bufferChanged = hexBytes(previousBuffer) !== hexBytes(currentBuffer);
    const bufferDiff = bufferChanged ? diffByteArrays(previousBuffer, currentBuffer, EDIT_BUF_START) : [];
    previousBuffer = currentBuffer;

    const entry = {
      ...sanitizeStep(step),
      bufferChanged,
      bufferDiff,
    };

    steps.push(entry);

    if (bufferChanged) {
      bufferChanges.push(entry);
    }

    if (step.ldirLddrOps.length > 0) {
      ldirLddrHits.push(entry);
    }

    if (step.nextPcValue === RETURN_SENTINEL) {
      termination = 'returned_to_sentinel';
      currentState = null;
      break;
    }

    if (step.termination) {
      termination = step.termination;
      currentState = null;
      break;
    }

    currentState = {
      pc: step.nextPcValue,
      mode: step.nextMode,
    };
  }

  return {
    entryPc: hex(state.pcValue),
    expectedFlow: [hex(DISPLAY_RESULT_EXIT), hex(BUF_INSERT_POST), hex(DISPLAY_RESULT_RET), hex(RETURN_SENTINEL)],
    termination,
    stepCount: steps.length,
    steps,
    bufferChangeCount: bufferChanges.length,
    bufferChanges,
    ldirLddrHitCount: ldirLddrHits.length,
    ldirLddrHits,
    writeSummary: summarizeWrites(steps.map((step, index) => ({
      step: index + 1,
      writes: step.writes,
    }))),
    final: finalDump(mem, payloadBytes.length),
    sequenceMatchesInWatchWindow: payloadBytes.length > 1
      ? findSequenceMatches(mem, WATCH_RAM_START, WATCH_RAM_END, payloadBytes)
      : [],
  };
}

function inferRootCause(loopResult, postLoopResult) {
  const wroteEditBuffer = loopResult.writeSummary.editBufferWriteCount > 0
    || (postLoopResult?.writeSummary?.editBufferWriteCount ?? 0) > 0;
  const cursorProgression = loopResult.bufInsertEvents
    .map((event) => event.return?.editCursorValue ?? event.entry?.editCursorValue ?? null)
    .filter((value) => Number.isInteger(value));
  const cursorAdvanced = cursorProgression.some((value) => value !== EDIT_BUF_START);
  const beforeLoopMatchesStart = loopResult.sequenceMatchesInWatchWindow.some((match) => match.address === hex(EDIT_BUF_START));
  const afterLoopMatchesStart = postLoopResult?.sequenceMatchesInWatchWindow?.some((match) => match.address === hex(EDIT_BUF_START)) ?? beforeLoopMatchesStart;
  const postLoopChanged = (postLoopResult?.bufferChangeCount ?? 0) > 0;
  const postLoopUsedLdirLddr = (postLoopResult?.ldirLddrHitCount ?? 0) > 0;
  const finalLoopBufferNonZero = loopResult.final.editBuffer32Hex.split(' ').some((byte) => byte !== '00');
  const finalPostLoopBufferNonZero = postLoopResult
    ? postLoopResult.final.editBuffer32Hex.split(' ').some((byte) => byte !== '00')
    : finalLoopBufferNonZero;

  if (beforeLoopMatchesStart && postLoopChanged && !afterLoopMatchesStart) {
    return 'BufInsert does write the formatted bytes into 0xD00A00 during the loop, and the post-loop tail later overwrites or clears that region.';
  }

  if (wroteEditBuffer && postLoopChanged && !finalPostLoopBufferNonZero) {
    return `The loop touched ${hex(EDIT_BUF_START)}..${hex(EDIT_BUF_END - 1)}, but the post-loop tail changed the visible edit buffer afterward${postLoopUsedLdirLddr ? ' and includes LDIR/LDDR activity' : ''}.`;
  }

  if (!wroteEditBuffer && cursorAdvanced) {
    return 'The cursor advances across successive BufInsert returns, but the trace never records writes into 0xD00A00..0xD00AFF. Tokens are being routed somewhere other than the visible edit buffer start, not written-and-cleared there.';
  }

  if (wroteEditBuffer && !postLoopChanged && !finalLoopBufferNonZero) {
    return 'The loop writes through the edit-buffer region, but the content is already gone before the post-loop cleanup starts. The disappearance happens inside the BufInsert/loop path rather than in the 0x080D14 tail.';
  }

  if (beforeLoopMatchesStart && !postLoopChanged) {
    return 'The formatted bytes remain at 0xD00A00 after loop exit. In this replay, the empty-buffer symptom does not come from the 0x080D14 cleanup path.';
  }

  return 'The trace is inconclusive. Inspect the BufInsert return snapshots, cursor progression, and post-loop buffer diff entries to see whether bytes land outside 0xD00A00 or get cleared later.';
}

function summarizeSingleChar(loopResult) {
  const firstByte = loopResult.rawMemory[EDIT_BUF_START] & 0xFF;
  return {
    appearedAtEditStart: firstByte === 0x35,
    editStartByte: hexByte(firstByte),
    cursorAfterLoop: loopResult.final.editCursor,
    cursorAfterLoopValue: loopResult.final.editCursorValue,
  };
}

function main() {
  const baseline = createBaseline();

  const partA = traceLoopScenario(baseline.memory, '42.5', STRING_42_5);
  const partB = partA.rawNextState
    ? tracePostLoop(
        partA.rawExecutor,
        partA.rawCpu,
        partA.rawMemory,
        partA.rawNextState,
        Array.from(STRING_42_5.slice(0, -1)),
      )
    : {
        skipped: true,
        reason: 'Part A did not reach 0x080D14, so post-loop tracing was skipped.',
      };

  const partC = traceLoopScenario(baseline.memory, '5', STRING_5);

  const report = {
    probe: 'probe-phase216-bufinsert-cursor-tracking.mjs',
    generatedAt: new Date().toISOString(),
    notes: [
      'This probe reuses the repo-standard 0x000000 -> 0x08C331 -> 0x0802B2 -> 0x09DEE0 initialization sequence from the nearby phase 209/215 probes.',
      'The runtime in this repo exposes createExecutor + PRELIFTED_BLOCKS rather than createCPU/installTranspiledBlocks, so the probe uses the native exports directly.',
      'Only the task-requested loop seeds are forced before entry: format buffer, editCursor=0xD00A00, IY=0xD00080, and BIT 4 set at (IY+5).',
    ],
    bootBaseline: {
      boot: baseline.boot,
      memInit: baseline.memInit,
      pointersAfterMemInit: baseline.pointersAfterMemInit,
    },
    partA: {
      description: 'Track editCursor and edit-buffer state around each BufInsert call while replaying the 0x080CFE display-result loop with "42.5\\0".',
      initialState: partA.initialState,
      termination: partA.termination,
      loopExit: partA.loopExit,
      nextStateAfterLoopExit: partA.nextState,
      bufInsertCallCount: partA.bufInsertCallCount,
      bufInsertEvents: partA.bufInsertEvents,
      writeSummary: partA.writeSummary,
      steps: partA.steps,
      final: partA.final,
      sequenceMatchesInWatchWindow: partA.sequenceMatchesInWatchWindow,
    },
    partB: partB.skipped ? partB : {
      description: 'Continue from 0x080D14 for up to 200 more blocks and log every post-loop block plus any visible edit-buffer change.',
      ...partB,
    },
    partC: {
      description: 'Repeat Part A with a single-character format buffer "5\\0".',
      initialState: partC.initialState,
      termination: partC.termination,
      loopExit: partC.loopExit,
      bufInsertCallCount: partC.bufInsertCallCount,
      bufInsertEvents: partC.bufInsertEvents,
      writeSummary: partC.writeSummary,
      steps: partC.steps,
      final: partC.final,
      summary: summarizeSingleChar(partC),
    },
    summary: {
      partABufInsertCalls: partA.bufInsertCallCount,
      partACursorAfterEachReturn: partA.bufInsertEvents.map((event) => ({
        callIndex: event.callIndex,
        tokenDe: event.tokenDe,
        tokenChar: event.tokenChar,
        cursorAfterReturn: event.return?.editCursor ?? null,
      })),
      postLoopBufferChangeCount: partB.skipped ? 0 : partB.bufferChangeCount,
      postLoopLdirLddrHitCount: partB.skipped ? 0 : partB.ldirLddrHitCount,
      likelyRootCause: inferRootCause(partA, partB.skipped ? null : partB),
      singleCharacterResult: summarizeSingleChar(partC),
    },
  };

  delete partA.rawMemory;
  delete partA.rawExecutor;
  delete partA.rawCpu;
  delete partA.rawSteps;
  delete partA.rawNextState;
  delete partC.rawMemory;
  delete partC.rawExecutor;
  delete partC.rawCpu;
  delete partC.rawSteps;
  delete partC.rawNextState;

  console.log(JSON.stringify(report, null, 2));
}

try {
  main();
} catch (error) {
  console.log(JSON.stringify({
    probe: 'probe-phase216-bufinsert-cursor-tracking.mjs',
    error: {
      message: error?.message ?? String(error),
      stack: error?.stack ?? String(error),
    },
  }, null, 2));
  process.exitCode = 1;
}
