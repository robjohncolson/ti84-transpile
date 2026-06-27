import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase855-d02505-natural-lifecycle.md');
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
const FULL_BOUNDARY_BYTES = preClearRam.length;

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

const WATCH_WRITE_ADDRS = Object.freeze(new Set([0xD02504, 0xD02505, 0xD02506]));
const CRITICAL_FIELDS = Object.freeze(['D0243A', 'D0243D', 'D02590', 'D0259D']);

const TARGET_PCS = Object.freeze(new Map([
  [0x001879, 'bulk-clear-entry-001879'],
  [0x05E814, 'edit-buffer-ldir-clearer-05e814'],
  [0x058D54, 'candidate-rewriter-entry-058d54'],
  [0x058D60, 'candidate-rewriter-z-branch-058d60'],
  [0x058D65, 'candidate-rewriter-store-d02505-058d65'],
  [0x058D89, 'candidate-rewriter-cleanup-ret-058d89'],
  [0x0A321D, 'scroll-down-entry-0a321d'],
  [0x0A322B, 'scroll-owner-di-0a322b'],
  [0x0A31FD, 'd02505-owner-boundary-0a31fd'],
  [0x0A3205, 'd02505-owner-fallthrough-0a3205'],
  [0x0A31B8, 'scroll-copy-setup-0a31b8'],
  [0x0A31E2, 'destructive-copy-owner-0a31e2'],
  [0x0A31A2, 'post-copy-tail-0a31a2'],
]));

