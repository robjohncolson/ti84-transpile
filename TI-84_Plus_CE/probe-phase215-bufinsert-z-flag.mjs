#!/usr/bin/env node

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const fs = require('node:fs');
const path = require('node:path');
const { fileURLToPath, pathToFileURL } = require('node:url');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const transpiledPath = path.join(__dirname, 'ROM.transpiled.js');
const transpiledGzipPath = `${transpiledPath}.gz`;
const romPath = path.join(__dirname, 'ROM.rom');

if (!fs.existsSync(transpiledPath)) {
  const hint = fs.existsSync(transpiledGzipPath)
    ? 'Gunzip ROM.transpiled.js.gz first so the probe can load ROM.transpiled.js.'
    : 'ROM.transpiled.js is missing.';
  throw new Error(hint);
}

if (!fs.existsSync(romPath)) {
  throw new Error('ROM.rom is missing.');
}

async function loadLocalModule(localPath) {
  try {
    return require(localPath);
  } catch {
    return import(pathToFileURL(path.join(__dirname, localPath)).href);
  }
}

const [{ createExecutor }, { createPeripheralBus }, transpiledModule] = await Promise.all([
  loadLocalModule('./cpu-runtime.js'),
  loadLocalModule('./peripherals.js'),
  loadLocalModule('./ROM.transpiled.js'),
]);

const PRELIFTED_BLOCKS = transpiledModule.PRELIFTED_BLOCKS ?? transpiledModule.default ?? transpiledModule;
const BLOCKS = normalizeBlocks(PRELIFTED_BLOCKS);
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

const REQUESTED_KERNEL_INIT_ENTRY = 0x000230;
const REQUESTED_MEM_INIT_ENTRY = 0x08479C;

const BUF_INSERT = 0x05E2A0;
const DISPLAY_RESULT_LOOP_ENTRY = 0x080CFE;
const DISPLAY_RESULT_CALL_STUB = 0x080D08;
const RETURN_FROM_BUF_INSERT = 0x080D0D;
const DISPLAY_RESULT_EXIT = 0x080D14;

const FORMAT_BUFFER = 0xD0060E;
const EDIT_BUF_START = 0xD00A00;
const EDIT_BUF_END = 0xD00B00;
const EDIT_TOP = 0xD02437;
const EDIT_CURSOR = 0xD0243A;
const EDIT_TAIL = 0xD0243D;
const EDIT_BTM = 0xD02440;

const IY_ADDR = 0xD00080;
const IY_PLUS_5 = 0xD00085;
const BIT_4_MASK = 0x10;

const STACK_TOP = 0xD1A87E;
const IX_ADDR = 0xD1A860;
const MBASE = 0xD0;
const RETURN_SENTINEL = 0x7FFFFE;

const DIRECT_TOKEN = 0x35;
const DIRECT_DE = 0x000035;
const DIRECT_TRACE_STEPS = 50;
const LOOP_TRACE_STEPS = 200;
const MAX_LOOP_ITERATIONS = 8192;

const DIRECT_STRING = Uint8Array.from([0x34, 0x32, 0x2E, 0x35, 0x00]); // "42.5\0"

const EXPERIMENTS = [
  {
    id: 'baseline',
    label: 'Baseline',
    description: 'Just call BufInsert with DE=0x000035, no pointer setup.',
    apply() {},
  },
  {
    id: 'cursorSeeded',
    label: 'Cursor seeded',
    description: 'Set 0xD0243A = 0xD00A00 before BufInsert.',
    apply(_cpu, mem) {
      write24(mem, EDIT_CURSOR, EDIT_BUF_START);
    },
  },
  {
    id: 'bothPointers',
    label: 'Both pointers',
    description: 'Set 0xD0243A = 0xD00A00 and 0xD0243D = 0xD00A00 before BufInsert.',
    apply(_cpu, mem) {
      write24(mem, EDIT_CURSOR, EDIT_BUF_START);
      write24(mem, EDIT_TAIL, EDIT_BUF_START);
    },
  },
  {
    id: 'fullEditContext',
    label: 'Full edit context',
    description: 'Seed both pointers, clear 0xD00A00-0xD00A10, and set BIT 4 at (IY+5).',
    apply(_cpu, mem) {
      write24(mem, EDIT_CURSOR, EDIT_BUF_START);
      write24(mem, EDIT_TAIL, EDIT_BUF_START);
      mem.fill(0x00, EDIT_BUF_START, EDIT_BUF_START + 0x11);
      mem[IY_PLUS_5] = (mem[IY_PLUS_5] | BIT_4_MASK) & 0xFF;
    },
  },
];

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

