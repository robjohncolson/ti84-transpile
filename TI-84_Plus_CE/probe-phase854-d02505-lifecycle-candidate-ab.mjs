import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase854-d02505-lifecycle-candidate-ab.md');
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');
const PRE_CLEAR_CAPTURE = path.join(__dirname, 'captures', 'realram-home-digit3-D00000-D657FF.bin');
const AFTER_CLEAR_CAPTURE = path.join(__dirname, 'captures', 'realram-home-afterCLEAR-D00000-D657FF.bin');

const romBytes = fs.readFileSync(ROM_PATH);
const preClearRam = fs.readFileSync(PRE_CLEAR_CAPTURE);
const afterClearRam = fs.readFileSync(AFTER_CLEAR_CAPTURE);
const romModule = await import(pathToFileURL(TRANSPILED_PATH).href);
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

const WATCHED_FIELDS = Object.freeze([
  ['D02504', 0xD02504, 1],
  ['D02505', 0xD02505, 1],
  ['D02506', 0xD02506, 1],
  ['D0243A', 0xD0243A, 3],
  ['D0243D', 0xD0243D, 3],
  ['D02590', 0xD02590, 3],
  ['D0259D', 0xD0259D, 3],
  ['D02A29', 0xD02A29, 2],
  ['D00595', 0xD00595, 1],
  ['D00596', 0xD00596, 1],
  ['D00080', 0xD00080, 1],
  ['D0009F', 0xD0009F, 1],
  ['D00587', 0xD00587, 1],
  ['D0058C', 0xD0058C, 1],
  ['D0058E', 0xD0058E, 1],
]);

const CRITICAL_FIELDS = Object.freeze(['D0243A', 'D0243D', 'D02590', 'D0259D']);

const CASES = Object.freeze([
  {
    id: 'baseline',
    label: 'Baseline lifted lifecycle',
    carryD02505: false,
    expectedOwnerD02505: 0x00,
    expectedDestructiveCount: 0x24E0,
  },
  {
    id: 'carry_preclear_d02505',
    label: 'Carry only launch-home D02505 through pre-clear snapshot boundary',
    carryD02505: true,
    expectedOwnerD02505: 0x0A,
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

function formatBySpec(values, spec) {
  return Object.fromEntries(spec.map(([name, , len]) => [name, hex(values[name], len * 2)]));
}

function formatFields(values) {
  return formatBySpec(values, WATCHED_FIELDS);
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
    lastPc: hex(result.lastPc ?? 0),
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
  let d02505Write0A = null;
  let d02505Clear = null;

  const originalWrite8 = machine.cpu.write8.bind(machine.cpu);
  const originalWrite16 = machine.cpu.write16.bind(machine.cpu);

  machine.cpu.write8 = (addr, value) => {
    const normalized = addr & 0xFFFFFF;
    const before = mem[normalized] ?? 0;
    originalWrite8(addr, value);
    if (normalized === 0xD02505 && before === 0x0A && (mem[normalized] ?? 0) === 0x00 && !d02505Clear) {
      d02505Clear = { block, blockPc: machine.cpu._currentBlockPc & 0xFFFFFF };
    }
  };

  machine.cpu.write16 = (addr, value) => {
    const normalized = addr & 0xFFFFFF;
    originalWrite16(addr, value);
    if (normalized === 0xD02504 && (mem[0xD02505] ?? 0) === 0x0A && !d02505Write0A) {
      d02505Write0A = { block, blockPc: machine.cpu._currentBlockPc & 0xFFFFFF };
    }
  };

  let result;
  try {
    result = executor.runFrom(LAUNCH_HOME, 'adl', {
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
              d02505: readValue(mem, 0xD02505, 1),
              watchedFields: readFields(mem),
            };
          }
        }
        if (addr === 0x0018F8) targetCounts.cleanup0018f8 += 1;
        if (addr === HALT_IDLE) targetCounts.halt0019b5 += 1;
      },
    });
  } finally {
    machine.cpu.write8 = originalWrite8;
    machine.cpu.write16 = originalWrite16;
  }

  return {
    ...machine,
    phase5: {
      result: formatRunResult(result),
      targetCounts,
      snapshot,
      d02505Write0A,
      d02505Clear,
      finalD02505: readValue(mem, 0xD02505, 1),
    },
  };
}

