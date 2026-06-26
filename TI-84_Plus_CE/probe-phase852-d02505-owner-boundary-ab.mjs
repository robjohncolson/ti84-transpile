import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase852-d02505-owner-boundary-ab.md');
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const CAPTURE_PATH = path.join(__dirname, 'captures', 'realram-home-digit3-D00000-D657FF.bin');
const AFTER_CLEAR_PATH = path.join(__dirname, 'captures', 'realram-home-afterCLEAR-D00000-D657FF.bin');

const romBytes = fs.readFileSync(ROM_PATH);
const preClearRam = fs.readFileSync(CAPTURE_PATH);
const afterClearRam = fs.readFileSync(AFTER_CLEAR_PATH);
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const MEM_SIZE = 0x1000000;
const RAM_BASE = 0xD00000;
const STACK_TOP = 0xD1A87E;
const WARM_IDLE = 0x0019BE;
const OUTER_LOOP = 0x08C331;
const HALT_IDLE = 0x0019B5;
const LAUNCH_HOME = 0x09DD62;
const HOME_REPAINT = 0x058241;
const CLEAR_SCAN = 0x0F;

const SOURCE_FIELDS = Object.freeze([
  ['D0211A', 0xD0211A, 3],
  ['D0211D', 0xD0211D, 3],
  ['D02270', 0xD02270, 3],
  ['D0227D', 0xD0227D, 3],
]);

const WATCHED_FIELDS = Object.freeze([
  ['D007CA', 0xD007CA, 3],
  ['D008E0', 0xD008E0, 3],
  ['D0243A', 0xD0243A, 3],
  ['D0243D', 0xD0243D, 3],
  ['D02590', 0xD02590, 3],
  ['D0259D', 0xD0259D, 3],
  ['D02A29', 0xD02A29, 2],
  ['D00080', 0xD00080, 1],
  ['D0009F', 0xD0009F, 1],
  ['D00587', 0xD00587, 1],
  ['D0058C', 0xD0058C, 1],
  ['D0058E', 0xD0058E, 1],
]);

const BOOT_SNAPSHOT_FIELDS = Object.freeze([
  ['D007CA', 0xD007CA, 3],
  ['D008E0', 0xD008E0, 3],
  ['D02587', 0xD02587, 3],
  ['D0258A', 0xD0258A, 3],
  ['D0258D', 0xD0258D, 3],
  ['D02590', 0xD02590, 3],
  ['D02593', 0xD02593, 3],
  ['D0259A', 0xD0259A, 3],
  ['D0259D', 0xD0259D, 3],
  ['D025A0', 0xD025A0, 3],
  ['D025C5', 0xD025C5, 3],
]);

const WATCH_BLOCKS = Object.freeze(new Set([
  0x0A31FD,
  0x0A3205,
  0x0A2D4C,
  0x0A3216,
  0x0A3146,
  0x0A314D,
  0x0A31F6,
  0x0A3158,
  0x0A31A6,
  0x0A31AC,
  0x0A31B8,
  0x0A31E2,
  0x0A31DE,
  0x0A31A2,
]));

const CASES = Object.freeze([
  {
    id: 'baseline',
    label: 'Baseline lifted input',
    patch: null,
    expectedDestructiveCount: 0x24E0,
  },
  {
    id: 'd02505_0a_at_0a31fd',
    label: 'Patch D02505=0x0A at 0x0A31FD',
    patch: { pc: 0x0A31FD, addr: 0xD02505, value: 0x0A },
    expectedDestructiveCount: 0x1C20,
  },
]);

class EarlyStop extends Error {
  constructor(reason) {
    super(reason);
    this.reason = reason;
  }
}