const CASES = Object.freeze([
  {
    id: 'narrow_fields_baseline',
    label: 'Existing narrow boot-field restore',
    restoreMode: 'fields',
    carryD02505: false,
    zeroD02505AfterRestore: false,
    expectedOwnerD02505: 0x00,
    expectedCount: 0x24E0,
    expectedOutcome: 'bad-owner',
  },
  {
    id: 'narrow_fields_plus_d02505',
    label: 'Existing narrow restore plus only D02505',
    restoreMode: 'fields',
    carryD02505: true,
    zeroD02505AfterRestore: false,
    expectedOwnerD02505: 0x0A,
    expectedCount: 0x1C20,
    expectedOutcome: 'safe-owner',
  },
  {
    id: 'full_boundary_snapshot',
    label: 'Full RAM boundary restore, no explicit D02505 patch',
    restoreMode: 'full',
    carryD02505: false,
    zeroD02505AfterRestore: false,
    expectedOwnerD02505: 0x0A,
    expectedCount: 0x1C20,
    expectedOutcome: 'overbroad-05e814-clearer',
  },
  {
    id: 'full_boundary_minus_d02505',
    label: 'Full RAM boundary restore with only D02505 zeroed',
    restoreMode: 'full',
    carryD02505: false,
    zeroD02505AfterRestore: true,
    expectedOwnerD02505: 0x00,
    expectedCount: 0x24E0,
    expectedOutcome: 'overbroad-05e814-clearer',
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

function fillSentinel(mem, start, bytes) {
  mem.fill(0xFF, start, start + bytes);
}

function readCaptureValue(capture, addr, len) {
  const offset = addr - RAM_BASE;
  if (offset < 0 || offset + len > capture.length) return null;
  let value = 0;
  for (let i = 0; i < len; i += 1) value |= (capture[offset + i] ?? 0) << (8 * i);
  return value >>> 0;
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

function formatCpuSnapshot(row) {
  return {
    ...row,
    pc: hex(row.pc),
    currentBlockPc: hex(row.currentBlockPc),
    sp: hex(row.sp),
    ix: hex(row.ix),
    iy: hex(row.iy),
    af: hex(row.af, 4),
    bc: hex(row.bc),
    de: hex(row.de),
    hl: hex(row.hl),
    fields: formatFields(row.fields),
  };
}

function captureFieldSnapshot(mem, fields) {
  return fields.map(([name, addr, len]) => ({
    name,
    addr,
    len,
    value: readValue(mem, addr, len),
    bytes: Array.from(mem.slice(addr, addr + len)),
  }));
}

function restoreFieldSnapshot(mem, snapshot) {
  for (const field of snapshot) {
    for (let i = 0; i < field.len; i += 1) mem[field.addr + i] = field.bytes[i] ?? 0;
  }
}

function makeTrace(caseId) {
  return {
    caseId,
    phase: 'init',
    globalBlock: 0,
    phaseBlock: 0,
    recentPcs: [],
    branchHits: [],
    writeEvents: [],
    lddrSamples: [],
  };
}

function pushRecent(trace, pc) {
  trace.recentPcs.push(pc & 0xFFFFFF);
  if (trace.recentPcs.length > 128) trace.recentPcs.shift();
}

function recordBranchHit(trace, mem, cpu, pc, mode) {
  const label = TARGET_PCS.get(pc);
  if (!label) return;
  trace.branchHits.push({
    label,
    pc,
    mode,
    phase: trace.phase,
    globalBlock: trace.globalBlock,
    phaseBlock: trace.phaseBlock,
    cpu: compactCpu(cpu, mem),
    recentPcs: [...trace.recentPcs],
  });
}

function installWriteTrace(cpu, mem, trace) {
  const originalWrite8 = cpu.write8.bind(cpu);
  const originalWrite16 = cpu.write16.bind(cpu);
  const originalWrite24 = cpu.write24.bind(cpu);

  const pushWrite = (kind, addr, beforeValue) => {
    trace.writeEvents.push({
      kind,
      phase: trace.phase,
      globalBlock: trace.globalBlock,
      phaseBlock: trace.phaseBlock,
      blockPc: cpu._currentBlockPc & 0xFFFFFF,
      pc: cpu.pc & 0xFFFFFF,
      addr,
      beforeValue,
      afterValue: mem[addr] ?? 0,
      cpu: compactCpu(cpu, mem),
      recentPcs: [...trace.recentPcs],
    });
  };

  const recordCoveredBytes = (kind, addr, byteCount, beforeBytes) => {
    for (const watched of WATCH_WRITE_ADDRS) {
      const offset = watched - (addr & 0xFFFFFF);
      if (offset < 0 || offset >= byteCount) continue;
      pushWrite(kind, watched, beforeBytes[offset] ?? 0);
    }
  };

  cpu.write8 = (addr, value) => {
    const normalized = addr & 0xFFFFFF;
    const before = mem[normalized] ?? 0;
    originalWrite8(addr, value);
    if (WATCH_WRITE_ADDRS.has(normalized)) pushWrite('write8', normalized, before);
  };

  cpu.write16 = (addr, value) => {
    const normalized = addr & 0xFFFFFF;
    const beforeBytes = [mem[normalized] ?? 0, mem[(normalized + 1) & 0xFFFFFF] ?? 0];
    originalWrite16(addr, value);
    recordCoveredBytes('write16', normalized, 2, beforeBytes);
  };

  cpu.write24 = (addr, value) => {
    const normalized = addr & 0xFFFFFF;
    const beforeBytes = [
      mem[normalized] ?? 0,
      mem[(normalized + 1) & 0xFFFFFF] ?? 0,
      mem[(normalized + 2) & 0xFFFFFF] ?? 0,
    ];
    originalWrite24(addr, value);
    recordCoveredBytes('write24', normalized, 3, beforeBytes);
  };

  return {
    uninstall() {
      cpu.write8 = originalWrite8;
      cpu.write16 = originalWrite16;
      cpu.write24 = originalWrite24;
    },
  };
}

function makeFreshMachine(trace) {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, MEM_SIZE));
  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals, trackMemoryMapped: true });
  const writeHook = installWriteTrace(executor.cpu, mem, trace);
  return { mem, peripherals, executor, cpu: executor.cpu, writeHook };
}