function runRepaint(mem, peripherals, executor, cpu) {
  const counts = { homeRepaint058241: 0, cleanup0018f8: 0, halt0019b5: 0 };
  prepareEventFrame(mem, peripherals, cpu);
  const result = executor.runFrom(HOME_REPAINT, 'adl', {
    maxSteps: 300000,
    maxLoopIterations: 30000,
    onBlock(pc) {
      const addr = pc & 0xFFFFFF;
      if (addr === HOME_REPAINT) counts.homeRepaint058241 += 1;
      if (addr === 0x0018F8) counts.cleanup0018f8 += 1;
      if (addr === HALT_IDLE) counts.halt0019b5 += 1;
    },
  });
  return { result: formatRunResult(result), counts, fields: readFields(mem) };
}

function deriveCopyPlan(before, after) {
  if (!before || !after) return null;
  return {
    count: before.bc & 0xFFFFFF,
    sourceStart: (after.hl + 1) & 0xFFFFFF,
    sourceEnd: before.hl & 0xFFFFFF,
    destStart: (after.de + 1) & 0xFFFFFF,
    destEnd: before.de & 0xFFFFFF,
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
  };
}

function installLddrTrace(cpu, mem, traceState) {
  const originalLddr = cpu.lddr.bind(cpu);
  cpu.lddr = () => {
    const blockPc = cpu._currentBlockPc & 0xFFFFFF;
    const logicalPc = blockPc === 0x0A31B8
      ? 0x0A31C1
      : (blockPc === 0x0A31E2 || blockPc === 0x0A31DE ? 0x0A31F2 : blockPc);
    const shouldRecord = logicalPc === 0x0A31C1 || logicalPc === 0x0A31F2;
    const before = shouldRecord ? compactCpu(cpu, mem) : null;
    originalLddr();
    if (shouldRecord) {
      const after = compactCpu(cpu, mem);
      traceState.samples.push({
        label: logicalPc === 0x0A31C1 ? 'lddr-0a31c1' : 'lddr-0a31f2',
        logicalPc,
        blockPc,
        blockIndex: traceState.blockIndex,
        before,
        after,
        copyPlan: deriveCopyPlan(before, after),
        recentPcs: [...traceState.recentPcs],
      });
    }
  };
  return {
    uninstall() {
      cpu.lddr = originalLddr;
    },
  };
}

