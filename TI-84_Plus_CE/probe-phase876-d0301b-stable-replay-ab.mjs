import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase876-d0301b-stable-replay-ab.md');
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');
const BROWSER_SHELL_PATH = path.join(__dirname, 'browser-shell.html');
const AFTER_CLEAR_CAPTURE = path.join(__dirname, 'captures', 'realram-home-afterCLEAR-D00000-D657FF.bin');

const MEM_SIZE = 0x1000000;
const RAM_BASE = 0xD00000;
const STACK_TOP = 0xD1A87E;
const OUTER_LOOP = 0x08C331;
const WARM_IDLE = 0x0019BE;
const HALT_IDLE = 0x0019B5;
const LAUNCH_HOME = 0x09DD62;
const HOME_REPAINT = 0x058241;
const CLEAR_SCAN = 0x0F;
const D0301B = 0xD0301B;
const D0301B_MAGIC = 0x5AA55A;
const CLEAR_MAX_STEPS = 100000;

const romBytes = fs.readFileSync(ROM_PATH);
const afterClearRam = fs.readFileSync(AFTER_CLEAR_CAPTURE);
const browserShell = fs.readFileSync(BROWSER_SHELL_PATH, 'utf8');
const romModule = await import(pathToFileURL(TRANSPILED_PATH).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const BROWSER_STABLE_REPLAY_FIELDS = Object.freeze([
  ['D007CA', 0xD007CA, 3],
  ['D008E0', 0xD008E0, 3],
  ['D02505', 0xD02505, 1],
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
  ['D007CA', 0xD007CA, 3],
  ['D008E0', 0xD008E0, 3],
  ['D010EF', 0xD010EF, 3],
  ['D010FE', 0xD010FE, 3],
  ['D010F4', 0xD010F4, 1],
  ['D02317', 0xD02317, 3],
  ['D0231A', 0xD0231A, 3],
  ['D0231D', 0xD0231D, 3],
  ['D02437', 0xD02437, 3],
  ['D0243A', 0xD0243A, 3],
  ['D0243D', 0xD0243D, 3],
  ['D02440', 0xD02440, 3],
  ['D02505', 0xD02505, 1],
  ['D02590', 0xD02590, 3],
  ['D0259D', 0xD0259D, 3],
  ['D02A29', 0xD02A29, 2],
  ['D0301B', D0301B, 3],
  ['D000C2_IY42', 0xD000C2, 1],
]);

const EDIT_VAT_ORACLE_FIELDS = Object.freeze([
  'D007CA', 'D02437', 'D0243A', 'D0243D', 'D02440',
  'D02505', 'D02590', 'D0259D', 'D02A29', 'D0301B',
]);

const GAP_FIELDS = Object.freeze(['D010EF', 'D010FE', 'D010F4', 'D008E0']);

const TARGETS = Object.freeze({
  launchHome09DD62: 0x09DD62,
  phase5PreWipe001879: 0x001879,
  clearCaller058A16: 0x058A16,
  clearEntry0A223A: 0x0A223A,
  anchor0A229D: 0x0A229D,
  liveSpin0A1854: 0x0A1854,
  portBranch001872: 0x001872,
  portSkip0018AF: 0x0018AF,
  sentinelBlock0018D7: 0x0018D7,
  largeClear001881: 0x001881,
  shortTail0018EC: 0x0018EC,
  cleanup0018F8: 0x0018F8,
  poll006D64: 0x006D64,
});

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

function readCaptureValue(buffer, addr, len) {
  const offset = addr - RAM_BASE;
  if (offset < 0 || offset + len > buffer.length) return null;
  return readValue(buffer, offset, len);
}

function fillSentinel(mem, start, bytes) {
  mem.fill(0xFF, start, start + bytes);
}

function valueWidth(name) {
  if (name === 'D010F4' || name === 'D02505' || name === 'D000C2_IY42') return 2;
  if (name === 'D02A29') return 4;
  return 6;
}

function formatFieldValue(name, value) {
  return hex(value, valueWidth(name));
}

function readFields(mem) {
  return Object.fromEntries(WATCHED_FIELDS.map(([name, addr, len]) => [name, readValue(mem, addr, len)]));
}

function readCaptureFields(buffer) {
  return Object.fromEntries(WATCHED_FIELDS.map(([name, addr, len]) => [name, readCaptureValue(buffer, addr, len)]));
}

function formatFields(fields) {
  return Object.fromEntries(
    Object.entries(fields ?? {}).map(([name, value]) => [name, formatFieldValue(name, value)]),
  );
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

function applyPatches(mem, patches) {
  for (const patch of patches ?? []) writeValue(mem, patch.addr, patch.len, patch.value);
}

function patchSummary(patches) {
  return (patches ?? []).map((patch) => ({
    name: patch.name,
    addr: hex(patch.addr),
    len: patch.len,
    value: formatFieldValue(patch.name, patch.value),
    timing: patch.timing,
  }));
}

function compactCpu(cpu) {
  return {
    pc: cpu.pc & 0xFFFFFF,
    currentBlockPc: (cpu._currentBlockPc ?? cpu.pc) & 0xFFFFFF,
    sp: cpu.sp & 0xFFFFFF,
    af: cpu.af & 0xFFFF,
    bc: cpu.bc & 0xFFFFFF,
    de: cpu.de & 0xFFFFFF,
    hl: cpu.hl & 0xFFFFFF,
    ix: (cpu._ix ?? cpu.ix ?? 0) & 0xFFFFFF,
    iy: (cpu._iy ?? cpu.iy ?? 0) & 0xFFFFFF,
    f: cpu.f & 0xFF,
  };
}

function formatCpu(cpu) {
  if (!cpu) return null;
  return {
    pc: hex(cpu.pc),
    currentBlockPc: hex(cpu.currentBlockPc),
    sp: hex(cpu.sp),
    af: hex(cpu.af, 4),
    bc: hex(cpu.bc),
    de: hex(cpu.de),
    hl: hex(cpu.hl),
    ix: hex(cpu.ix),
    iy: hex(cpu.iy),
    f: hex(cpu.f, 2),
  };
}

function readStackSlots(mem, cpu, count = 4) {
  const sp = cpu.sp & 0xFFFFFF;
  return Array.from({ length: count }, (_, index) => {
    const addr = (sp + index * 3) & 0xFFFFFF;
    return { addr, value: readValue(mem, addr, 3) };
  });
}

function formatStack(stack) {
  return (stack ?? []).map((slot) => ({ addr: hex(slot.addr), value: hex(slot.value) }));
}

function makeRoute(label) {
  return {
    label,
    phase: 'init',
    totalBlocks: 0,
    phaseBlock: 0,
    prevPc: null,
    targetCounts: Object.fromEntries(Object.keys(TARGETS).map((name) => [name, 0])),
    targetFirst: {},
    checkpoints: [],
    rows: [],
  };
}

function snapshot(route, mem, cpu, pc, phase, prevPc = route.prevPc) {
  return {
    block: route.totalBlocks,
    phase,
    pc,
    prevPc,
    cpu: compactCpu(cpu),
    fields: readFields(mem),
    stackTop: readStackSlots(mem, cpu),
  };
}

function observeRoute(route, mem, cpu, pc, phase) {
  const addr = pc & 0xFFFFFF;
  route.phase = phase;
  route.totalBlocks += 1;
  route.phaseBlock += 1;

  for (const [name, target] of Object.entries(TARGETS)) {
    if (addr !== target) continue;
    route.targetCounts[name] += 1;
    if (!route.targetFirst[name]) route.targetFirst[name] = snapshot(route, mem, cpu, addr, phase);
  }

  if (route.rows.length < 120 && Object.values(TARGETS).includes(addr)) {
    route.rows.push(snapshot(route, mem, cpu, addr, phase));
  }

  route.prevPc = addr;
}

function checkpoint(route, mem, cpu, label) {
  route.checkpoints.push({
    label,
    atBlock: route.totalBlocks,
    phase: route.phase,
    cpu: compactCpu(cpu),
    fields: readFields(mem),
  });
}

function formatSnapshot(row) {
  if (!row) return null;
  return {
    ...row,
    pc: hex(row.pc),
    prevPc: row.prevPc == null ? null : hex(row.prevPc),
    cpu: formatCpu(row.cpu),
    fields: formatFields(row.fields),
    stackTop: formatStack(row.stackTop),
  };
}

function formatCheckpoint(point) {
  if (!point) return null;
  return {
    ...point,
    cpu: formatCpu(point.cpu),
    fields: formatFields(point.fields),
  };
}

function formatRoute(route) {
  return {
    label: route.label,
    totalBlocks: route.totalBlocks,
    targetCounts: route.targetCounts,
    targetFirst: Object.fromEntries(
      Object.entries(route.targetFirst).map(([name, row]) => [name, formatSnapshot(row)]),
    ),
    checkpoints: route.checkpoints.map(formatCheckpoint),
    sampleRows: route.rows.map(formatSnapshot),
  };
}

function makeMachine(label, initialMem = null) {
  const mem = new Uint8Array(MEM_SIZE);
  if (initialMem) mem.set(initialMem);
  else mem.set(romBytes.subarray(0, MEM_SIZE));
  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals, trackMemoryMapped: true });
  const route = makeRoute(label);
  return { mem, peripherals, executor, cpu: executor.cpu, route };
}