function runWithTrace(machine, trace, phase, startAddress, mode, opts = {}) {
  const { executor, mem, cpu } = machine;
  const userOnBlock = opts.onBlock;
  trace.phase = phase;
  trace.phaseBlock = 0;
  return executor.runFrom(startAddress, mode, {
    ...opts,
    onBlock(pc, blockMode, meta, steps) {
      trace.globalBlock += 1;
      trace.phaseBlock += 1;
      const addr = pc & 0xFFFFFF;
      pushRecent(trace, addr);
      recordBranchHit(trace, mem, cpu, addr, blockMode);
      if (userOnBlock) userOnBlock(pc, blockMode, meta, steps);
    },
  });
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

function runBootToPhase5Ready(machine, trace) {
  const { mem, peripherals, cpu } = machine;
  const phases = [];

  phases.push({ name: 'p1-coldboot', result: runWithTrace(machine, trace, 'p1-coldboot', 0x000000, 'z80', { maxSteps: 20000, maxLoopIterations: 32 }) });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  fillSentinel(mem, cpu.sp, 3);
  phases.push({ name: 'p2-kernel', result: runWithTrace(machine, trace, 'p2-kernel', OUTER_LOOP, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 }) });

  cpu.madl = 1;
  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  fillSentinel(mem, cpu.sp, 3);
  phases.push({ name: 'p3-postinit', result: runWithTrace(machine, trace, 'p3-postinit', 0x0802B2, 'adl', { maxSteps: 100, maxLoopIterations: 32 }) });

  cpu.halted = false;
  cpu.iff1 = 1;
  cpu.iff2 = 1;
  cpu._iy = 0xD00080;
  cpu.mbase = 0xD0;
  cpu.sp = STACK_TOP - 12;
  fillSentinel(mem, cpu.sp, 12);
  phases.push({ name: 'p4-warm-idle', result: runWithTrace(machine, trace, 'p4-warm-idle', WARM_IDLE, 'adl', { maxSteps: 1500000, maxLoopIterations: 100000 }) });

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

  return phases;
}

function runPhase5(machine, trace) {
  const { mem } = machine;
  const targetCounts = { launchHome09dd62: 0, clear001879: 0, cleanup0018f8: 0, halt0019b5: 0 };
  let boundarySnapshot = null;

  const result = runWithTrace(machine, trace, 'p5-launch-home-09dd62', LAUNCH_HOME, 'adl', {
    maxSteps: 300000,
    maxLoopIterations: 30000,
    onBlock(pc) {
      const addr = pc & 0xFFFFFF;
      if (addr === LAUNCH_HOME) targetCounts.launchHome09dd62 += 1;
      if (addr === 0x001879) {
        targetCounts.clear001879 += 1;
        if (!boundarySnapshot && readValue(mem, 0xD02590, 3) !== 0) {
          boundarySnapshot = {
            block: trace.globalBlock,
            pc: addr,
            fields: captureFieldSnapshot(mem, BOOT_SNAPSHOT_FIELDS),
            fullRam: mem.slice(RAM_BASE, RAM_BASE + FULL_BOUNDARY_BYTES),
            watchedFields: readFields(mem),
          };
        }
      }
      if (addr === 0x0018F8) targetCounts.cleanup0018f8 += 1;
      if (addr === HALT_IDLE) targetCounts.halt0019b5 += 1;
    },
  });

  return {
    result,
    targetCounts,
    boundarySnapshot,
    finalFields: readFields(mem),
  };
}