function runClearToOwner(caseConfig, mem, peripherals, executor, cpu) {
  prepareEventFrame(mem, peripherals, cpu);
  seedClear(mem, peripherals);
  const seededFields = readFields(mem);
  const traceState = { blockIndex: 0, recentPcs: [], samples: [] };
  const hooks = installLddrTrace(cpu, mem, traceState);
  const hotBlocks = new Map();
  const ownerHits = [];
  let previousPc = null;
  let fieldZeroTransition = null;
  let rawResult = null;
  let stopReason = null;

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
        if (traceState.recentPcs.length > 128) traceState.recentPcs.shift();
        hotBlocks.set(hex(addr), (hotBlocks.get(hex(addr)) ?? 0) + 1);

        if (addr === 0x0A31FD || addr === 0x0A3205 || addr === 0x0A31B8 || addr === 0x0A31E2 || addr === 0x0A31A2) {
          ownerHits.push({
            pc: addr,
            blockIndex: traceState.blockIndex,
            previousPc,
            cpu: compactCpu(cpu, mem),
            recentPcs: [...traceState.recentPcs],
          });
        }

        const fields = readFields(mem);
        if (!fieldZeroTransition && fields.D0243A === 0 && seededFields.D0243A !== 0) {
          fieldZeroTransition = {
            blockIndex: traceState.blockIndex,
            ownerPc: previousPc,
            entryPc: addr,
            fields,
            cpu: compactCpu(cpu, mem),
            recentPcs: [...traceState.recentPcs],
          };
        }

        if (addr === 0x0A31A2 && previousPc === 0x0A31E2) {
          stopReason = 'captured-0a31e2-to-0a31a2';
          throw new EarlyStop(stopReason);
        }

        previousPc = addr;
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

  const finalFieldsRaw = readFields(mem);
  const zeroedCriticalFields = CRITICAL_FIELDS.filter((name) => finalFieldsRaw[name] === 0);
  const ownerBoundary = ownerHits.find((hit) => hit.pc === 0x0A31FD) ?? null;
  const copy0A31F2 = traceState.samples.find((sample) => sample.logicalPc === 0x0A31F2) ?? null;
  const artifactCount = hotBlocks.get('0x0A1854') ?? 0;

  return {
    caseId: caseConfig.id,
    result: formatRunResult(rawResult),
    stopReason,
    seededFields: formatFields(seededFields),
    finalFields: formatFields(finalFieldsRaw),
    zeroedCriticalFields,
    ownerD02505: ownerBoundary?.cpu?.fields?.D02505 ?? null,
    copyPlan: copy0A31F2?.copyPlan ?? null,
    fieldZeroTransition: fieldZeroTransition ? {
      blockIndex: fieldZeroTransition.blockIndex,
      ownerPc: hex(fieldZeroTransition.ownerPc),
      entryPc: hex(fieldZeroTransition.entryPc),
      fields: formatFields(fieldZeroTransition.fields),
      cpu: formatCpuSnapshot(fieldZeroTransition.cpu),
      recentPcs: fieldZeroTransition.recentPcs.slice(-16).map((pc) => hex(pc)),
    } : null,
    ownerHits: ownerHits.map((hit) => ({
      pc: hex(hit.pc),
      blockIndex: hit.blockIndex,
      previousPc: hex(hit.previousPc),
      d02505: hex(hit.cpu.fields.D02505, 2),
      bc: hex(hit.cpu.bc),
      de: hex(hit.cpu.de),
      hl: hex(hit.cpu.hl),
      z: hit.cpu.flags.z,
      recentPcs: hit.recentPcs.slice(-12).map((pc) => hex(pc)),
    })),
    samples: traceState.samples.map((sample) => ({
      label: sample.label,
      logicalPc: hex(sample.logicalPc),
      blockPc: hex(sample.blockPc),
      blockIndex: sample.blockIndex,
      before: formatCpuSnapshot(sample.before),
      after: formatCpuSnapshot(sample.after),
      copyPlan: formatCopyPlan(sample.copyPlan),
      recentPcs: sample.recentPcs.slice(-12).map((pc) => hex(pc)),
    })),
    hotBlocks: [...hotBlocks.entries()].sort((a, b) => b[1] - a[1]).slice(0, 16).map(([pc, count]) => ({ pc, count })),
    artifact0A1854Count: artifactCount,
  };
}