function hex(value, width = 6) {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function bytesToHex(buffer, start, length) {
  const safeStart = Math.max(0, start);
  const safeEnd = Math.min(buffer.length, safeStart + Math.max(0, length));
  return Array.from(buffer.slice(safeStart, safeEnd), (value) =>
    (value & 0xFF).toString(16).toUpperCase().padStart(2, '0'),
  ).join(' ');
}

function asciiPreview(buffer, start, length) {
  let out = '';
  for (let index = 0; index < length; index += 1) {
    const value = buffer[start + index] & 0xFF;
    if (value === 0x00) break;
    out += value >= 0x20 && value <= 0x7E ? String.fromCharCode(value) : '.';
  }
  return out;
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

function zState(f) {
  return (f & FLAG_Z) !== 0 ? 'Z' : 'NZ';
}

function pointerState(mem) {
  return {
    top: hex(read24(mem, EDIT_TOP)),
    cursor: hex(read24(mem, EDIT_CURSOR)),
    tail: hex(read24(mem, EDIT_TAIL)),
    bottom: hex(read24(mem, EDIT_BTM)),
    iyPlus5: hexByte(mem[IY_PLUS_5]),
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
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEM_INIT_RET);
  let returned = false;
  let result = null;

  try {
    result = executor.runFrom(MEM_INIT_ENTRY, 'adl', {
      maxSteps: 100000,
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
  };
}

function installWriteTracer(cpu, writes) {
  const originals = {
    write8: cpu.write8,
    write16: cpu.write16,
    write24: cpu.write24,
  };

  function record(kind, addr, size, value) {
    const normalizedAddr = addr & 0xFFFFFF;
    const maskedValue = size === 1 ? (value & 0xFF) : size === 2 ? (value & 0xFFFF) : (value & 0xFFFFFF);
    writes.push({
      step: writes.length + 1,
      pc: hex(cpu._currentBlockPc ?? 0),
      kind,
      addr: hex(normalizedAddr),
      addrValue: normalizedAddr,
      size,
      value: size === 1 ? hexByte(maskedValue) : hex(maskedValue, size * 2),
      bytes: bytesForWrite(maskedValue, size),
      droppedRomWrite: normalizedAddr < 0x400000,
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

function bytesForWrite(value, size) {
  const bytes = [];
  for (let index = 0; index < size; index += 1) {
    bytes.push(((value >>> (8 * index)) & 0xFF).toString(16).toUpperCase().padStart(2, '0'));
  }
  return bytes.join(' ');
}

function makeStop(name, detail = null) {
  const error = new Error('__PHASE215_STOP__');
  error.stopName = name;
  error.detail = detail;
  return error;
}

function captureTraceState(step, pc, mode, cpu, mem, missing = false) {
  return {
    step,
    pc: hex(pc),
    mode,
    missing,
    a: hexByte(cpu.a),
    f: hexByte(cpu.f),
    flags: flagsObject(cpu.f),
    hl: hex(cpu.hl),
    de: hex(cpu.de),
    bc: hex(cpu.bc),
    sp: hex(cpu.sp),
    cursor: hex(read24(mem, EDIT_CURSOR)),
    tail: hex(read24(mem, EDIT_TAIL)),
    iyPlus5: hexByte(mem[IY_PLUS_5]),
    editBuffer16Hex: bytesToHex(mem, EDIT_BUF_START, 0x10),
    editBuffer16Ascii: asciiPreview(mem, EDIT_BUF_START, 0x10),
  };
}

function previewBlockSource(addr, mode = 'adl') {
  const block = BLOCKS[blockKey(addr, mode)];
  if (!block?.source) return null;
  return String(block.source).split('\n').slice(0, 8).join('\n');
}

function runInstrumented(executor, cpu, mem, entry, maxSteps, stopAddresses) {
  const blockTrace = [];
  const missingBlocks = [];
  const writes = [];
  const restoreWrites = installWriteTracer(cpu, writes);
  const stopSet = new Set(stopAddresses.map((addr) => addr & 0xFFFFFF));
  let termination = 'max_steps';
  let stopDetail = null;
  let result = null;
  let lastStep = 0;

  try {
    result = executor.runFrom(entry, 'adl', {
      maxSteps,
      maxLoopIterations: MAX_LOOP_ITERATIONS,
      onBlock(pc, mode, _meta, step) {
        const addr = pc & 0xFFFFFF;
        const normalizedStep = (step ?? blockTrace.length) + 1;
        lastStep = Math.max(lastStep, normalizedStep);
        blockTrace.push(captureTraceState(normalizedStep, addr, mode, cpu, mem, false));
        if (stopSet.has(addr)) {
          throw makeStop('sentinel', hex(addr));
        }
      },
      onMissingBlock(pc, mode, step) {
        const addr = pc & 0xFFFFFF;
        const normalizedStep = (step ?? blockTrace.length) + 1;
        lastStep = Math.max(lastStep, normalizedStep);
        const snapshot = captureTraceState(normalizedStep, addr, mode, cpu, mem, true);
        blockTrace.push(snapshot);
        missingBlocks.push(snapshot);
        if (stopSet.has(addr)) {
          throw makeStop('sentinel', hex(addr));
        }
        throw makeStop('missing_block', hex(addr));
      },
    });

    termination = result?.termination ?? termination;
  } catch (error) {
    if (error?.message === '__PHASE215_STOP__') {
      termination = error.stopName;
      stopDetail = error.detail ?? null;
    } else {
      restoreWrites();
      throw error;
    }
  }

  restoreWrites();

  return {
    blockTrace,
    missingBlocks,
    writes,
    termination,
    stopDetail,
    stepsTaken: Math.max(lastStep, result?.steps ?? 0, blockTrace.length),
  };
}

function relevantWriteSummary(writes) {
  return writes.filter((write) =>
    (write.addrValue >= EDIT_BUF_START && write.addrValue < EDIT_BUF_END) ||
    (write.addrValue >= EDIT_TOP && write.addrValue <= (EDIT_BTM + 2)) ||
    write.addrValue === IY_PLUS_5
  );
}

function buildExperimentObservation(summary, writes) {
  const bufferWrites = writes.filter((write) => write.addrValue >= EDIT_BUF_START && write.addrValue < EDIT_BUF_END);
  const pointerWrites = writes.filter((write) => write.addrValue >= EDIT_TOP && write.addrValue <= (EDIT_BTM + 2));

  if (summary.flags.z && bufferWrites.length === 0 && pointerWrites.length === 0) {
    return 'BufInsert returned Z without updating the edit buffer or any tracked edit pointers.';
  }

  if (summary.flags.z && pointerWrites.length > 0 && bufferWrites.length === 0) {
    return 'BufInsert returned Z after touching pointer state but before storing the token into the edit buffer.';
  }

  if (summary.flags.nz && bufferWrites.length > 0) {
    return 'BufInsert returned NZ after writing into the edit buffer.';
  }

  return 'Inspect the block trace and write log for the exact failure point.';
}

function runBufInsertExperiment(baselineMem, experiment) {
  const mem = new Uint8Array(baselineMem);
  const { executor, cpu } = createRuntime(mem);

  resetOsState(cpu, mem);
  cpu.hl = EDIT_BUF_START;
  cpu.de = DIRECT_DE;

  const osBaselinePointers = pointerState(mem);
  experiment.apply(cpu, mem);
  const postSetupPointers = pointerState(mem);

  push24(cpu, mem, RETURN_SENTINEL);

  const traceResult = runInstrumented(executor, cpu, mem, BUF_INSERT, DIRECT_TRACE_STEPS, [RETURN_SENTINEL]);
  const finalPointers = pointerState(mem);
  const summary = {
    returnedToSentinel: traceResult.termination === 'sentinel',
    termination: traceResult.termination,
    stopDetail: traceResult.stopDetail,
    stepsTaken: traceResult.stepsTaken,
    flagAfterReturn: zState(cpu.f),
    flags: flagsObject(cpu.f),
    editBufferHex: bytesToHex(mem, EDIT_BUF_START, 0x10),
    editBufferAscii: asciiPreview(mem, EDIT_BUF_START, 0x10),
    tokenWrittenAtStart: (mem[EDIT_BUF_START] & 0xFF) === DIRECT_TOKEN,
    cursorBefore: postSetupPointers.cursor,
    cursorAfter: finalPointers.cursor,
    tailBefore: postSetupPointers.tail,
    tailAfter: finalPointers.tail,
    blocksVisited: traceResult.blockTrace.map((row) => row.pc),
    uniqueBlocksVisited: [...new Set(traceResult.blockTrace.map((row) => row.pc))],
    writeCount: traceResult.writes.length,
  };

  return {
    id: experiment.id,
    label: experiment.label,
    description: experiment.description,
    osBaselinePointers,
    postSetupPointers,
    finalPointers,
    trace: traceResult.blockTrace,
    writes: traceResult.writes,
    relevantWrites: relevantWriteSummary(traceResult.writes),
    blockSourcePreviews: summary.uniqueBlocksVisited.map((pcHex) => {
      const addr = Number.parseInt(pcHex.slice(2), 16);
      return {
        pc: pcHex,
        sourcePreview: previewBlockSource(addr),
      };
    }),
    summary: {
      ...summary,
      observation: buildExperimentObservation(summary, traceResult.writes),
    },
  };
}

function seedFormatBuffer(mem, bytes) {
  mem.fill(0x00, FORMAT_BUFFER, FORMAT_BUFFER + 0x20);
  mem.set(bytes, FORMAT_BUFFER);
}

function runDisplayResultLoop(baselineMem, winningExperiment) {
  const mem = new Uint8Array(baselineMem);
  const { executor, cpu } = createRuntime(mem);

  resetOsState(cpu, mem);
  winningExperiment.apply(cpu, mem);
  seedFormatBuffer(mem, DIRECT_STRING);
  cpu.hl = FORMAT_BUFFER;
  cpu.de = 0x000000;

  push24(cpu, mem, RETURN_SENTINEL);

  const traceResult = runInstrumented(executor, cpu, mem, DISPLAY_RESULT_LOOP_ENTRY, LOOP_TRACE_STEPS, [RETURN_SENTINEL]);
  const bufInsertCalls = traceResult.blockTrace
    .filter((row) => row.pc === hex(BUF_INSERT))
    .map((row) => ({
      step: row.step,
      de: row.de,
      token: hexByte(Number.parseInt(row.de.slice(-2), 16)),
      char: printableChar(Number.parseInt(row.de.slice(-2), 16)),
      hl: row.hl,
      flags: row.flags,
    }));

  const returnStates = traceResult.blockTrace
    .filter((row) => row.pc === hex(RETURN_FROM_BUF_INSERT))
    .map((row) => ({
      step: row.step,
      flags: row.flags,
      flagAfterReturn: row.flags.z ? 'Z' : 'NZ',
      hl: row.hl,
      de: row.de,
      editBuffer16Hex: row.editBuffer16Hex,
      editBuffer16Ascii: row.editBuffer16Ascii,
      cursor: row.cursor,
    }));

  return {
    successfulSetupId: winningExperiment.id,
    successfulSetupLabel: winningExperiment.label,
    trace: traceResult.blockTrace,
    writes: traceResult.writes,
    relevantWrites: relevantWriteSummary(traceResult.writes),
    summary: {
      termination: traceResult.termination,
      stopDetail: traceResult.stopDetail,
      stepsTaken: traceResult.stepsTaken,
      loopHeadVisits: traceResult.blockTrace.filter((row) => row.pc === hex(DISPLAY_RESULT_LOOP_ENTRY)).length,
      callStubVisits: traceResult.blockTrace.filter((row) => row.pc === hex(DISPLAY_RESULT_CALL_STUB)).length,
      bufInsertCallCount: bufInsertCalls.length,
      bufInsertCalls,
      returnStates,
      loopIterated: bufInsertCalls.length > 1 || returnStates.some((row) => row.flagAfterReturn === 'NZ'),
      exitedAtNullTerminator: traceResult.blockTrace.some((row) => row.pc === hex(DISPLAY_RESULT_EXIT)),
      finalFlags: flagsObject(cpu.f),
      finalPointers: pointerState(mem),
      editBufferHex: bytesToHex(mem, EDIT_BUF_START, 0x20),
      editBufferAscii: asciiPreview(mem, EDIT_BUF_START, 0x20),
      formatBufferHex: bytesToHex(mem, FORMAT_BUFFER, DIRECT_STRING.length + 3),
      formatBufferAscii: asciiPreview(mem, FORMAT_BUFFER, DIRECT_STRING.length + 3),
    },
  };
}

function printableChar(value) {
  const byte = value & 0xFF;
  return byte >= 0x20 && byte <= 0x7E ? String.fromCharCode(byte) : null;
}

function inferRequiredInitialization(experiments, partC) {
  const successful = experiments.filter((experiment) =>
    experiment.summary.returnedToSentinel && experiment.summary.flags.nz,
  );

  if (successful.length === 0) {
    return {
      successfulExperimentIds: [],
      minimalSuccessfulExperimentId: null,
      conclusion: 'No tested pointer initialization returned NZ. BufInsert likely depends on additional editor state beyond 0xD0243A, 0xD0243D, and BIT 4 at (IY+5).',
    };
  }

  const winner = successful[0];
  let conclusion = '';

  if (winner.id === 'baseline') {
    conclusion = `BufInsert already succeeds on the post-memInit baseline. Observed baseline pointers: cursor=${winner.postSetupPointers.cursor}, tail=${winner.postSetupPointers.tail}.`;
  } else if (winner.id === 'cursorSeeded') {
    conclusion = 'BufInsert needs editCursor (0xD0243A) initialized to 0xD00A00 to return NZ in the direct-call probe.';
  } else if (winner.id === 'bothPointers') {
    conclusion = 'BufInsert needs both editCursor (0xD0243A) and editTail (0xD0243D) initialized to 0xD00A00 to return NZ in the direct-call probe.';
  } else {
    conclusion = 'BufInsert only returned NZ after seeding both pointers, clearing 0xD00A00-0xD00A10, and setting BIT 4 at (IY+5).';
  }

  if (partC?.summary) {
    if (partC.summary.bufInsertCallCount >= 4 && partC.summary.editBufferAscii.startsWith('42.5')) {
      conclusion += ` With that setup, the 0x080CFE display-result loop iterated ${partC.summary.bufInsertCallCount} times and built "${partC.summary.editBufferAscii}" in the edit buffer.`;
    } else {
      conclusion += ` The 0x080CFE loop replay used the ${winner.label} setup and produced ${partC.summary.bufInsertCallCount} BufInsert call(s) with edit buffer "${partC.summary.editBufferAscii}".`;
    }
  }

  return {
    successfulExperimentIds: successful.map((experiment) => experiment.id),
    minimalSuccessfulExperimentId: winner.id,
    conclusion,
  };
}

function main() {
  const baseline = createBaseline();
  const experiments = EXPERIMENTS.map((experiment) => runBufInsertExperiment(baseline.memory, experiment));
  const winningExperiment = experiments.find((experiment) =>
    experiment.summary.returnedToSentinel && experiment.summary.flags.nz,
  );
  const partC = winningExperiment
    ? runDisplayResultLoop(
        baseline.memory,
        EXPERIMENTS.find((experiment) => experiment.id === winningExperiment.id),
      )
    : {
        skipped: true,
        reason: 'No Part B experiment returned NZ, so the full 0x080CFE loop replay was not attempted.',
      };

  const partA = experiments[0];
  const summary = inferRequiredInitialization(experiments, partC.skipped ? null : partC);

  const report = {
    probe: 'probe-phase215-bufinsert-z-flag.mjs',
    generatedAt: new Date().toISOString(),
    notes: [
      'This probe follows the phase 211/213/214 runtime baseline used in this repo: 0x000000 -> 0x08C331 -> 0x0802B2 -> 0x09DEE0.',
      `The task text mentioned kernelInit=${hex(REQUESTED_KERNEL_INIT_ENTRY)} and memInit=${hex(REQUESTED_MEM_INIT_ENTRY)}, but those addresses are not used as probe init entries in the referenced project files.`,
      'Per subagent constraints, this file was added without modifying cpu-runtime.js, peripherals.js, or the transpiler.',
    ],
    bootBaseline: {
      recipe: `${hex(BOOT_ENTRY)} -> ${hex(KERNEL_INIT_ENTRY)} -> ${hex(POST_INIT_ENTRY)} -> ${hex(MEM_INIT_ENTRY)}`,
      boot: baseline.boot,
      memInit: baseline.memInit,
      pointersAfterMemInit: pointerState(baseline.memory),
    },
    partA: {
      description: 'Direct BufInsert trace with the raw post-memInit baseline, DE=0x000035, HL=0xD00A00, and IY=0xD00080.',
      initialPointers: partA.postSetupPointers,
      blocksVisited: partA.summary.blocksVisited,
      blockTraceCount: partA.trace.length,
      blockTraceHead: partA.trace.slice(0, 200),
      blockTraceTail: partA.trace.slice(-50),
      writeCount: partA.writes.length,
      writesHead: partA.writes.slice(0, 200),
      relevantWriteCount: partA.relevantWrites.length,
      relevantWritesHead: partA.relevantWrites.slice(0, 200),
      blockSourcePreviewCount: partA.blockSourcePreviews.length,
      blockSourcePreviews: partA.blockSourcePreviews.slice(0, 30),
      flagAfterReturn: partA.summary.flagAfterReturn,
      flags: partA.summary.flags,
      returnedToSentinel: partA.summary.returnedToSentinel,
      stepsTaken: partA.summary.stepsTaken,
      editBufferHex: partA.summary.editBufferHex,
      editBufferAscii: partA.summary.editBufferAscii,
      tokenWrittenAtStart: partA.summary.tokenWrittenAtStart,
      observation: partA.summary.observation,
    },
    partB: {
      experiments: experiments.map((experiment) => ({
        id: experiment.id,
        label: experiment.label,
        description: experiment.description,
        osBaselinePointers: experiment.osBaselinePointers,
        postSetupPointers: experiment.postSetupPointers,
        finalPointers: experiment.finalPointers,
        flagAfterReturn: experiment.summary.flagAfterReturn,
        flags: experiment.summary.flags,
        returnedToSentinel: experiment.summary.returnedToSentinel,
        editBufferHex: experiment.summary.editBufferHex,
        editBufferAscii: experiment.summary.editBufferAscii,
        stepsTaken: experiment.summary.stepsTaken,
        blocksVisited: experiment.summary.blocksVisited,
        uniqueBlocksVisited: experiment.summary.uniqueBlocksVisited,
        writeCount: experiment.summary.writeCount,
        tokenWrittenAtStart: experiment.summary.tokenWrittenAtStart,
        observation: experiment.summary.observation,
        traceCount: experiment.trace.length,
        traceHead: experiment.trace.slice(0, 200),
        traceTail: experiment.trace.slice(-50),
        relevantWriteCount: experiment.relevantWrites.length,
        relevantWritesHead: experiment.relevantWrites.slice(0, 200),
      })),
    },
    partC: partC.skipped ? partC : {
      ...partC,
      traceCount: partC.trace.length,
      trace: undefined,
      writeCount: partC.writes.length,
      writes: undefined,
      relevantWriteCount: partC.relevantWrites.length,
      relevantWrites: undefined,
      traceHead: partC.trace.slice(0, 200),
      traceTail: partC.trace.slice(-50),
      relevantWritesHead: partC.relevantWrites.slice(0, 200),
    },
    summary,
  };

  console.log(JSON.stringify(report, null, 2));
}

try {
  main();
} catch (error) {
  console.log(JSON.stringify({
    probe: 'probe-phase215-bufinsert-z-flag.mjs',
    error: {
      message: error?.message ?? String(error),
      stack: error?.stack ?? String(error),
    },
  }, null, 2));
  process.exitCode = 1;
}