function runRepaint(machine, trace) {
  const { mem, peripherals, cpu } = machine;
  const counts = { homeRepaint058241: 0, cleanup0018f8: 0, halt0019b5: 0 };
  prepareEventFrame(mem, peripherals, cpu);
  const result = runWithTrace(machine, trace, 'p6-home-repaint-058241', HOME_REPAINT, 'adl', {
    maxSteps: 300000,
    maxLoopIterations: 30000,
    onBlock(pc) {
      const addr = pc & 0xFFFFFF;
      if (addr === HOME_REPAINT) counts.homeRepaint058241 += 1;
      if (addr === 0x0018F8) counts.cleanup0018f8 += 1;
      if (addr === HALT_IDLE) counts.halt0019b5 += 1;
    },
  });
  return { result, counts, fields: readFields(mem) };
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

function installLddrTrace(cpu, mem, trace) {
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
      trace.lddrSamples.push({
        label: logicalPc === 0x0A31C1 ? 'lddr-0a31c1' : 'lddr-0a31f2',
        logicalPc,
        blockPc,
        phase: trace.phase,
        globalBlock: trace.globalBlock,
        phaseBlock: trace.phaseBlock,
        before,
        after,
        copyPlan: deriveCopyPlan(before, after),
        recentPcs: [...trace.recentPcs],
      });
    }
  };
  return {
    uninstall() {
      cpu.lddr = originalLddr;
    },
  };
}