function runCase(caseConfig) {
  const machine = runPhase5WithSnapshot();
  const { mem, peripherals, executor, cpu, phase5, phases } = machine;
  if (!phase5.snapshot) throw new Error(`phase5 snapshot not captured for ${caseConfig.id}`);

  restoreSnapshot(mem, phase5.snapshot.fields);
  const afterSnapshotRestore = readFields(mem);
  let carryPatch = null;
  if (caseConfig.carryD02505) {
    carryPatch = {
      point: 'after phase5 pre-clear snapshot restore, before repaint',
      addr: 0xD02505,
      beforeValue: mem[0xD02505] ?? 0,
      afterValue: phase5.snapshot.d02505,
    };
    mem[0xD02505] = phase5.snapshot.d02505 & 0xFF;
  }
  const afterCarry = readFields(mem);

  const repaint = runRepaint(mem, peripherals, executor, cpu);
  rearmCxMain(mem);
  write24(mem, 0xD0243A, 0xD1A8CC);
  write24(mem, 0xD0243D, 0xD2A83E);
  writeValue(mem, 0xD02A29, 2, 0x0000);
  const afterManualSetup = readFields(mem);

  const clearRoute = runClearToOwner(caseConfig, mem, peripherals, executor, cpu);
  const ownerD02505 = clearRoute.ownerD02505 ?? -1;
  const destructiveCopyCount = clearRoute.copyPlan?.count ?? null;
  const safeGeometry = destructiveCopyCount === 0x1C20
    && clearRoute.copyPlan?.sourceStart === 0xD0330E
    && clearRoute.copyPlan?.destStart === 0xD0362E;
  const badGeometry = destructiveCopyCount === 0x24E0
    && clearRoute.copyPlan?.sourceStart === 0xD00B0E
    && clearRoute.copyPlan?.destStart === 0xD00E2E;
  const pass = clearRoute.result.termination === 'captured-0a31e2-to-0a31a2'
    && ownerD02505 === caseConfig.expectedOwnerD02505
    && destructiveCopyCount === caseConfig.expectedDestructiveCount
    && (caseConfig.carryD02505 ? safeGeometry && clearRoute.zeroedCriticalFields.length === 0 : badGeometry)
    && clearRoute.artifact0A1854Count < 512
    && (!caseConfig.carryD02505 || carryPatch?.beforeValue === 0x00)
    && (!caseConfig.carryD02505 || carryPatch?.afterValue === 0x0A);

  return {
    id: caseConfig.id,
    label: caseConfig.label,
    pass,
    carryD02505: caseConfig.carryD02505,
    carryPatch: carryPatch ? {
      ...carryPatch,
      addr: hex(carryPatch.addr),
      beforeValue: hex(carryPatch.beforeValue, 2),
      afterValue: hex(carryPatch.afterValue, 2),
    } : null,
    checks: {
      ownerD02505: hex(ownerD02505, 2),
      expectedOwnerD02505: hex(caseConfig.expectedOwnerD02505, 2),
      destructiveCopyCount: destructiveCopyCount == null ? null : hex(destructiveCopyCount, 4),
      expectedDestructiveCount: hex(caseConfig.expectedDestructiveCount, 4),
      safeGeometry,
      badGeometry,
      zeroedCriticalFields: clearRoute.zeroedCriticalFields,
      artifact0A1854Count: clearRoute.artifact0A1854Count,
    },
    phases: phases.map((phase) => ({ name: phase.name, result: formatRunResult(phase.result) })),
    phase5: {
      ...phase5,
      d02505Write0A: phase5.d02505Write0A ? {
        block: phase5.d02505Write0A.block,
        blockPc: hex(phase5.d02505Write0A.blockPc),
      } : null,
      d02505Clear: phase5.d02505Clear ? {
        block: phase5.d02505Clear.block,
        blockPc: hex(phase5.d02505Clear.blockPc),
      } : null,
      finalD02505: hex(phase5.finalD02505, 2),
      snapshot: {
        block: phase5.snapshot.block,
        pc: hex(phase5.snapshot.pc),
        d02505: hex(phase5.snapshot.d02505, 2),
        watchedFields: formatFields(phase5.snapshot.watchedFields),
      },
    },
    afterSnapshotRestore: formatFields(afterSnapshotRestore),
    afterCarry: formatFields(afterCarry),
    repaint: {
      result: repaint.result,
      counts: repaint.counts,
      fields: formatFields(repaint.fields),
    },
    afterManualSetup: formatFields(afterManualSetup),
    clearRoute: {
      ...clearRoute,
      ownerD02505: hex(ownerD02505, 2),
      copyPlan: formatCopyPlan(clearRoute.copyPlan),
    },
  };
}