function hex(value, width = 6) {
  return `0x${((value ?? 0) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function readValue(mem, addr, len) {
  let value = 0;
  for (let i = 0; i < len; i += 1) value |= (mem[(addr + i) & 0xFFFFFF] ?? 0) << (8 * i);
  return value >>> 0;
}

function writeValue(mem, addr, len, value) {
  for (let i = 0; i < len; i += 1) mem[(addr + i) & 0xFFFFFF] = (value >>> (8 * i)) & 0xFF;
}

function write24(mem, addr, value) {
  writeValue(mem, addr, 3, value);
}

function readCaptureValue(capture, addr, len) {
  const offset = addr - RAM_BASE;
  if (offset < 0 || offset + len > capture.length) return null;
  let value = 0;
  for (let i = 0; i < len; i += 1) value |= (capture[offset + i] ?? 0) << (8 * i);
  return value >>> 0;
}

function fillSentinel(mem, start, bytes) {
  mem.fill(0xFF, start, start + bytes);
}

function readFieldList(mem, fields) {
  return Object.fromEntries(fields.map(([name, addr, len]) => [name, readValue(mem, addr, len)]));
}

function readFields(mem) {
  return readFieldList(mem, WATCHED_FIELDS);
}

function captureSnapshot(mem, fields) {
  return fields.map(([name, addr, len]) => ({
    name,
    addr,
    len,
    value: readValue(mem, addr, len),
    bytes: Array.from(mem.slice(addr, addr + len)),
  }));
}

function restoreSnapshot(mem, snapshot) {
  for (const field of snapshot) {
    for (let i = 0; i < field.len; i += 1) mem[field.addr + i] = field.bytes[i] ?? 0;
  }
}

function formatBySpec(values, spec) {
  return Object.fromEntries(spec.map(([name, , len]) => [name, hex(values[name], len * 2)]));
}

function formatFields(values) {
  return formatBySpec(values, WATCHED_FIELDS);
}

function formatSourceValues(values) {
  return formatBySpec(values, SOURCE_FIELDS);
}

function ixFrame(mem, cpu) {
  const ix = cpu.ix & 0xFFFFFF;
  return Object.fromEntries([-6, -3, 0, 3, 6, 9].map((offset) => {
    const addr = (ix + offset) & 0xFFFFFF;
    return [`IX${offset >= 0 ? '+' : ''}${offset}`, readValue(mem, addr, 3)];
  }));
}

function stack24(mem, cpu, count = 12) {
  const rows = [];
  for (let i = 0; i < count; i += 1) {
    const offset = i * 3;
    const addr = (cpu.sp + offset) & 0xFFFFFF;
    rows.push({ offset, addr, value: readValue(mem, addr, 3) });
  }
  return rows;
}

function compactCpu(cpu, mem) {
  return {
    pc: cpu.pc & 0xFFFFFF,
    currentBlockPc: cpu._currentBlockPc & 0xFFFFFF,
    sp: cpu.sp & 0xFFFFFF,
    ix: cpu.ix & 0xFFFFFF,
    iy: cpu.iy & 0xFFFFFF,
    af: cpu.af & 0xFFFF,
    bc: cpu.bc & 0xFFFFFF,
    de: cpu.de & 0xFFFFFF,
    hl: cpu.hl & 0xFFFFFF,
    flags: {
      z: (cpu.f & 0x40) !== 0,
      c: (cpu.f & 0x01) !== 0,
      pv: (cpu.f & 0x04) !== 0,
    },
    fields: readFields(mem),
    sourceFields: readFieldList(mem, SOURCE_FIELDS),
    ixFrame: ixFrame(mem, cpu),
  };
}

function formatCpuSnapshot(snapshot) {
  return {
    ...snapshot,
    pc: hex(snapshot.pc),
    currentBlockPc: hex(snapshot.currentBlockPc),
    sp: hex(snapshot.sp),
    ix: hex(snapshot.ix),
    iy: hex(snapshot.iy),
    af: hex(snapshot.af, 4),
    bc: hex(snapshot.bc),
    de: hex(snapshot.de),
    hl: hex(snapshot.hl),
    fields: formatFields(snapshot.fields),
    sourceFields: formatSourceValues(snapshot.sourceFields),
    ixFrame: Object.fromEntries(Object.entries(snapshot.ixFrame).map(([name, value]) => [name, hex(value)])),
  };
}

function makeFreshMachine() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, MEM_SIZE));
  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals, trackMemoryMapped: true });
  return { mem, peripherals, executor, cpu: executor.cpu };
}

function prepareEventFrame(mem, peripherals, cpu) {
  peripherals.setTimerEnabled(true);
  cpu.halted = false;
  cpu.iff1 = 1;
  cpu.iff2 = 1;
  cpu.f = 0x40;
  cpu.madl = 1;
  cpu.mbase = 0xD0;
  cpu._ix = 0xD1A860;
  cpu._iy = 0xD00080;
  cpu.sp = STACK_TOP - 24;
  fillSentinel(mem, cpu.sp, 24);
  cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
  write24(mem, cpu.sp, HALT_IDLE);
  write24(mem, 0xD008E0, cpu.sp);
}

function seedClear(mem, peripherals) {
  mem[0xD00587] = CLEAR_SCAN;
  mem[0xD0058C] = CLEAR_SCAN;
  mem[0xD0058D] = CLEAR_SCAN;
  mem[0xD0058E] = CLEAR_SCAN;
  mem[0xD00080] = (mem[0xD00080] | 0x08) & 0xFF;
  mem[0xD0009F] = (mem[0xD0009F] | 0x20) & 0xFF;
  peripherals.setKeyPressed(mem, CLEAR_SCAN);
}

function rearmCxMain(mem) {
  for (let i = 0; i < 21; i += 1) mem[0xD007CA + i] = romBytes[0x0585D3 + i];
  mem[0xD0008D] = romBytes[0x0585D3 + 21];
}

function formatRunResult(result) {
  return {
    steps: result.steps,
    termination: result.termination,
    lastPc: result.lastPc ?? 0,
    lastMode: result.lastMode,
  };
}

function runBootToPhase5Ready() {
  const machine = makeFreshMachine();
  const { mem, peripherals, executor, cpu } = machine;
  const phases = [];

  phases.push({ name: 'p1-coldboot', result: executor.runFrom(0x000000, 'z80', { maxSteps: 20000, maxLoopIterations: 32 }) });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  fillSentinel(mem, cpu.sp, 3);
  phases.push({ name: 'p2-kernel', result: executor.runFrom(OUTER_LOOP, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 }) });

  cpu.madl = 1;
  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  fillSentinel(mem, cpu.sp, 3);
  phases.push({ name: 'p3-postinit', result: executor.runFrom(0x0802B2, 'adl', { maxSteps: 100, maxLoopIterations: 32 }) });

  cpu.halted = false;
  cpu.iff1 = 1;
  cpu.iff2 = 1;
  cpu._iy = 0xD00080;
  cpu.mbase = 0xD0;
  cpu.sp = STACK_TOP - 12;
  fillSentinel(mem, cpu.sp, 12);
  phases.push({ name: 'p4-warm-idle', result: executor.runFrom(WARM_IDLE, 'adl', { maxSteps: 1500000, maxLoopIterations: 100000 }) });

  peripherals.setTimerEnabled(false);
  cpu.halted = false;
  cpu.iff1 = 1;
  cpu.iff2 = 1;
  cpu._iy = 0xD00080;
  cpu.mbase = 0xD0;
  const launchSp = STACK_TOP - 24;
  cpu.sp = launchSp;
  fillSentinel(mem, cpu.sp, 24);
  write24(mem, launchSp, WARM_IDLE);
  write24(mem, 0xD008E0, launchSp);

  return { ...machine, phases };
}

function runPhase5WithSnapshot() {
  const machine = runBootToPhase5Ready();
  const { mem, executor } = machine;
  const targetCounts = { launchHome09dd62: 0, memInit09dee0: 0, clear001879: 0, cleanup0018f8: 0, halt0019b5: 0 };
  let block = 0;
  let snapshot = null;

  const result = executor.runFrom(LAUNCH_HOME, 'adl', {
    maxSteps: 300000,
    maxLoopIterations: 30000,
    onBlock(pc) {
      block += 1;
      const addr = pc & 0xFFFFFF;
      if (addr === LAUNCH_HOME) targetCounts.launchHome09dd62 += 1;
      if (addr === 0x09DEE0) targetCounts.memInit09dee0 += 1;
      if (addr === 0x001879) {
        targetCounts.clear001879 += 1;
        if (!snapshot && readValue(mem, 0xD02590, 3) !== 0) {
          snapshot = {
            block,
            pc: addr,
            fields: captureSnapshot(mem, BOOT_SNAPSHOT_FIELDS),
          };
        }
      }
      if (addr === 0x0018F8) targetCounts.cleanup0018f8 += 1;
      if (addr === HALT_IDLE) targetCounts.halt0019b5 += 1;
    },
  });

  return {
    ...machine,
    phase5: {
      result: formatRunResult(result),
      targetCounts,
      snapshot,
    },
  };
}

function runRepaint(mem, peripherals, executor, cpu) {
  const counts = { homeRepaint058241: 0, cleanup0018f8: 0, halt0019b5: 0 };
  let blocks = 0;

  prepareEventFrame(mem, peripherals, cpu);
  const result = executor.runFrom(HOME_REPAINT, 'adl', {
    maxSteps: 300000,
    maxLoopIterations: 30000,
    onBlock(pc) {
      blocks += 1;
      const addr = pc & 0xFFFFFF;
      if (addr === HOME_REPAINT) counts.homeRepaint058241 += 1;
      if (addr === 0x0018F8) counts.cleanup0018f8 += 1;
      if (addr === HALT_IDLE) counts.halt0019b5 += 1;
    },
  });

  return {
    result: formatRunResult(result),
    counts,
    blocks,
    fields: readFields(mem),
  };
}

function sourceByteRows(mem) {
  return SOURCE_FIELDS.map(([name, addr, len]) => ({
    name,
    addr,
    value: readValue(mem, addr, len),
    bytes: Array.from(mem.slice(addr, addr + len)),
    realBefore: readCaptureValue(preClearRam, addr, len),
    realAfter: readCaptureValue(afterClearRam, addr, len),
  }));
}

function formatSourceByteRows(rows) {
  return rows.map((row) => ({
    ...row,
    addr: hex(row.addr),
    value: hex(row.value, row.bytes.length * 2),
    bytes: row.bytes.map((byte) => hex(byte, 2)),
    realBefore: row.realBefore == null ? null : hex(row.realBefore, row.bytes.length * 2),
    realAfter: row.realAfter == null ? null : hex(row.realAfter, row.bytes.length * 2),
  }));
}

function deriveCopyPlan(before, after) {
  if (!before || !after) return null;
  const count = before.bc & 0xFFFFFF;
  return {
    count,
    sourceStart: (after.hl + 1) & 0xFFFFFF,
    sourceEnd: before.hl & 0xFFFFFF,
    destStart: (after.de + 1) & 0xFFFFFF,
    destEnd: before.de & 0xFFFFFF,
    sourceDelta: (((after.de + 1) & 0xFFFFFF) - ((after.hl + 1) & 0xFFFFFF)) & 0xFFFFFF,
  };
}

function formatCopyPlan(plan) {
  if (!plan) return null;
  return {
    count: hex(plan.count, 4),
    sourceStart: hex(plan.sourceStart),
    sourceEnd: hex(plan.sourceEnd),
    destStart: hex(plan.destStart),
    destEnd: hex(plan.destEnd),
    sourceDelta: hex(plan.sourceDelta, 4),
  };
}

function traceSample(label, logicalPc, cpu, mem, blockIndex, recentPcs, extra = {}) {
  return {
    label,
    logicalPc,
    blockIndex,
    cpu: compactCpu(cpu, mem),
    stack24: stack24(mem, cpu),
    stackTop24: readValue(mem, cpu.sp, 3),
    sourceBytes: sourceByteRows(mem),
    recentPcs: [...recentPcs],
    ...extra,
  };
}

function formatSample(sample) {
  return {
    ...sample,
    logicalPc: hex(sample.logicalPc),
    cpu: formatCpuSnapshot(sample.cpu),
    stackTop24: hex(sample.stackTop24),
    stack24: sample.stack24.map((row) => ({
      offset: row.offset,
      addr: hex(row.addr),
      value: hex(row.value),
    })),
    sourceBytes: formatSourceByteRows(sample.sourceBytes),
    recentPcs: sample.recentPcs.map((pc) => hex(pc)),
    lddr: sample.lddr ? {
      ...sample.lddr,
      before: formatCpuSnapshot(sample.lddr.before),
      after: formatCpuSnapshot(sample.lddr.after),
      copyPlan: formatCopyPlan(sample.lddr.copyPlan),
    } : undefined,
  };
}

function installTraceHooks(cpu, mem, traceState) {
  const originalLddr = cpu.lddr.bind(cpu);
  const originalReadIndexed8 = cpu.readIndexed8.bind(cpu);

  cpu.lddr = () => {
    const blockPc = cpu._currentBlockPc & 0xFFFFFF;
    const logicalPc = blockPc === 0x0A31B8
      ? 0x0A31C1
      : (blockPc === 0x0A31E2 || blockPc === 0x0A31DE ? 0x0A31F2 : blockPc);
    const shouldRecord = logicalPc === 0x0A31C1 || logicalPc === 0x0A31F2;
    const before = shouldRecord ? compactCpu(cpu, mem) : null;
    const beforeSources = shouldRecord ? sourceByteRows(mem) : null;
    originalLddr();
    if (shouldRecord) {
      const after = compactCpu(cpu, mem);
      traceState.samples.push(traceSample(
        logicalPc === 0x0A31C1 ? 'lddr-before-after-0a31c1' : 'lddr-before-after-0a31f2',
        logicalPc,
        cpu,
        mem,
        traceState.blockIndex,
        traceState.recentPcs,
        {
          lddr: {
            blockPc,
            before,
            after,
            copyPlan: deriveCopyPlan(before, after),
            sourceBytesBefore: beforeSources,
            sourceBytesAfter: sourceByteRows(mem),
          },
        },
      ));
    }
  };

  cpu.readIndexed8 = (which, displacement) => {
    const blockPc = cpu._currentBlockPc & 0xFFFFFF;
    const value = originalReadIndexed8(which, displacement);
    if (blockPc === 0x0A31B8 && which === 'iy' && displacement === 74) {
      traceState.samples.push(traceSample('branch-test-0a31d8', 0x0A31D8, cpu, mem, traceState.blockIndex, traceState.recentPcs, {
        indexedRead: {
          register: which,
          displacement,
          addr: (cpu.iy + displacement) & 0xFFFFFF,
          value,
          bit3Set: (value & 0x08) !== 0,
          predictedBranch: (value & 0x08) === 0 ? 'JR Z to 0x0A31E2 / D031F6 path' : 'fall through to 0x0A31DE / D052C6 path',
        },
      }));
    }
    return value;
  };

  return {
    uninstall() {
      cpu.lddr = originalLddr;
      cpu.readIndexed8 = originalReadIndexed8;
    },
  };
}

function runInputTrace(caseConfig) {
  const machine = runPhase5WithSnapshot();
  const { mem, peripherals, executor, cpu, phase5, phases } = machine;
  if (!phase5.snapshot) throw new Error('phase5 snapshot not captured before repaint');

  restoreSnapshot(mem, phase5.snapshot.fields);
  const restoredFields = readFields(mem);
  const repaint = runRepaint(mem, peripherals, executor, cpu);
  rearmCxMain(mem);
  write24(mem, 0xD0243A, 0xD1A8CC);
  write24(mem, 0xD0243D, 0xD2A83E);
  writeValue(mem, 0xD02A29, 2, 0x0000);
  const initialFields = readFields(mem);

  prepareEventFrame(mem, peripherals, cpu);
  seedClear(mem, peripherals);
  const seededFields = readFields(mem);

  const traceState = {
    blockIndex: 0,
    recentPcs: [],
    samples: [],
    patch: null,
  };
  const hooks = installTraceHooks(cpu, mem, traceState);
  const hotBlocks = new Map();
  let rawResult = null;
  let stopReason = null;
  let previous = {
    pc: null,
    fields: seededFields,
    cpu: compactCpu(cpu, mem),
  };
  let fieldZeroTransition = null;

  try {
    rawResult = executor.runFrom(OUTER_LOOP, 'adl', {
      maxSteps: 100000,
      maxLoopIterations: 100000,
      diHaltBypass: true,
      diHaltBypassEntry: OUTER_LOOP,
      onBlock(pc) {
        traceState.blockIndex += 1;
        const addr = pc & 0xFFFFFF;
        traceState.recentPcs.push(addr);
        if (traceState.recentPcs.length > 160) traceState.recentPcs.shift();
        hotBlocks.set(hex(addr), (hotBlocks.get(hex(addr)) ?? 0) + 1);

        if (caseConfig.patch && !traceState.patch && addr === caseConfig.patch.pc) {
          const beforeValue = mem[caseConfig.patch.addr] ?? 0;
          mem[caseConfig.patch.addr] = caseConfig.patch.value & 0xFF;
          traceState.patch = {
            blockIndex: traceState.blockIndex,
            pc: addr,
            addr: caseConfig.patch.addr,
            beforeValue,
            afterValue: mem[caseConfig.patch.addr] ?? 0,
          };
        }

        if (WATCH_BLOCKS.has(addr)) {
          traceState.samples.push(traceSample(`block-entry-${hex(addr).slice(2).toLowerCase()}`, addr, cpu, mem, traceState.blockIndex, traceState.recentPcs, {
            previousPc: previous.pc,
            predictedStackPopHl: (addr === 0x0A31B8 || addr === 0x0A31E2 || addr === 0x0A31DE)
              ? readValue(mem, cpu.sp, 3)
              : null,
          }));
        }

        const currentFields = readFields(mem);
        if (
          !fieldZeroTransition
          && previous.fields.D0243A !== 0
          && currentFields.D0243A === 0
        ) {
          fieldZeroTransition = {
            blockIndex: traceState.blockIndex,
            ownerPc: previous.pc,
            entryPc: addr,
            beforeFields: previous.fields,
            afterFields: currentFields,
            beforeCpu: previous.cpu,
            afterCpu: compactCpu(cpu, mem),
            recentPcs: [...traceState.recentPcs],
          };
        }

        if (addr === 0x0A31A2 && previous.pc === 0x0A31E2) {
          stopReason = 'captured-0a31e2-to-0a31a2';
          throw new EarlyStop(stopReason);
        }

        previous = {
          pc: addr,
          fields: currentFields,
          cpu: compactCpu(cpu, mem),
        };
      },
    });
  } catch (error) {
    if (error instanceof EarlyStop) {
      rawResult = {
        steps: traceState.blockIndex,
        termination: error.reason,
        lastPc: cpu._currentBlockPc & 0xFFFFFF,
        lastMode: 'adl',
      };
    } else {
      throw error;
    }
  } finally {
    hooks.uninstall();
  }

  const firstByLogicalPc = new Map();
  for (const sample of traceState.samples) {
    if (!firstByLogicalPc.has(sample.logicalPc)) firstByLogicalPc.set(sample.logicalPc, sample);
  }
  const first0a31b8 = firstByLogicalPc.get(0x0A31B8);
  const lddr0a31c1 = traceState.samples.find((sample) => sample.logicalPc === 0x0A31C1 && sample.lddr);
  const branch0a31d8 = traceState.samples.find((sample) => sample.logicalPc === 0x0A31D8);
  const first0a31e2 = firstByLogicalPc.get(0x0A31E2);
  const lddr0a31f2 = traceState.samples.find((sample) => sample.logicalPc === 0x0A31F2 && sample.lddr);

  const sourceAlreadyZeroAt0a31b8 = first0a31b8
    ? SOURCE_FIELDS.every(([name]) => first0a31b8.cpu.sourceFields[name] === 0 || name === 'D02270')
    : false;
  const destructiveCopyCount = lddr0a31f2?.lddr?.copyPlan?.count ?? null;
  const destructiveSourceStart = lddr0a31f2?.lddr?.copyPlan?.sourceStart ?? null;
  const destructiveDestStart = lddr0a31f2?.lddr?.copyPlan?.destStart ?? null;
  const finalRawFields = readFields(mem);
  const zeroedCriticalFields = ['D0243A', 'D0243D', 'D02590', 'D0259D'].filter((name) => finalRawFields[name] === 0);
  const sourceWindowUnchangedByFirstLddr = Boolean(first0a31b8 && lddr0a31c1)
    && SOURCE_FIELDS.every(([name]) => first0a31b8.cpu.sourceFields[name] === lddr0a31c1.lddr.after.sourceFields[name]);

  const pass = rawResult.termination === 'captured-0a31e2-to-0a31a2'
    && Boolean(first0a31b8)
    && Boolean(lddr0a31c1)
    && Boolean(branch0a31d8)
    && Boolean(first0a31e2)
    && Boolean(lddr0a31f2)
    && destructiveCopyCount === caseConfig.expectedDestructiveCount
    && (!caseConfig.patch || traceState.patch?.beforeValue === 0x00)
    && (!caseConfig.patch || traceState.patch?.afterValue === caseConfig.patch.value);

  const topHotBlocks = [...hotBlocks.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 24)
    .map(([pc, count]) => ({ pc, count }));

  return {
    probe: 'phase852-d02505-owner-boundary-ab',
    caseId: caseConfig.id,
    caseLabel: caseConfig.label,
    pass,
    patch: traceState.patch ? {
      blockIndex: traceState.patch.blockIndex,
      pc: hex(traceState.patch.pc),
      addr: hex(traceState.patch.addr),
      beforeValue: hex(traceState.patch.beforeValue, 2),
      afterValue: hex(traceState.patch.afterValue, 2),
    } : null,
    result: {
      steps: rawResult.steps,
      termination: rawResult.termination,
      lastPc: hex(rawResult.lastPc),
      lastMode: rawResult.lastMode,
      stopReason,
    },
    phases: phases.map((phase) => ({ name: phase.name, result: formatRunResult(phase.result) })),
    phase5: {
      result: phase5.result,
      targetCounts: phase5.targetCounts,
      snapshot: {
        block: phase5.snapshot.block,
        pc: hex(phase5.snapshot.pc),
      },
    },
    repaint: {
      ...repaint,
      fields: formatFields(repaint.fields),
    },
    copyMetrics: {
      destructiveCopyCount,
      destructiveSourceStart,
      destructiveDestStart,
      expectedDestructiveCount: caseConfig.expectedDestructiveCount,
      zeroedCriticalFields,
      avoidedCriticalZeroing: zeroedCriticalFields.length === 0,
      fieldZeroTransitionSeen: Boolean(fieldZeroTransition),
    },
    restoredFields: formatFields(restoredFields),
    initialFields: formatFields(initialFields),
    seededFields: formatFields(seededFields),
    finalFields: formatFields(finalRawFields),
    sourceWindowUnchangedByFirstLddr,
    sourceAlreadyZeroAt0a31b8,
    firstSourceValuesAt0a31b8: first0a31b8 ? formatSourceValues(first0a31b8.cpu.sourceFields) : null,
    firstSourceValuesAfter0a31c1: lddr0a31c1 ? formatSourceValues(lddr0a31c1.lddr.after.sourceFields) : null,
    fieldZeroTransition: fieldZeroTransition ? {
      blockIndex: fieldZeroTransition.blockIndex,
      ownerPc: hex(fieldZeroTransition.ownerPc),
      entryPc: hex(fieldZeroTransition.entryPc),
      beforeFields: formatFields(fieldZeroTransition.beforeFields),
      afterFields: formatFields(fieldZeroTransition.afterFields),
      beforeCpu: formatCpuSnapshot(fieldZeroTransition.beforeCpu),
      afterCpu: formatCpuSnapshot(fieldZeroTransition.afterCpu),
      recentPcs: fieldZeroTransition.recentPcs.map((pc) => hex(pc)),
    } : null,
    keySamples: {
      at0A31B8: first0a31b8 ? formatSample(first0a31b8) : null,
      at0A31C1: lddr0a31c1 ? formatSample(lddr0a31c1) : null,
      at0A31D8: branch0a31d8 ? formatSample(branch0a31d8) : null,
      at0A31E2: first0a31e2 ? formatSample(first0a31e2) : null,
      at0A31F2: lddr0a31f2 ? formatSample(lddr0a31f2) : null,
    },
    allSamples: traceState.samples.map(formatSample),
    topHotBlocks,
  };
}

function sourceRowsMarkdown(sample) {
  if (!sample) return '- no sample';
  return [
    '| Source field | Value at sample | Real before CLEAR | Real after CLEAR | Bytes |',
    '| --- | --- | --- | --- | --- |',
    ...sample.sourceBytes.map((row) => `| ${row.name} | ${row.value} | ${row.realBefore ?? '-'} | ${row.realAfter ?? '-'} | ${row.bytes.join(' ')} |`),
  ].join('\n');
}

function sampleCpuRow(label, sample) {
  if (!sample) return `| ${label} | - | - | - | - | - | - | - | - |`;
  const cpu = sample.cpu;
  return `| ${label} | ${sample.logicalPc} | ${sample.blockIndex} | ${cpu.sp} | ${cpu.af} | ${cpu.bc} | ${cpu.de} | ${cpu.hl} | ${sample.stackTop24} |`;
}

function recentPathText(sample) {
  if (!sample) return '-';
  return sample.recentPcs.slice(-24).join(' -> ');
}

function buildReport(summary) {
  const key = summary.keySamples;
  const lddr0a31c1 = key.at0A31C1?.lddr;
  const lddr0a31f2 = key.at0A31F2?.lddr;
  const branch = key.at0A31D8?.indexedRead;

  return [
    '# Phase 850: 0x0A31E2 Upstream Input / Path Trace',
    '',
    'Probe: `probe-phase850-0a31e2-input-trace.mjs`  ',
    'Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase850-0a31e2-input-trace.mjs`',
    '',
    '## Summary',
    '',
    `- Result: ${summary.pass ? 'PASS' : 'FAIL'}; termination=\`${summary.result.termination}\`, steps=${summary.result.steps}, lastPc=${summary.result.lastPc}.`,
    '- The faithful CLEAR route reaches `0x0A31B8 -> 0x0A31E2 -> 0x0A31A2`; `0x0A31D8` reads `(IY+0x4A)` as bit3 clear, so it takes the `D031F6` Z-path into `0x0A31E2`.',
    `- The first copy at \`0x0A31C1\` copies ${lddr0a31c1?.copyPlan?.count ?? '-'} bytes from ${lddr0a31c1?.copyPlan?.sourceStart ?? '-'}..${lddr0a31c1?.copyPlan?.sourceEnd ?? '-'} to ${lddr0a31c1?.copyPlan?.destStart ?? '-'}..${lddr0a31c1?.copyPlan?.destEnd ?? '-'}.`,
    `- The destructive copy at \`0x0A31F2\` copies ${lddr0a31f2?.copyPlan?.count ?? '-'} bytes from ${lddr0a31f2?.copyPlan?.sourceStart ?? '-'}..${lddr0a31f2?.copyPlan?.sourceEnd ?? '-'} to ${lddr0a31f2?.copyPlan?.destStart ?? '-'}..${lddr0a31f2?.copyPlan?.destEnd ?? '-'}.`,
    `- The second copy's source-window bytes for the watched fields are already the bad values before \`0x0A31B8\` and are ${summary.sourceWindowUnchangedByFirstLddr ? 'unchanged' : 'changed'} by the first copy.`,
    '- Named next owner: **the upstream path that calls `0x0A31FD` with `IX=0xD02504`, `IX+0=0x00`, `IX+1=0x00`, `C=0x14`, and `(IY+0x4A)` bit3 clear**. That path drives `A=0xEC`, `B=0xEC`, and the `D031F6` branch that creates the 0x24E0 backward copy over live edit/VAT state. Phase851 should statically decode that `0x0A322B -> 0x0A31FD -> 0x0A3205 -> ... -> 0x0A31E2` owner chain, especially why the `0x0A31FD` early `RET Z` does not fire in the lifted run when the IX fields are zero.',
    '',
    '## Key Register Samples',
    '',
    '| Sample | Logical PC | Block # | SP | AF | BC | DE | HL | Stack top 24-bit |',
    '| --- | --- | ---: | --- | --- | --- | --- | --- | --- |',
    sampleCpuRow('entry 0x0A31B8', key.at0A31B8),
    sampleCpuRow('LDDR 0x0A31C1 after', key.at0A31C1),
    sampleCpuRow('branch 0x0A31D8', key.at0A31D8),
    sampleCpuRow('entry 0x0A31E2', key.at0A31E2),
    sampleCpuRow('LDDR 0x0A31F2 after', key.at0A31F2),
    '',
    '## Branch Sample at 0x0A31D8',
    '',
    '```json',
    JSON.stringify(branch ?? null, null, 2),
    '```',
    '',
    '## Copy Plans',
    '',
    '```json',
    JSON.stringify({
      copy0A31C1: lddr0a31c1?.copyPlan ?? null,
      copy0A31F2: lddr0a31f2?.copyPlan ?? null,
    }, null, 2),
    '```',
    '',
    '## Source Window Bytes',
    '',
    '### At 0x0A31B8 entry',
    '',
    sourceRowsMarkdown(key.at0A31B8),
    '',
    '### After 0x0A31C1 LDDR',
    '',
    sourceRowsMarkdown(key.at0A31C1),
    '',
    '### At 0x0A31E2 entry',
    '',
    sourceRowsMarkdown(key.at0A31E2),
    '',
    '## Recent Path Into Owner',
    '',
    '```text',
    recentPathText(key.at0A31E2),
    '```',
    '',
    '## Field Zero Transition',
    '',
    '```json',
    JSON.stringify(summary.fieldZeroTransition, null, 2),
    '```',
    '',
    '## Full JSON',
    '',
    '```json',
    JSON.stringify(summary, null, 2),
    '```',
    '',
    'No runtime, transpiler, browser-shell, decoder, peripheral, scheduler, or ROM artifact files were changed.',
    '',
  ].join('\n');
}