function runClearToOwner(machine, trace) {
  const { mem, peripherals, cpu } = machine;
  prepareEventFrame(mem, peripherals, cpu);
  seedClear(mem, peripherals);
  const seededFields = readFields(mem);
  const lddrHook = installLddrTrace(cpu, mem, trace);
  let previousPc = null;
  let rawResult = null;
  let stopReason = null;

  try {
    rawResult = runWithTrace(machine, trace, 'p7-clear-outer-loop-to-owner', OUTER_LOOP, 'adl', {
      maxSteps: 100000,
      maxLoopIterations: 100000,
      diHaltBypass: true,
      diHaltBypassEntry: OUTER_LOOP,
      onBlock(pc) {
        const addr = pc & 0xFFFFFF;
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
        steps: trace.phaseBlock,
        termination: error.reason,
        lastPc: cpu._currentBlockPc & 0xFFFFFF,
        lastMode: 'adl',
      };
    } else {
      throw error;
    }
  } finally {
    lddrHook.uninstall();
  }

  return {
    result: rawResult,
    stopReason,
    seededFields,
    finalFields: readFields(mem),
  };
}

function restoreBoundary(caseConfig, mem, snapshot) {
  if (caseConfig.restoreMode === 'full') {
    mem.set(snapshot.fullRam, RAM_BASE);
  } else {
    restoreFieldSnapshot(mem, snapshot.fields);
  }

  const beforeTweaks = readFields(mem);
  const tweaks = [];
  if (caseConfig.carryD02505) {
    tweaks.push({ addr: 0xD02505, before: mem[0xD02505] ?? 0, after: snapshot.watchedFields.D02505, reason: 'carry boundary D02505' });
    mem[0xD02505] = snapshot.watchedFields.D02505 & 0xFF;
  }
  if (caseConfig.zeroD02505AfterRestore) {
    tweaks.push({ addr: 0xD02505, before: mem[0xD02505] ?? 0, after: 0x00, reason: 'zero only D02505 after full restore' });
    mem[0xD02505] = 0x00;
  }

  return {
    beforeTweaks,
    afterTweaks: readFields(mem),
    tweaks: tweaks.map((row) => ({
      ...row,
      addr: hex(row.addr),
      before: hex(row.before, 2),
      after: hex(row.after, 2),
    })),
  };
}

function runCase(caseConfig) {
  const trace = makeTrace(caseConfig.id);
  const machine = makeFreshMachine(trace);
  const { mem, cpu } = machine;
  const phases = [];

  let phase5;
  let restore;
  let repaint;
  let clearRoute;

  try {
    phases.push(...runBootToPhase5Ready(machine, trace));
    phase5 = runPhase5(machine, trace);
    phases.push({ name: 'p5-launch-home', result: phase5.result });
    if (!phase5.boundarySnapshot) throw new Error(`phase5 boundary snapshot not captured for ${caseConfig.id}`);

    restore = restoreBoundary(caseConfig, mem, phase5.boundarySnapshot);
    repaint = runRepaint(machine, trace);
    phases.push({ name: 'p6-home-repaint', result: repaint.result });

    rearmCxMain(mem);
    write24(mem, 0xD0243A, 0xD1A8CC);
    write24(mem, 0xD0243D, 0xD2A83E);
    writeValue(mem, 0xD02A29, 2, 0x0000);
    const afterManualSetup = readFields(mem);

    clearRoute = runClearToOwner(machine, trace);
    phases.push({ name: 'p7-clear-outer-loop-to-owner', result: clearRoute.result });

    const ownerHit = trace.branchHits.find((hit) => hit.pc === 0x0A31FD) ?? null;
    const ownerD02505 = ownerHit?.cpu.fields.D02505 ?? readValue(mem, 0xD02505, 1);
    const copy0A31F2 = trace.lddrSamples.find((sample) => sample.logicalPc === 0x0A31F2) ?? null;
    const copyPlan = copy0A31F2?.copyPlan ?? null;
    const zeroedCriticalFields = CRITICAL_FIELDS.filter((name) => clearRoute.finalFields[name] === 0);
    const safeGeometry = copyPlan?.count === 0x1C20
      && copyPlan.sourceStart === 0xD0330E
      && copyPlan.destStart === 0xD0362E;
    const badGeometry = copyPlan?.count === 0x24E0
      && copyPlan.sourceStart === 0xD00B0E
      && copyPlan.destStart === 0xD00E2E;
    const afterRestoreWrites = trace.writeEvents.filter((event) => {
      if (event.addr !== 0xD02505) return false;
      return ['p6-home-repaint-058241', 'p7-clear-outer-loop-to-owner'].includes(event.phase);
    });
    const postRestoreWritesTo0A = afterRestoreWrites.filter((event) => event.afterValue === 0x0A);
    const hit058d65 = trace.branchHits.filter((hit) => hit.pc === 0x058D65).length;
    const hit05E814Writes = afterRestoreWrites.filter((event) => event.blockPc === 0x05E814).length;
    const reachedBoundedOwner = clearRoute.result.termination === 'captured-0a31e2-to-0a31a2' && Boolean(ownerHit);
    let pass;
    if (caseConfig.expectedOutcome === 'overbroad-05e814-clearer') {
      pass = hit05E814Writes > 0
        && hit058d65 === 0
        && postRestoreWritesTo0A.length === 0
        && ownerD02505 === 0x00
        && !safeGeometry;
    } else {
      pass = reachedBoundedOwner
        && ownerD02505 === caseConfig.expectedOwnerD02505
        && copyPlan?.count === caseConfig.expectedCount
        && (caseConfig.expectedOutcome === 'safe-owner'
          ? safeGeometry && zeroedCriticalFields.length === 0 && hit058d65 === 0 && postRestoreWritesTo0A.length === 0
          : badGeometry);
    }

    return {
      id: caseConfig.id,
      label: caseConfig.label,
      pass,
      restoreMode: caseConfig.restoreMode,
      carryD02505: caseConfig.carryD02505,
      zeroD02505AfterRestore: caseConfig.zeroD02505AfterRestore,
      phases: phases.map((phase) => ({ name: phase.name, result: formatRunResult(phase.result) })),
      phase5: {
        result: formatRunResult(phase5.result),
        targetCounts: phase5.targetCounts,
        boundarySnapshot: {
          block: phase5.boundarySnapshot.block,
          pc: hex(phase5.boundarySnapshot.pc),
          watchedFields: formatFields(phase5.boundarySnapshot.watchedFields),
          fullBoundaryBytes: FULL_BOUNDARY_BYTES,
        },
        finalFields: formatFields(phase5.finalFields),
      },
      restore: {
        beforeTweaks: formatFields(restore.beforeTweaks),
        afterTweaks: formatFields(restore.afterTweaks),
        tweaks: restore.tweaks,
      },
      repaint: {
        result: formatRunResult(repaint.result),
        counts: repaint.counts,
        fields: formatFields(repaint.fields),
      },
      afterManualSetup: formatFields(afterManualSetup),
      clearRoute: {
        result: formatRunResult(clearRoute.result),
        stopReason: clearRoute.stopReason,
        seededFields: formatFields(clearRoute.seededFields),
        finalFields: formatFields(clearRoute.finalFields),
      },
      checks: {
        ownerD02505: hex(ownerD02505, 2),
        expectedOwnerD02505: hex(caseConfig.expectedOwnerD02505, 2),
        copyPlan: formatCopyPlan(copyPlan),
        expectedCount: hex(caseConfig.expectedCount, 4),
        safeGeometry,
        badGeometry,
        zeroedCriticalFields,
        hit058d65,
        hit05E814Writes,
        reachedBoundedOwner,
        postRestoreD02505Writes: afterRestoreWrites.length,
        postRestoreWritesTo0A: postRestoreWritesTo0A.length,
      },
      postRestoreWriteEvents: afterRestoreWrites.map(formatWriteEvent),
      branchHits: trace.branchHits.map(formatBranchHit),
      lddrSamples: trace.lddrSamples.map(formatLddrSample),
      writeSummary: summarizeWrites(trace.writeEvents),
    };
  } finally {
    machine.writeHook.uninstall();
  }
}

function summarizeWrites(events) {
  const rows = {};
  for (const event of events) {
    const key = `${event.phase}:${hex(event.addr)}`;
    if (!rows[key]) rows[key] = { phase: event.phase, addr: hex(event.addr), count: 0, transitions: [] };
    rows[key].count += 1;
    rows[key].transitions.push(`${hex(event.beforeValue, 2)}->${hex(event.afterValue, 2)}@${hex(event.blockPc)}`);
  }
  return Object.values(rows);
}

function formatWriteEvent(event) {
  return {
    ...event,
    blockPc: hex(event.blockPc),
    pc: hex(event.pc),
    addr: hex(event.addr),
    beforeValue: hex(event.beforeValue, 2),
    afterValue: hex(event.afterValue, 2),
    cpu: formatCpuSnapshot(event.cpu),
    recentPcs: event.recentPcs.slice(-16).map((pc) => hex(pc)),
  };
}

function formatBranchHit(hit) {
  return {
    ...hit,
    pc: hex(hit.pc),
    cpu: formatCpuSnapshot(hit.cpu),
    recentPcs: hit.recentPcs.slice(-16).map((pc) => hex(pc)),
  };
}

function formatLddrSample(sample) {
  return {
    ...sample,
    logicalPc: hex(sample.logicalPc),
    blockPc: hex(sample.blockPc),
    before: formatCpuSnapshot(sample.before),
    after: formatCpuSnapshot(sample.after),
    copyPlan: formatCopyPlan(sample.copyPlan),
    recentPcs: sample.recentPcs.slice(-16).map((pc) => hex(pc)),
  };
}

function summarizeRealCapture() {
  return Object.fromEntries(WATCHED_FIELDS.map(([name, addr, len]) => [name, {
    pre: readCaptureValue(preClearRam, addr, len),
    after: readCaptureValue(afterClearRam, addr, len),
    len,
  }]));
}

function formatRealCapture(row) {
  return Object.fromEntries(Object.entries(row).map(([name, value]) => [name, {
    pre: value.pre == null ? null : hex(value.pre, value.len * 2),
    after: value.after == null ? null : hex(value.after, value.len * 2),
  }]));
}

function caseTable(cases) {
  return [
    '| Case | Pass | Restore | Owner D02505 | 0x0A31F2 count | Source | Dest | 0x058D65 hits | 0x05E814 writes | Post-restore D02505 writes | Critical zeroed |',
    '| --- | --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | --- |',
    ...cases.map((row) => {
      const plan = row.checks.copyPlan;
      return `| ${row.id} | ${row.pass ? 'yes' : 'no'} | ${row.restoreMode}${row.carryD02505 ? ' + D02505' : ''}${row.zeroD02505AfterRestore ? ' - D02505' : ''} | ${row.checks.ownerD02505} | ${plan?.count ?? '-'} | ${plan?.sourceStart ?? '-'} | ${plan?.destStart ?? '-'} | ${row.checks.hit058d65} | ${row.checks.hit05E814Writes} | ${row.checks.postRestoreD02505Writes} | ${row.checks.zeroedCriticalFields.length ? row.checks.zeroedCriticalFields.join(', ') : 'none'} |`;
    }),
  ].join('\n');
}

function buildReport(summary) {
  const fullCase = summary.cases.find((row) => row.id === 'full_boundary_snapshot');
  const minusCase = summary.cases.find((row) => row.id === 'full_boundary_minus_d02505');
  const carryCase = summary.cases.find((row) => row.id === 'narrow_fields_plus_d02505');
  return [
    '# Phase 855: D02505 Natural Lifecycle Mechanism',
    '',
    'Probe: `probe-phase855-d02505-natural-lifecycle.mjs`  ',
    'Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase855-d02505-natural-lifecycle.mjs`',
    '',
    '## Summary',
    '',
    `- Result: ${summary.pass ? 'PASS' : 'FAIL'}. A selective boundary carry of \`D02505=0x0A\` reaches \`0x0A31FD\` safely; no \`0x0A31FD\` patch and no post-restore \`0x058D65\` rewrite are involved.`,
    `- Real captures hold \`D02505=${summary.realCapture.D02505.pre}\` before CLEAR and \`${summary.realCapture.D02505.after}\` after CLEAR.`,
    `- The selective carry case reached owner \`${carryCase?.checks.ownerD02505 ?? '-'}\` with safe geometry \`${carryCase?.checks.copyPlan?.count ?? '-'}\`, \`${carryCase?.checks.copyPlan?.sourceStart ?? '-'} -> ${carryCase?.checks.copyPlan?.destStart ?? '-'}\`, \`${carryCase?.checks.hit058d65 ?? '-'}\` hits at \`0x058D65\`, and \`${carryCase?.checks.postRestoreWritesTo0A ?? '-'}\` post-restore writes of \`0x0A\`.`,
    `- Full RAM boundary restore is over-broad: it hits \`0x05E814\` ${fullCase?.checks.hit05E814Writes ?? '-'} time(s), clearing \`D02505\` before the scroll owner; the full-minus-D02505 control behaves the same (${minusCase?.checks.hit05E814Writes ?? '-'} \`0x05E814\` write(s)).`,
    `- Classification: ${summary.classification}`,
    '',
    '## Case Comparison',
    '',
    caseTable(summary.cases),
    '',
    '## Boundary State',
    '',
    '```json',
    JSON.stringify(summary.boundaryState, null, 2),
    '```',
    '',
    '## Post-Restore D02505 Writes',
    '',
    '```json',
    JSON.stringify(Object.fromEntries(summary.cases.map((row) => [row.id, row.postRestoreWriteEvents])), null, 2),
    '```',
    '',
    '## Owner / Rewriter Hits',
    '',
    '```json',
    JSON.stringify(Object.fromEntries(summary.cases.map((row) => [row.id, row.branchHits.filter((hit) => [
      'candidate-rewriter-entry-058d54',
      'candidate-rewriter-z-branch-058d60',
      'candidate-rewriter-store-d02505-058d65',
      'candidate-rewriter-cleanup-ret-058d89',
      'edit-buffer-ldir-clearer-05e814',
      'd02505-owner-boundary-0a31fd',
      'destructive-copy-owner-0a31e2',
      'post-copy-tail-0a31a2',
    ].includes(hit.label))])), null, 2),
    '```',
    '',
    '## LDDR Samples',
    '',
    '```json',
    JSON.stringify(Object.fromEntries(summary.cases.map((row) => [row.id, row.lddrSamples])), null, 2),
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
  const baseline = cases.find((row) => row.id === 'narrow_fields_baseline');
  const carry = cases.find((row) => row.id === 'narrow_fields_plus_d02505');
  const full = cases.find((row) => row.id === 'full_boundary_snapshot');
  const minus = cases.find((row) => row.id === 'full_boundary_minus_d02505');
  const pass = cases.every((row) => row.pass)
    && realCapture.D02505.pre === '0x0A'
    && realCapture.D02505.after === '0x0A'
    && baseline?.checks.badGeometry
    && carry?.checks.safeGeometry
    && carry?.checks.hit058d65 === 0
    && carry?.checks.postRestoreWritesTo0A === 0
    && full?.checks.hit05E814Writes > 0
    && full?.checks.hit058d65 === 0
    && full?.checks.postRestoreWritesTo0A === 0
    && minus?.checks.hit05E814Writes > 0;

  const classification = pass
    ? 'selective snapshot omission at the clear/snapshot boundary. The stable boot snapshot omits D02505, while preserving exactly that byte reaches the safe owner geometry without the skipped 0x058D65 rewriter. Full RAM restore is not the mechanism: it is over-broad and triggers the 0x05E814 LDIR clearer before the scroll owner.'
    : 'inconclusive; inspect case JSON before prioritizing Phase856.';

  return {
    pass,
    realCapture,
    cases,
    classification,
    boundaryState: {
      realCaptureD02505: realCapture.D02505,
      firstCasePhase5Boundary: baseline?.phase5.boundarySnapshot ?? null,
      firstCasePhase5Final: baseline?.phase5.finalFields ?? null,
      fullBoundaryRestoreBeforeTweaks: full?.restore.beforeTweaks ?? null,
      fullBoundaryRestoreAfterTweaks: full?.restore.afterTweaks ?? null,
    },
    machine: {
      probe: 'phase855-d02505-natural-lifecycle',
      pass,
      checks: {
        realCaptureKeepsD02505: realCapture.D02505.pre === '0x0A' && realCapture.D02505.after === '0x0A',
        narrowBaselineBad: Boolean(baseline?.checks.badGeometry),
        narrowPlusD02505Safe: Boolean(carry?.checks.safeGeometry),
        narrowPlusD02505Skipped058D65: carry?.checks.hit058d65 === 0,
        narrowPlusD02505NoPostRestoreRewrite: carry?.checks.postRestoreWritesTo0A === 0,
        fullBoundaryHit05E814Clearer: full?.checks.hit05E814Writes > 0,
        fullBoundarySkipped058D65: full?.checks.hit058d65 === 0,
        fullBoundaryNoPostRestoreRewriteTo0A: full?.checks.postRestoreWritesTo0A === 0,
        fullMinusD02505AlsoHit05E814: minus?.checks.hit05E814Writes > 0,
      },
      classification,
    },
  };
}

try {
  console.log('phase855: D02505 natural lifecycle mechanism');
  const summary = runProbe();
  fs.writeFileSync(REPORT_PATH, `${buildReport(summary)}\n`);
  console.log(JSON.stringify({
    probe: summary.machine.probe,
    pass: summary.pass,
    checks: summary.machine.checks,
    classification: summary.classification,
    caseMetrics: summary.cases.map((row) => ({
      id: row.id,
      pass: row.pass,
      ownerD02505: row.checks.ownerD02505,
      count: row.checks.copyPlan?.count ?? null,
      source: row.checks.copyPlan?.sourceStart ?? null,
      dest: row.checks.copyPlan?.destStart ?? null,
      hit058d65: row.checks.hit058d65,
      hit05E814Writes: row.checks.hit05E814Writes,
      postRestoreD02505Writes: row.checks.postRestoreD02505Writes,
      postRestoreWritesTo0A: row.checks.postRestoreWritesTo0A,
      zeroedCriticalFields: row.checks.zeroedCriticalFields,
    })),
    report: path.basename(REPORT_PATH),
  }, null, 2));
  if (!summary.pass) process.exitCode = 1;
} catch (error) {
  const message = String(error?.stack || error);
  fs.writeFileSync(REPORT_PATH, [
    '# Phase 855: D02505 Natural Lifecycle Mechanism',
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