function summarizeRealCapture() {
  return {
    D02505: {
      pre: readCaptureValue(preClearRam, 0xD02505, 1),
      after: readCaptureValue(afterClearRam, 0xD02505, 1),
    },
    D0243A: {
      pre: readCaptureValue(preClearRam, 0xD0243A, 3),
      after: readCaptureValue(afterClearRam, 0xD0243A, 3),
    },
    D02590: {
      pre: readCaptureValue(preClearRam, 0xD02590, 3),
      after: readCaptureValue(afterClearRam, 0xD02590, 3),
    },
  };
}

function formatRealCapture(realCapture) {
  return {
    D02505: { pre: hex(realCapture.D02505.pre, 2), after: hex(realCapture.D02505.after, 2) },
    D0243A: { pre: hex(realCapture.D0243A.pre), after: hex(realCapture.D0243A.after) },
    D02590: { pre: hex(realCapture.D02590.pre), after: hex(realCapture.D02590.after) },
  };
}

function caseTable(cases) {
  return [
    '| Case | Pass | Boundary carry | Owner D02505 | 0x0A31F2 count | Source start | Dest start | Zeroed critical fields | 0x0A1854 hits |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | ---: |',
    ...cases.map((row) => {
      const plan = row.clearRoute.copyPlan;
      return `| ${row.id} | ${row.pass ? 'yes' : 'no'} | ${row.carryPatch ? `${row.carryPatch.beforeValue} -> ${row.carryPatch.afterValue}` : '-'} | ${row.checks.ownerD02505} | ${plan?.count ?? '-'} | ${plan?.sourceStart ?? '-'} | ${plan?.destStart ?? '-'} | ${row.checks.zeroedCriticalFields.length ? row.checks.zeroedCriticalFields.join(', ') : 'none'} | ${row.checks.artifact0A1854Count} |`;
    }),
  ].join('\n');
}

function buildReport(summary) {
  const baseline = summary.cases.find((row) => row.id === 'baseline');
  const carry = summary.cases.find((row) => row.id === 'carry_preclear_d02505');
  return [
    '# Phase 854: D02505 Lifecycle-Candidate A/B',
    '',
    'Probe: `probe-phase854-d02505-lifecycle-candidate-ab.mjs`  ',
    'Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase854-d02505-lifecycle-candidate-ab.mjs`',
    '',
    '## Summary',
    '',
    `- Result: ${summary.pass ? 'PASS' : 'FAIL'}. Baseline and lifecycle-carry cases both stopped at the bounded \`0x0A31E2 -> 0x0A31A2\` owner boundary; no patch was applied at \`0x0A31FD\`.`,
    `- Real captures keep \`D02505=${summary.realCapture.D02505.pre}\` before CLEAR and \`${summary.realCapture.D02505.after}\` after CLEAR.`,
    `- Baseline owner input stayed \`${baseline?.checks.ownerD02505 ?? '-'}\` and reproduced the Phase852 bad geometry: count \`${baseline?.clearRoute.copyPlan?.count ?? '-'}\`, source \`${baseline?.clearRoute.copyPlan?.sourceStart ?? '-'}\` -> dest \`${baseline?.clearRoute.copyPlan?.destStart ?? '-'}\`.`,
    `- Carrying only the launch-home pre-clear \`D02505=0x0A\` through the snapshot boundary made the owner naturally see \`${carry?.checks.ownerD02505 ?? '-'}\` and reproduced the Phase852 safe geometry: count \`${carry?.clearRoute.copyPlan?.count ?? '-'}\`, source \`${carry?.clearRoute.copyPlan?.sourceStart ?? '-'}\` -> dest \`${carry?.clearRoute.copyPlan?.destStart ?? '-'}\`.`,
    `- Watched critical fields after the bounded owner stop in the carry case: ${carry?.checks.zeroedCriticalFields.length ? carry.checks.zeroedCriticalFields.join(', ') : 'none zeroed'}.`,
    '',
    '## Case Comparison',
    '',
    caseTable(summary.cases),
    '',
    '## Phase5 Boundary Evidence',
    '',
    '```json',
    JSON.stringify(summary.cases.map((row) => ({
      id: row.id,
      phase5Snapshot: row.phase5.snapshot,
      d02505Write0A: row.phase5.d02505Write0A,
      d02505Clear: row.phase5.d02505Clear,
      finalD02505AfterLaunchHome: row.phase5.finalD02505,
      afterSnapshotRestore: {
        D02505: row.afterSnapshotRestore.D02505,
        D02590: row.afterSnapshotRestore.D02590,
      },
      afterCarry: {
        D02505: row.afterCarry.D02505,
        D02590: row.afterCarry.D02590,
      },
    })), null, 2),
    '```',
    '',
    '## Owner Hits',
    '',
    '```json',
    JSON.stringify(Object.fromEntries(summary.cases.map((row) => [row.id, row.clearRoute.ownerHits])), null, 2),
    '```',
    '',
    '## LDDR Samples',
    '',
    '```json',
    JSON.stringify(Object.fromEntries(summary.cases.map((row) => [row.id, row.clearRoute.samples])), null, 2),
    '```',
    '',
    '## Machine JSON',
    '',
    '```json',
    JSON.stringify(summary.machine, null, 2),
    '```',
    '',
    'No runtime, transpiler, browser-shell, decoder, peripheral, scheduler, ROM artifact, or `follow-alongs/` files were changed.',
    '',
  ].join('\n');
}