function formatMetrics(metrics) {
  return {
    destructiveCopyCount: metrics.destructiveCopyCount == null ? null : hex(metrics.destructiveCopyCount, 4),
    destructiveSourceStart: metrics.destructiveSourceStart == null ? null : hex(metrics.destructiveSourceStart),
    destructiveDestStart: metrics.destructiveDestStart == null ? null : hex(metrics.destructiveDestStart),
    expectedDestructiveCount: hex(metrics.expectedDestructiveCount, 4),
    zeroedCriticalFields: metrics.zeroedCriticalFields,
    avoidedCriticalZeroing: metrics.avoidedCriticalZeroing,
    fieldZeroTransitionSeen: metrics.fieldZeroTransitionSeen,
  };
}

function compareCases(caseSummaries) {
  const baseline = caseSummaries.find((summary) => summary.caseId === 'baseline');
  const patched = caseSummaries.find((summary) => summary.caseId === 'd02505_0a_at_0a31fd');
  if (!baseline || !patched) throw new Error('missing baseline or patched case summary');

  const patchApplied = patched.patch?.pc === '0x0A31FD'
    && patched.patch?.addr === '0xD02505'
    && patched.patch?.beforeValue === '0x00'
    && patched.patch?.afterValue === '0x0A';
  const geometryChangedAsExpected = baseline.copyMetrics.destructiveCopyCount === 0x24E0
    && patched.copyMetrics.destructiveCopyCount === 0x1C20;
  const sameBoundedRoute = caseSummaries.every((summary) => summary.result.termination === 'captured-0a31e2-to-0a31a2');
  const artifactCounts = caseSummaries.map((summary) => {
    const row = summary.topHotBlocks.find((entry) => entry.pc === '0x0A1854');
    return { caseId: summary.caseId, count: row?.count ?? 0 };
  });
  const closedArtifactHotLoopsBeforeStop = artifactCounts.filter((row) => row.count >= 512);
  const noClosed0A1854HotLoopBeforeStop = closedArtifactHotLoopsBeforeStop.length === 0;
  const max0A1854CountBeforeStop = Math.max(...artifactCounts.map((row) => row.count));
  const pass = caseSummaries.every((summary) => summary.pass)
    && patchApplied
    && geometryChangedAsExpected
    && sameBoundedRoute
    && noClosed0A1854HotLoopBeforeStop;

  return {
    probe: 'phase852-d02505-owner-boundary-ab',
    pass,
    checks: {
      casesPass: caseSummaries.every((summary) => summary.pass),
      patchApplied,
      geometryChangedAsExpected,
      sameBoundedRoute,
      noClosed0A1854HotLoopBeforeStop,
    },
    artifactCounts,
    max0A1854CountBeforeStop,
    conclusion: {
      d02505ControlsCopyGeometry: geometryChangedAsExpected,
      patchedAvoidedCriticalZeroing: patched.copyMetrics.avoidedCriticalZeroing,
      patchedZeroedCriticalFields: patched.copyMetrics.zeroedCriticalFields,
      diagnosticFinding: patched.copyMetrics.avoidedCriticalZeroing
        ? 'D02505=0x0A changes geometry and avoids the watched field zeroing at the bounded owner.'
        : 'D02505=0x0A changes geometry but does not by itself avoid the watched field zeroing at the bounded owner.',
    },
    caseSummaries,
    metrics: {
      baseline: formatMetrics(baseline.copyMetrics),
      patched: formatMetrics(patched.copyMetrics),
    },
  };
}