function runWithTrace(machine, phase, startAddress, mode, opts = {}) {
  const { executor, mem, cpu, route } = machine;
  const userOnBlock = opts.onBlock;
  route.phase = phase;
  route.phaseBlock = 0;
  return executor.runFrom(startAddress, mode, {
    ...opts,
    onBlock(pc, blockMode, meta, steps) {
      observeRoute(route, mem, cpu, pc, phase);
      userOnBlock?.(pc, blockMode, meta, steps);
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

function rearmCxMain(mem) {
  for (let i = 0; i < 21; i += 1) mem[0xD007CA + i] = romBytes[0x0585D3 + i];
  mem[0xD0008D] = romBytes[0x0585D3 + 21];
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

function seedBrowserEditContext(mem) {
  const editBase = 0xD1A8CC;
  const tokenCursor = 0xD2A83E;
  write24(mem, 0xD02317, tokenCursor);
  write24(mem, 0xD0231A, tokenCursor);
  write24(mem, 0xD0231D, tokenCursor - 1);
  mem.fill(0, 0xD02430, 0xD02460);
  write24(mem, 0xD02437, editBase);
  write24(mem, 0xD0243A, editBase);
  write24(mem, 0xD0243D, tokenCursor);
  write24(mem, 0xD02440, tokenCursor);
  write24(mem, 0xD0244D, 0xD3FE89);
  mem[0xD02455] = 0x07;
  mem[0xD0245D] = 0x01;
  mem[0xD000A3] = 0x0A;
  write24(mem, 0xD02A40, tokenCursor);
  writeValue(mem, 0xD02A29, 2, 0);
  mem.fill(0, editBase, editBase + 0x80);
  mem[0xD1A8C0] = 0x0C;
  mem[0xD1A8C1] = 0x00;
  mem[0xD1A8C2] = 0x07;
}

function formatRunResult(result) {
  return {
    steps: result?.steps ?? null,
    termination: result?.termination ?? null,
    lastPc: hex(result?.lastPc ?? 0),
    lastMode: result?.lastMode ?? null,
  };
}

function parseBrowserStableReplayFieldNames() {
  const match = browserShell.match(/const COLDBOOT_STABLE_REPLAY_FIELDS = \[([\s\S]*?)\n  \];/);
  if (!match) return { found: false, names: [] };
  const names = [...match[1].matchAll(/\['([^']+)'/g)].map((entry) => entry[1]);
  return { found: true, names };
}

function runToStableReplayBoundary() {
  const machine = makeMachine('phase876-common-stable-replay');
  const { mem, peripherals, cpu, route } = machine;
  const phases = [];

  phases.push({ name: 'p1-coldboot', result: runWithTrace(machine, 'p1-coldboot', 0x000000, 'z80', { maxSteps: 20000, maxLoopIterations: 32 }) });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  fillSentinel(mem, cpu.sp, 3);
  phases.push({ name: 'p2-kernel', result: runWithTrace(machine, 'p2-kernel', OUTER_LOOP, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 }) });

  cpu.madl = 1;
  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  fillSentinel(mem, cpu.sp, 3);
  phases.push({ name: 'p3-postinit', result: runWithTrace(machine, 'p3-postinit', 0x0802B2, 'adl', { maxSteps: 100, maxLoopIterations: 32 }) });

  cpu.halted = false;
  cpu.iff1 = 1;
  cpu.iff2 = 1;
  cpu._iy = 0xD00080;
  cpu.mbase = 0xD0;
  cpu.sp = STACK_TOP - 12;
  fillSentinel(mem, cpu.sp, 12);
  phases.push({ name: 'p4-warm-idle', result: runWithTrace(machine, 'p4-warm-idle', WARM_IDLE, 'adl', { maxSteps: 1500000, maxLoopIterations: 100000 }) });

  peripherals.setTimerEnabled(false);
  cpu.halted = false;
  cpu.iff1 = 1;
  cpu.iff2 = 1;
  cpu._iy = 0xD00080;
  cpu.mbase = 0xD0;
  cpu.sp = STACK_TOP - 24;
  fillSentinel(mem, cpu.sp, 24);
  write24(mem, cpu.sp, WARM_IDLE);
  write24(mem, 0xD008E0, cpu.sp);

  let stableSnapshot = null;
  phases.push({
    name: 'p5-launch-home',
    result: runWithTrace(machine, 'p5-launch-home', LAUNCH_HOME, 'adl', {
      maxSteps: 300000,
      maxLoopIterations: 30000,
      onBlock(pc) {
        const addr = pc & 0xFFFFFF;
        if (!stableSnapshot && addr === 0x001879 && readValue(mem, 0xD02590, 3) !== 0) {
          stableSnapshot = {
            atBlock: route.totalBlocks,
            replayFields: captureFieldSnapshot(mem, BROWSER_STABLE_REPLAY_FIELDS),
            watchedFields: readFields(mem),
          };
        }
      },
    }),
  });
  if (!stableSnapshot) throw new Error('stable replay boundary was not captured');

  checkpoint(route, mem, cpu, 'afterPhase5BeforeReplay');
  restoreFieldSnapshot(mem, stableSnapshot.replayFields);
  checkpoint(route, mem, cpu, 'afterCurrentStableReplay');

  return {
    phases: phases.map((phase) => ({ name: phase.name, result: formatRunResult(phase.result) })),
    stableSnapshot: {
      atBlock: stableSnapshot.atBlock,
      watchedFields: formatFields(stableSnapshot.watchedFields),
      replayFields: stableSnapshot.replayFields.map((field) => ({
        name: field.name,
        addr: hex(field.addr),
        len: field.len,
        value: formatFieldValue(field.name, field.value),
      })),
    },
    stableReplayMem: mem.slice(),
    route: formatRoute(route),
  };
}

function buildBootReadyVariant(common, variant) {
  const machine = makeMachine(`phase876-boot-${variant.name}`, common.stableReplayMem);
  const { mem, peripherals, cpu, route } = machine;

  applyPatches(mem, variant.stableReplayPatches);
  checkpoint(route, mem, cpu, 'afterStableReplayPatches');

  prepareEventFrame(mem, peripherals, cpu);
  const repaintResult = runWithTrace(machine, 'home-repaint', HOME_REPAINT, 'adl', {
    maxSteps: 300000,
    maxLoopIterations: 30000,
  });
  checkpoint(route, mem, cpu, 'afterHomeRepaint');

  seedBrowserEditContext(mem);
  checkpoint(route, mem, cpu, 'afterEditSeed');
  checkpoint(route, mem, cpu, 'afterBootReady');

  return {
    variant: variant.name,
    stableReplayPatches: patchSummary(variant.stableReplayPatches),
    repaintResult: formatRunResult(repaintResult),
    bootReadyFields: formatFields(readFields(mem)),
    bootReadyMem: mem.slice(),
    route: formatRoute(route),
  };
}

function runClearVariant(boot, variant) {
  const machine = makeMachine(`phase876-clear-${variant.name}`, boot.bootReadyMem);
  const { mem, peripherals, cpu, route } = machine;

  if (!peripherals.register) throw new Error('peripheral bus has no register() API for port override');
  peripherals.register(0x03, {
    read() { return 0xFE; },
    write() {},
  });

  rearmCxMain(mem);
  prepareEventFrame(mem, peripherals, cpu);
  seedClear(mem, peripherals);
  applyPatches(mem, variant.beforeClearPatches);
  checkpoint(route, mem, cpu, 'beforeClearRun');

  const result = runWithTrace(machine, 'clear-route', OUTER_LOOP, 'adl', {
    maxSteps: CLEAR_MAX_STEPS,
    maxLoopIterations: 500000,
    diHaltBypass: true,
    diHaltBypassEntry: OUTER_LOOP,
  });
  checkpoint(route, mem, cpu, 'afterClearRun');

  return {
    result: formatRunResult(result),
    beforeClearPatches: patchSummary(variant.beforeClearPatches),
    finalFields: formatFields(readFields(mem)),
    route: formatRoute(route),
  };
}

function checkpointByLabel(route, label) {
  return route.checkpoints.find((point) => point.label === label) ?? null;
}

function fieldsMatch(fields, oracle, names) {
  return names.every((name) => fields?.[name] === oracle?.[name]);
}

function mismatches(fields, oracle, names = WATCHED_FIELDS.map(([name]) => name)) {
  return names
    .filter((name) => fields?.[name] !== oracle?.[name])
    .map((name) => ({ name, actual: fields?.[name] ?? '-', oracle: oracle?.[name] ?? '-' }));
}

function summarizeVariant(variant, boot, clear, oracleAfter) {
  const counts = clear.route.targetCounts;
  const beforeClear = checkpointByLabel(clear.route, 'beforeClearRun');
  const afterClear = checkpointByLabel(clear.route, 'afterClearRun');
  return {
    name: variant.name,
    label: variant.label,
    stableReplayPatches: boot.stableReplayPatches,
    beforeClearPatches: clear.beforeClearPatches,
    repaintResult: boot.repaintResult,
    clearResult: clear.result,
    beforeClearFields: beforeClear?.fields,
    afterClearFields: afterClear?.fields,
    finalFields: clear.finalFields,
    counts: {
      anchor0A229D: counts.anchor0A229D,
      portSkip0018AF: counts.portSkip0018AF,
      sentinelBlock0018D7: counts.sentinelBlock0018D7,
      largeClear001881: counts.largeClear001881,
      shortTail0018EC: counts.shortTail0018EC,
      cleanup0018F8: counts.cleanup0018F8,
      poll006D64: counts.poll006D64,
    },
    edges: {
      sentinel: clear.route.targetFirst.sentinelBlock0018D7
        ? `${clear.route.targetFirst.sentinelBlock0018D7.prevPc} -> ${clear.route.targetFirst.sentinelBlock0018D7.pc}`
        : '-',
      largeClear: clear.route.targetFirst.largeClear001881
        ? `${clear.route.targetFirst.largeClear001881.prevPc} -> ${clear.route.targetFirst.largeClear001881.pc}`
        : '-',
      shortTail: clear.route.targetFirst.shortTail0018EC
        ? `${clear.route.targetFirst.shortTail0018EC.prevPc} -> ${clear.route.targetFirst.shortTail0018EC.pc}`
        : '-',
      cleanup: clear.route.targetFirst.cleanup0018F8
        ? `${clear.route.targetFirst.cleanup0018F8.prevPc} -> ${clear.route.targetFirst.cleanup0018F8.pc}`
        : '-',
    },
    editVatMatchesOracle: fieldsMatch(clear.finalFields, oracleAfter, EDIT_VAT_ORACLE_FIELDS),
    allWatchedMismatches: mismatches(clear.finalFields, oracleAfter),
    gapMismatches: mismatches(clear.finalFields, oracleAfter, GAP_FIELDS),
  };
}

function analyze(common, variantRuns, oracleAfter, stableFieldInfo) {
  const variants = Object.fromEntries(variantRuns.map((run) => [run.variant.name, run.summary]));
  const baseline = variants.currentPacket;
  const d0301b = variants.d0301bReplay;
  const d010 = variants.d0301bD010Replay;

  const baselineTakesLargeWipe =
    baseline.counts.largeClear001881 > 0
    && baseline.counts.cleanup0018F8 > 0
    && baseline.counts.shortTail0018EC === 0;
  const d0301bSurvivesToClear = d0301b.beforeClearFields?.D0301B === hex(D0301B_MAGIC);
  const d0301bTakesShortTail =
    d0301b.counts.sentinelBlock0018D7 > 0
    && d0301b.counts.shortTail0018EC > 0
    && d0301b.counts.largeClear001881 === 0
    && d0301b.counts.cleanup0018F8 === 0;
  const d0301bLeavesOnlyGap = d0301b.allWatchedMismatches
    .map((row) => row.name)
    .sort()
    .join(',') === [...GAP_FIELDS].sort().join(',');
  const d010ReplayClosesD010 = ['D010EF', 'D010FE', 'D010F4'].every(
    (name) => d010.finalFields?.[name] === oracleAfter[name],
  );
  const d010ReplayStillD008E0Only = d010.allWatchedMismatches.map((row) => row.name).join(',') === 'D008E0';
  const browserPacketStillOmitsD0301B = stableFieldInfo.found && !stableFieldInfo.names.includes('D0301B');

  const pass = browserPacketStillOmitsD0301B
    && baselineTakesLargeWipe
    && d0301bSurvivesToClear
    && d0301bTakesShortTail
    && d0301b.editVatMatchesOracle
    && d0301bLeavesOnlyGap
    && d010ReplayClosesD010
    && d010ReplayStillD008E0Only;

  return {
    pass,
    browserPacketStillOmitsD0301B,
    stableBoundaryD0301B: common.stableSnapshot.watchedFields.D0301B,
    stableBoundaryD010: {
      D010EF: common.stableSnapshot.watchedFields.D010EF,
      D010FE: common.stableSnapshot.watchedFields.D010FE,
      D010F4: common.stableSnapshot.watchedFields.D010F4,
    },
    baselineTakesLargeWipe,
    d0301bSurvivesToClear,
    d0301bTakesShortTail,
    d0301bEditVatMatchesOracle: d0301b.editVatMatchesOracle,
    d0301bLeavesOnlyGap,
    d010ReplayClosesD010,
    d010ReplayStillD008E0Only,
    variants,
    conclusion: pass
      ? 'Adding D0301B=0x5AA55A to the probe-local stable replay state is causal for the unforced CLEAR route: it survives to the sentinel gate, takes 0x0018D7 -> 0x0018EC, avoids the large 0x0018F8 wipe, and preserves the edit/VAT oracle fields. D0301B alone leaves exactly the D010 mirror packet plus D008E0 as the remaining mismatch. A narrow D010 replay closes D010EF/D010FE/D010F4 and leaves only D008E0, so D008E0 is a separate stack/errSP anchor gap rather than part of the sentinel cleanup geometry.'
      : 'The stable replay A/B did not match the expected narrow pattern; inspect variant counts and mismatch tables before patching browser-shell.',
  };
}

function table(rows, columns) {
  return [
    `| ${columns.map((column) => column.label).join(' | ')} |`,
    `| ${columns.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${columns.map((column) => column.value(row) ?? '-').join(' | ')} |`),
  ].join('\n');
}

function stablePacketTable(info) {
  return table(info.names.map((name) => ({ name })), [
    { label: 'Browser Stable Replay Field', value: (row) => row.name },
  ]);
}

function variantCountsTable(variants) {
  return table(Object.values(variants), [
    { label: 'Variant', value: (row) => row.label },
    { label: 'D0301B before CLEAR', value: (row) => row.beforeClearFields?.D0301B },
    { label: '0x001881', value: (row) => String(row.counts.largeClear001881) },
    { label: '0x0018EC', value: (row) => String(row.counts.shortTail0018EC) },
    { label: '0x0018F8', value: (row) => String(row.counts.cleanup0018F8) },
    { label: '0x006D64', value: (row) => String(row.counts.poll006D64) },
    { label: 'Termination', value: (row) => row.clearResult.termination },
  ]);
}

function edgeTable(variants) {
  return table(Object.values(variants), [
    { label: 'Variant', value: (row) => row.label },
    { label: 'Sentinel block edge', value: (row) => row.edges.sentinel },
    { label: 'Large clear edge', value: (row) => row.edges.largeClear },
    { label: 'Short tail edge', value: (row) => row.edges.shortTail },
    { label: 'Cleanup edge', value: (row) => row.edges.cleanup },
  ]);
}

function mismatchTable(variants) {
  const rows = Object.values(variants).flatMap((variant) => (
    variant.allWatchedMismatches.map((row) => ({ variant: variant.label, ...row }))
  ));
  return table(rows, [
    { label: 'Variant', value: (row) => row.variant },
    { label: 'Field', value: (row) => row.name },
    { label: 'Actual', value: (row) => row.actual },
    { label: 'Oracle', value: (row) => row.oracle },
  ]);
}

function finalFieldTable(oracleAfter, variants) {
  const names = WATCHED_FIELDS.map(([name]) => name);
  return [
    `| Field | Oracle after CLEAR | ${Object.values(variants).map((variant) => variant.label).join(' | ')} |`,
    `| --- | --- | ${Object.values(variants).map(() => '---').join(' | ')} |`,
    ...names.map((name) => `| ${name} | ${oracleAfter[name]} | ${Object.values(variants).map((variant) => variant.finalFields[name]).join(' | ')} |`),
  ].join('\n');
}

function patchTable(variants) {
  const rows = Object.values(variants).flatMap((variant) => {
    const stableRows = variant.stableReplayPatches.map((patch) => ({ variant: variant.label, stage: 'stable replay', ...patch }));
    const beforeRows = variant.beforeClearPatches.map((patch) => ({ variant: variant.label, stage: 'before CLEAR', ...patch }));
    return [...stableRows, ...beforeRows];
  });
  if (rows.length === 0) return 'No probe-local patches were applied.';
  return table(rows, [
    { label: 'Variant', value: (row) => row.variant },
    { label: 'Stage', value: (row) => row.stage },
    { label: 'Field', value: (row) => row.name },
    { label: 'Address', value: (row) => row.addr },
    { label: 'Value', value: (row) => row.value },
  ]);
}

function buildReport(data) {
  if (data.error) {
    return [
      '# Phase 876: D0301B Stable Replay A/B',
      '',
      'Probe failed before producing a complete comparison.',
      '',
      '```text',
      data.error,
      '```',
      '',
    ].join('\n');
  }

  return [
    '# Phase 876: D0301B Stable Replay A/B',
    '',
    'Probe: `probe-phase876-d0301b-stable-replay-ab.mjs`  ',
    'Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase876-d0301b-stable-replay-ab.mjs`',
    '',
    '## Summary',
    '',
    `- Result: ${data.pass ? 'PASS' : 'FAIL'}.`,
    `- Browser stable replay packet still omits D0301B: ${data.analysis.browserPacketStillOmitsD0301B ? 'yes' : 'no'}.`,
    `- Baseline current packet takes the large wipe: ${data.analysis.baselineTakesLargeWipe ? 'yes' : 'no'}.`,
    `- D0301B replay survives to before-CLEAR: ${data.analysis.d0301bSurvivesToClear ? 'yes' : 'no'}.`,
    `- D0301B replay takes 0x0018D7 -> 0x0018EC and avoids 0x0018F8: ${data.analysis.d0301bTakesShortTail ? 'yes' : 'no'}.`,
    `- D0301B replay preserves edit/VAT oracle fields: ${data.analysis.d0301bEditVatMatchesOracle ? 'yes' : 'no'}.`,
    `- D0301B-only final mismatch is exactly D010EF/D010FE/D010F4/D008E0: ${data.analysis.d0301bLeavesOnlyGap ? 'yes' : 'no'}.`,
    `- Adding the D010 mirror packet closes D010EF/D010FE/D010F4: ${data.analysis.d010ReplayClosesD010 ? 'yes' : 'no'}.`,
    `- With D0301B+D010 replay, only D008E0 remains mismatched: ${data.analysis.d010ReplayStillD008E0Only ? 'yes' : 'no'}.`,
    `- Adjudication: ${data.analysis.conclusion}`,
    '',
    '## Browser Stable Replay Packet',
    '',
    stablePacketTable(data.stableFieldInfo),
    '',
    '## Probe-Local Patches',
    '',
    patchTable(data.analysis.variants),
    '',
    '## Route Counts',
    '',
    variantCountsTable(data.analysis.variants),
    '',
    '## Branch Edges',
    '',
    edgeTable(data.analysis.variants),
    '',
    '## Final Field Comparison',
    '',
    finalFieldTable(data.oracleAfter, data.analysis.variants),
    '',
    '## Final Mismatches',
    '',
    mismatchTable(data.analysis.variants),
    '',
    '## Machine JSON',
    '',
    '```json',
    JSON.stringify({
      pass: data.pass,
      analysis: data.analysis,
      common: {
        phases: data.common.phases,
        stableSnapshot: data.common.stableSnapshot,
        routeSummary: {
          totalBlocks: data.common.route.totalBlocks,
          targetCounts: data.common.route.targetCounts,
          checkpoints: data.common.route.checkpoints,
        },
      },
      variants: data.variantRuns.map((run) => ({
        variant: run.variant,
        boot: {
          stableReplayPatches: run.boot.stableReplayPatches,
          repaintResult: run.boot.repaintResult,
          bootReadyFields: run.boot.bootReadyFields,
        },
        clear: {
          beforeClearPatches: run.clear.beforeClearPatches,
          result: run.clear.result,
          finalFields: run.clear.finalFields,
          targetCounts: run.clear.route.targetCounts,
          targetFirst: run.clear.route.targetFirst,
          checkpoints: run.clear.route.checkpoints,
        },
      })),
      oracleAfter: data.oracleAfter,
    }, null, 2),
    '```',
    '',
    'No runtime, transpiler, browser-shell, decoder, peripheral, scheduler, ROM artifact, or `follow-alongs/` files were changed.',
    '',
  ].join('\n');
}

async function runProbe() {
  const oracleAfter = formatFields(readCaptureFields(afterClearRam));
  const stableFieldInfo = parseBrowserStableReplayFieldNames();
  const common = runToStableReplayBoundary();
  const d010ReplayPatches = [
    { name: 'D010EF', addr: 0xD010EF, len: 3, value: readCaptureValue(afterClearRam, 0xD010EF, 3), timing: 'stable replay' },
    { name: 'D010FE', addr: 0xD010FE, len: 3, value: readCaptureValue(afterClearRam, 0xD010FE, 3), timing: 'stable replay' },
    { name: 'D010F4', addr: 0xD010F4, len: 1, value: readCaptureValue(afterClearRam, 0xD010F4, 1), timing: 'stable replay' },
  ];
  const variants = [
    {
      name: 'currentPacket',
      label: 'current stable packet',
      stableReplayPatches: [],
      beforeClearPatches: [],
    },
    {
      name: 'd0301bReplay',
      label: 'current packet + D0301B',
      stableReplayPatches: [{ name: 'D0301B', addr: D0301B, len: 3, value: D0301B_MAGIC, timing: 'stable replay' }],
      beforeClearPatches: [],
    },
    {
      name: 'd0301bD010Replay',
      label: 'current packet + D0301B + D010 mirror',
      stableReplayPatches: [
        { name: 'D0301B', addr: D0301B, len: 3, value: D0301B_MAGIC, timing: 'stable replay' },
        ...d010ReplayPatches,
      ],
      beforeClearPatches: [],
    },
  ];

  const variantRuns = variants.map((variant) => {
    const boot = buildBootReadyVariant(common, variant);
    const clear = runClearVariant(boot, variant);
    const summary = summarizeVariant(variant, boot, clear, oracleAfter);
    return { variant, boot, clear, summary };
  });
  const analysis = analyze(common, variantRuns, oracleAfter, stableFieldInfo);

  return {
    probe: 'phase876-d0301b-stable-replay-ab',
    pass: analysis.pass,
    stableFieldInfo,
    oracleAfter,
    common,
    variantRuns,
    analysis,
  };
}

let summary;
try {
  summary = await runProbe();
  console.log(JSON.stringify({
    probe: summary.probe,
    pass: summary.pass,
    baselineTakesLargeWipe: summary.analysis.baselineTakesLargeWipe,
    d0301bSurvivesToClear: summary.analysis.d0301bSurvivesToClear,
    d0301bTakesShortTail: summary.analysis.d0301bTakesShortTail,
    d0301bLeavesOnlyGap: summary.analysis.d0301bLeavesOnlyGap,
    d010ReplayClosesD010: summary.analysis.d010ReplayClosesD010,
    d010ReplayStillD008E0Only: summary.analysis.d010ReplayStillD008E0Only,
    conclusion: summary.analysis.conclusion,
    report: path.basename(REPORT_PATH),
  }, null, 2));
  if (!summary.pass) process.exitCode = 1;
} catch (error) {
  summary = { probe: 'phase876-d0301b-stable-replay-ab', pass: false, error: String(error?.stack || error) };
  console.error(summary.error);
  process.exitCode = 1;
} finally {
  try { fs.writeFileSync(REPORT_PATH, `${buildReport(summary)}\n`); } catch {}
}