function runProbe() {
  const realCapture = formatRealCapture(summarizeRealCapture());
  const cases = CASES.map((caseConfig) => runCase(caseConfig));
  const baseline = cases.find((row) => row.id === 'baseline');
  const carry = cases.find((row) => row.id === 'carry_preclear_d02505');
  const pass = cases.every((row) => row.pass)
    && baseline?.checks.badGeometry
    && carry?.checks.safeGeometry
    && carry?.checks.zeroedCriticalFields.length === 0
    && realCapture.D02505.pre === '0x0A'
    && realCapture.D02505.after === '0x0A';

  return {
    pass,
    realCapture,
    cases,
    machine: {
      probe: 'phase854-d02505-lifecycle-candidate-ab',
      pass,
      checks: {
        casesPass: cases.every((row) => row.pass),
        baselineBadGeometry: Boolean(baseline?.checks.badGeometry),
        carrySafeGeometry: Boolean(carry?.checks.safeGeometry),
        carryAvoidedCriticalZeroing: carry?.checks.zeroedCriticalFields.length === 0,
        no0A31FDPatch: true,
      },
      conclusion: pass
        ? 'Carrying only the launch-home D02505=0x0A value across the pre-clear snapshot boundary naturally produces the safe 0x0A31FD owner input and safe copy geometry without a downstream owner patch.'
        : 'The lifecycle-carry candidate did not fully reproduce the safe owner geometry; inspect case JSON before testing the 0x058D60/0x058D65 fallback boundary.',
    },
  };
}

try {
  console.log('phase854: D02505 lifecycle-candidate A/B');
  const summary = runProbe();
  fs.writeFileSync(REPORT_PATH, `${buildReport(summary)}\n`);
  console.log(JSON.stringify({
    probe: summary.machine.probe,
    pass: summary.pass,
    checks: summary.machine.checks,
    conclusion: summary.machine.conclusion,
    caseMetrics: summary.cases.map((row) => ({
      id: row.id,
      pass: row.pass,
      ownerD02505: row.checks.ownerD02505,
      destructiveCopyCount: row.checks.destructiveCopyCount,
      safeGeometry: row.checks.safeGeometry,
      badGeometry: row.checks.badGeometry,
      zeroedCriticalFields: row.checks.zeroedCriticalFields,
    })),
    report: path.basename(REPORT_PATH),
  }, null, 2));
  if (!summary.pass) process.exitCode = 1;
} catch (error) {
  const message = String(error?.stack || error);
  fs.writeFileSync(REPORT_PATH, [
    '# Phase 854: D02505 Lifecycle-Candidate A/B',
    '',
    'Probe failed before producing a complete report.',
    '',
    '```text',
    message,
    '```',
    '',
  ].join('\n'));
  console.error(message);
  process.exitCode = 1;
}