function caseTable(caseSummaries) {
  return [
    '| Case | Pass | Patch | Termination | Steps | Destructive count | Source start | Dest start | Zeroed critical fields |',
    '| --- | --- | --- | --- | ---: | --- | --- | --- | --- |',
    ...caseSummaries.map((summary) => {
      const metrics = formatMetrics(summary.copyMetrics);
      const patch = summary.patch
        ? `${summary.patch.addr}: ${summary.patch.beforeValue} -> ${summary.patch.afterValue} at ${summary.patch.pc}`
        : '-';
      return [
        `| ${summary.caseId}`,
        summary.pass ? 'yes' : 'no',
        patch,
        summary.result.termination,
        summary.result.steps,
        metrics.destructiveCopyCount,
        metrics.destructiveSourceStart,
        metrics.destructiveDestStart,
        summary.copyMetrics.zeroedCriticalFields.length ? summary.copyMetrics.zeroedCriticalFields.join(', ') : 'none',
      ].join(' | ') + ' |';
    }),
  ].join('\n');
}

function buildComparisonReport(comparison) {
  const baseline = comparison.caseSummaries.find((summary) => summary.caseId === 'baseline');
  const patched = comparison.caseSummaries.find((summary) => summary.caseId === 'd02505_0a_at_0a31fd');
  return [
    '# Phase 852: D02505 Owner-Boundary A/B Confirmation',
    '',
    'Probe: `probe-phase852-d02505-owner-boundary-ab.mjs`  ',
    'Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase852-d02505-owner-boundary-ab.mjs`',
    '',
    '## Summary',
    '',
    `- Result: ${comparison.pass ? 'PASS' : 'FAIL'}; both cases ${comparison.checks.sameBoundedRoute ? 'reached' : 'did not both reach'} the bounded \`0x0A31E2 -> 0x0A31A2\` owner stop.`,
    `- The one-byte patch was ${comparison.checks.patchApplied ? 'applied exactly as requested' : 'not applied as requested'}: \`D02505 0x00 -> 0x0A\` on entry to \`0x0A31FD\`.`,
    `- Dynamic copy geometry ${comparison.conclusion.d02505ControlsCopyGeometry ? 'changed as predicted' : 'did not change as predicted'}: baseline \`${comparison.metrics.baseline.destructiveCopyCount}\`, patched \`${comparison.metrics.patched.destructiveCopyCount}\`.`,
    `- Diagnostic outcome: ${comparison.conclusion.diagnosticFinding}`,
    `- The probe stops at the owner boundary, so it does not reopen the closed post-owner \`0x0A1854\` descent; max pre-stop \`0x0A1854\` count was ${comparison.max0A1854CountBeforeStop}, below the 512-hit hot-loop threshold used by earlier probes.`,
    '',
    '## Case Comparison',
    '',
    caseTable(comparison.caseSummaries),
    '',
    '## Key Samples',
    '',
    '### Baseline 0x0A31F2 copy',
    '',
    '```json',
    JSON.stringify(baseline?.keySamples?.at0A31F2?.lddr?.copyPlan ?? null, null, 2),
    '```',
    '',
    '### Patched 0x0A31F2 copy',
    '',
    '```json',
    JSON.stringify(patched?.keySamples?.at0A31F2?.lddr?.copyPlan ?? null, null, 2),
    '```',
    '',
    '## Field Zero Transitions',
    '',
    '```json',
    JSON.stringify({
      baseline: baseline?.fieldZeroTransition ?? null,
      patched: patched?.fieldZeroTransition ?? null,
    }, null, 2),
    '```',
    '',
    '## Full JSON',
    '',
    '```json',
    JSON.stringify(comparison, null, 2),
    '```',
    '',
    'No runtime, transpiler, browser-shell, decoder, peripheral, scheduler, or ROM artifact files were changed.',
    '',
  ].join('\n');
}

console.log('phase852: D02505 owner-boundary A/B confirmation');

try {
  const summaries = CASES.map((caseConfig) => runInputTrace(caseConfig));
  const comparison = compareCases(summaries);
  fs.writeFileSync(REPORT_PATH, `${buildComparisonReport(comparison)}\n`);
  console.log(JSON.stringify({
    probe: comparison.probe,
    pass: comparison.pass,
    checks: comparison.checks,
    conclusion: comparison.conclusion,
    metrics: comparison.metrics,
    report: path.basename(REPORT_PATH),
  }, null, 2));
  if (!comparison.pass) process.exitCode = 1;
} catch (error) {
  const message = String(error?.stack || error);
  fs.writeFileSync(REPORT_PATH, [
    '# Phase 852: D02505 Owner-Boundary A/B Confirmation',
    '',
    'Probe failed before report generation.',
    '',
    '```text',
    message,
    '```',
    '',
  ].join('\n'));
  console.error(message);
  process.exitCode = 1;
}
