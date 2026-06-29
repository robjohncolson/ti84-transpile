import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase878-d008e0-errsp-delta.md');
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');
const BROWSER_SHELL_PATH = path.join(__dirname, 'browser-shell.html');
const AFTER_CLEAR_CAPTURE = path.join(__dirname, 'captures', 'realram-home-afterCLEAR-D00000-D657FF.bin');

const MEM_SIZE = 0x1000000;
const RAM_BASE = 0xD00000;
const STACK_TOP = 0xD1A87E;
const EVENT_FRAME_BYTES = 24;
const RETURN_BYTES = 3;
const EVENT_FRAME_BASE = STACK_TOP - EVENT_FRAME_BYTES;
const STOCK_EVENT_ERRSP = EVENT_FRAME_BASE - RETURN_BYTES;
const OUTER_LOOP = 0x08C331;
const WARM_IDLE = 0x0019BE;
const HALT_IDLE = 0x0019B5;
const LAUNCH_HOME = 0x09DD62;
const HOME_REPAINT = 0x058241;
const CLEAR_SCAN = 0x0F;
const D008E0 = 0xD008E0;
const D010EF = 0xD010EF;
const D010FE = 0xD010FE;
const D010F4 = 0xD010F4;
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
  ['D008E0', D008E0, 3],
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
  ['D008E0', D008E0, 3],
  ['D010EF', D010EF, 3],
  ['D010FE', D010FE, 3],
  ['D010F4', D010F4, 1],
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

const TARGETS = Object.freeze({
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

function readCaptureValue(buffer, addr, len) {
  const offset = addr - RAM_BASE;
  if (offset < 0 || offset + len > buffer.length) return null;
  return readValue(buffer, offset, len);
}

function write24(mem, addr, value) {
  writeValue(mem, addr, 3, value);
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

function readStackSlots(mem, start, count = 6) {
  if (!start) return [];
  return Array.from({ length: count }, (_, index) => {
    const addr = (start + index * 3) & 0xFFFFFF;
    return { addr, value: readValue(mem, addr, 3) };
  });
}

function readCaptureStackSlots(buffer, start, count = 6) {
  if (!start) return [];
  return Array.from({ length: count }, (_, index) => {
    const addr = (start + index * 3) & 0xFFFFFF;
    return { addr, value: readCaptureValue(buffer, addr, 3) };
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
    fieldChanges: [],
    lastD008E0: null,
  };
}

function snapshot(route, mem, cpu, pc, phase, prevPc = route.prevPc) {
  const errSp = readValue(mem, D008E0, 3);
  return {
    block: route.totalBlocks,
    phase,
    pc,
    prevPc,
    cpu: compactCpu(cpu),
    fields: readFields(mem),
    errSpStack: readStackSlots(mem, errSp),
    cpuStack: readStackSlots(mem, cpu.sp & 0xFFFFFF),
  };
}

function observeRoute(route, mem, cpu, pc, phase) {
  const addr = pc & 0xFFFFFF;
  const prevPc = route.prevPc;
  route.phase = phase;
  route.totalBlocks += 1;
  route.phaseBlock += 1;

  const errSp = readValue(mem, D008E0, 3);
  if (route.lastD008E0 === null) route.lastD008E0 = errSp;
  else if (errSp !== route.lastD008E0) {
    route.fieldChanges.push({
      name: 'D008E0',
      from: route.lastD008E0,
      to: errSp,
      at: snapshot(route, mem, cpu, addr, phase, prevPc),
    });
    route.lastD008E0 = errSp;
  }

  for (const [name, target] of Object.entries(TARGETS)) {
    if (addr !== target) continue;
    route.targetCounts[name] += 1;
    if (!route.targetFirst[name]) route.targetFirst[name] = snapshot(route, mem, cpu, addr, phase);
  }

  if (route.rows.length < 80 && Object.values(TARGETS).includes(addr)) {
    route.rows.push(snapshot(route, mem, cpu, addr, phase));
  }

  route.prevPc = addr;
}

function checkpoint(route, mem, cpu, label) {
  const errSp = readValue(mem, D008E0, 3);
  route.checkpoints.push({
    label,
    atBlock: route.totalBlocks,
    phase: route.phase,
    cpu: compactCpu(cpu),
    fields: readFields(mem),
    errSpStack: readStackSlots(mem, errSp),
    cpuStack: readStackSlots(mem, cpu.sp & 0xFFFFFF),
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
    errSpStack: formatStack(row.errSpStack),
    cpuStack: formatStack(row.cpuStack),
  };
}

function formatCheckpoint(point) {
  if (!point) return null;
  return {
    ...point,
    cpu: formatCpu(point.cpu),
    fields: formatFields(point.fields),
    errSpStack: formatStack(point.errSpStack),
    cpuStack: formatStack(point.cpuStack),
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
    fieldChanges: route.fieldChanges.map((change) => ({
      name: change.name,
      from: formatFieldValue(change.name, change.from),
      to: formatFieldValue(change.name, change.to),
      at: formatSnapshot(change.at),
    })),
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

function formatFrameEvent(event) {
  return {
    ...event,
    sp: hex(event.sp),
    d008e0: hex(event.d008e0),
    cpu: formatCpu(event.cpu),
    errSpStack: formatStack(event.errSpStack),
    cpuStack: formatStack(event.cpuStack),
  };
}

function frameEvent(label, mem, cpu, note) {
  const errSp = readValue(mem, D008E0, 3);
  return {
    label,
    note,
    sp: cpu.sp & 0xFFFFFF,
    d008e0: errSp,
    cpu: compactCpu(cpu),
    errSpStack: readStackSlots(mem, errSp),
    cpuStack: readStackSlots(mem, cpu.sp & 0xFFFFFF),
  };
}

function prepareEventFrame(mem, peripherals, cpu, options = {}) {
  const events = [];
  const errSpOverride = options.errSpOverride ?? null;
  events.push(frameEvent(`${options.label ?? 'event'}: before`, mem, cpu, 'entry state before synthetic browser frame'));

  peripherals.setTimerEnabled(true);
  cpu.halted = false;
  cpu.iff1 = 1;
  cpu.iff2 = 1;
  cpu.f = 0x40;
  cpu.madl = 1;
  cpu.mbase = 0xD0;
  cpu._ix = 0xD1A860;
  cpu._iy = 0xD00080;
  cpu.sp = EVENT_FRAME_BASE;
  fillSentinel(mem, cpu.sp, EVENT_FRAME_BYTES);
  events.push(frameEvent(`${options.label ?? 'event'}: reserved`, mem, cpu, 'after SCREEN_STACK_TOP - 24 reservation'));

  cpu.sp = (cpu.sp - RETURN_BYTES) & 0xFFFFFF;
  write24(mem, cpu.sp, HALT_IDLE);
  write24(mem, D008E0, errSpOverride ?? cpu.sp);
  events.push(frameEvent(
    `${options.label ?? 'event'}: after write`,
    mem,
    cpu,
    errSpOverride == null
      ? 'stock helper wrote D008E0 to SP after pushing HALT return'
      : `diagnostic override wrote D008E0=${hex(errSpOverride)}`,
  ));
  return events.map(formatFrameEvent);
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

function parseBrowserEvidence() {
  return {
    hasReserve24: /cpu\.sp\s*=\s*SCREEN_STACK_TOP\s*-\s*24/.test(browserShell),
    hasPushReturn: /cpu\.sp\s*=\s*\(cpu\.sp\s*-\s*3\)\s*&\s*0xFFFFFF/.test(browserShell),
    hasD008E0WriteToCpuSp: /evalWrite24\(mem,\s*0xD008E0,\s*cpu\.sp\)/.test(browserShell),
    stableReplayMentionsD008E0: /COLDBOOT_STABLE_REPLAY_FIELDS[\s\S]*\['D008E0',\s*0xD008E0,\s*3\]/.test(browserShell),
  };
}

function runToStableReplayBoundary() {
  const machine = makeMachine('phase878-common-stable-boundary');
  const { mem, peripherals, cpu, route } = machine;
  const phases = [];
  const setupEvents = [];

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
  cpu.sp = EVENT_FRAME_BASE;
  fillSentinel(mem, cpu.sp, EVENT_FRAME_BYTES);
  write24(mem, cpu.sp, WARM_IDLE);
  write24(mem, D008E0, cpu.sp);
  setupEvents.push(formatFrameEvent(frameEvent('launch-home setup', mem, cpu, 'phase-5 setup writes D008E0 before the 0x001879 stable boundary')));

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
            cpu: compactCpu(cpu),
            replayFields: captureFieldSnapshot(mem, BROWSER_STABLE_REPLAY_FIELDS),
            watchedFields: readFields(mem),
            errSpStack: readStackSlots(mem, readValue(mem, D008E0, 3)),
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
    setupEvents,
    stableSnapshot: {
      atBlock: stableSnapshot.atBlock,
      cpu: formatCpu(stableSnapshot.cpu),
      watchedFields: formatFields(stableSnapshot.watchedFields),
      errSpStack: formatStack(stableSnapshot.errSpStack),
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
  const machine = makeMachine(`phase878-boot-${variant.name}`, common.stableReplayMem);
  const { mem, peripherals, cpu, route } = machine;

  applyPatches(mem, variant.stableReplayPatches);
  checkpoint(route, mem, cpu, 'afterStableReplayPatches');

  const repaintFrameEvents = prepareEventFrame(mem, peripherals, cpu, { label: 'repaint frame' });
  checkpoint(route, mem, cpu, 'afterRepaintEventFrame');
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
    repaintFrameEvents,
    repaintResult: formatRunResult(repaintResult),
    bootReadyFields: formatFields(readFields(mem)),
    bootReadyMem: mem.slice(),
    route: formatRoute(route),
  };
}

function runClearVariant(boot, variant) {
  const machine = makeMachine(`phase878-clear-${variant.name}`, boot.bootReadyMem);
  const { mem, peripherals, cpu, route } = machine;

  if (!peripherals.register) throw new Error('peripheral bus has no register() API for port override');
  peripherals.register(0x03, {
    read() { return 0xFE; },
    write() {},
  });

  rearmCxMain(mem);
  const clearFrameEvents = prepareEventFrame(mem, peripherals, cpu, {
    label: 'clear frame',
    errSpOverride: variant.clearErrSpOverride ?? null,
  });
  route.lastD008E0 = readValue(mem, D008E0, 3);
  seedClear(mem, peripherals);
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
    clearFrameEvents,
    finalFields: formatFields(readFields(mem)),
    route: formatRoute(route),
  };
}

function checkpointByLabel(route, label) {
  return route.checkpoints.find((point) => point.label === label) ?? null;
}

function mismatches(fields, oracle, names = WATCHED_FIELDS.map(([name]) => name)) {
  return names
    .filter((name) => fields?.[name] !== oracle?.[name])
    .map((name) => ({ name, actual: fields?.[name] ?? '-', oracle: oracle?.[name] ?? '-' }));
}

function summarizeVariant(variant, boot, clear, oracleAfter) {
  const beforeClear = checkpointByLabel(clear.route, 'beforeClearRun');
  const afterClear = checkpointByLabel(clear.route, 'afterClearRun');
  return {
    name: variant.name,
    label: variant.label,
    stableReplayPatches: boot.stableReplayPatches,
    clearErrSpOverride: variant.clearErrSpOverride == null ? null : hex(variant.clearErrSpOverride),
    repaintResult: boot.repaintResult,
    clearResult: clear.result,
    bootReadyD008E0: boot.bootReadyFields.D008E0,
    beforeClearFields: beforeClear?.fields,
    afterClearFields: afterClear?.fields,
    finalFields: clear.finalFields,
    finalMismatches: mismatches(clear.finalFields, oracleAfter),
    d008e0ChangesDuringClear: clear.route.fieldChanges,
    routeCounts: {
      sentinelBlock0018D7: clear.route.targetCounts.sentinelBlock0018D7,
      largeClear001881: clear.route.targetCounts.largeClear001881,
      shortTail0018EC: clear.route.targetCounts.shortTail0018EC,
      cleanup0018F8: clear.route.targetCounts.cleanup0018F8,
      poll006D64: clear.route.targetCounts.poll006D64,
    },
    clearFrameEvents: clear.clearFrameEvents,
  };
}

function analyze(common, variantRuns, oracleAfter, oracleErrSp, browserEvidence) {
  const variants = Object.fromEntries(variantRuns.map((run) => [run.variant.name, run.summary]));
  const stock = variants.stockEventFrame;
  const stable = variants.stableErrSpOverride;
  const oracle = variants.oracleErrSpOverride;

  const stableBoundaryErrSp = common.stableSnapshot.watchedFields.D008E0;
  const stockBeforeClearErrSp = stock.beforeClearFields?.D008E0;
  const stableBeforeClearErrSp = stable.beforeClearFields?.D008E0;
  const oracleBeforeClearErrSp = oracle.beforeClearFields?.D008E0;
  const stockOnlyD008E0Mismatch = stock.finalMismatches.map((row) => row.name).join(',') === 'D008E0';
  const stableStillD008E0Mismatch = stable.finalMismatches.map((row) => row.name).join(',') === 'D008E0'
    && stable.finalFields.D008E0 === stableBoundaryErrSp;
  const oracleErrSpClosesAll = oracle.finalMismatches.length === 0;
  const stockNoRomD008E0Rewrite = stock.d008e0ChangesDuringClear.length === 0;
  const oracleNoRomD008E0Rewrite = oracle.d008e0ChangesDuringClear.length === 0;
  const repaintZerosD008E0 = Object.values(variants).every((variant) => variant.bootReadyD008E0 === '0x000000');
  const browserUsesStockRecipe = browserEvidence.hasReserve24
    && browserEvidence.hasPushReturn
    && browserEvidence.hasD008E0WriteToCpuSp;
  const exactMath = {
    stackTop: hex(STACK_TOP),
    eventFrameBase: hex(EVENT_FRAME_BASE),
    stockEventErrSp: hex(STOCK_EVENT_ERRSP),
    stableBoundaryErrSp,
    oracleErrSp: hex(oracleErrSp),
    stockDeltaToOracleBytes: oracleErrSp - STOCK_EVENT_ERRSP,
    stableDeltaToOracleBytes: oracleErrSp - Number.parseInt(stableBoundaryErrSp.slice(2), 16),
  };

  const pass = browserUsesStockRecipe
    && stableBoundaryErrSp === hex(EVENT_FRAME_BASE)
    && stockBeforeClearErrSp === hex(STOCK_EVENT_ERRSP)
    && stableBeforeClearErrSp === stableBoundaryErrSp
    && oracleBeforeClearErrSp === hex(oracleErrSp)
    && stockOnlyD008E0Mismatch
    && stableStillD008E0Mismatch
    && oracleErrSpClosesAll
    && stockNoRomD008E0Rewrite
    && oracleNoRomD008E0Rewrite
    && repaintZerosD008E0;

  return {
    pass,
    browserUsesStockRecipe,
    browserEvidence,
    exactMath,
    stableBoundaryErrSp,
    stockBeforeClearErrSp,
    stableBeforeClearErrSp,
    oracleBeforeClearErrSp,
    stockOnlyD008E0Mismatch,
    stableStillD008E0Mismatch,
    oracleErrSpClosesAll,
    stockNoRomD008E0Rewrite,
    oracleNoRomD008E0Rewrite,
    repaintZerosD008E0,
    variants,
    conclusion: pass
      ? 'The D008E0 delta is caused by the probe/browser event-frame recipe. Stable replay preserves D008E0=STACK_TOP-24 (0xD1A866), but prepareColdbootEventFrame reserves 24 bytes, pushes a 3-byte HALT return, and rewrites D008E0 to STACK_TOP-27 (0xD1A863). ROM code on the bounded CLEAR route does not rewrite D008E0 afterward. A diagnostic one-field override to the real after-CLEAR oracle value STACK_TOP-18 (0xD1A86C) closes the final mismatch, while the stable-boundary value remains off by 6 bytes.'
      : 'The D008E0 lifecycle did not match the expected event-frame-only pattern; inspect the event timeline and dynamic D008E0 changes before browser work.',
  };
}

function table(rows, columns) {
  if (!rows.length) return 'No rows.';
  return [
    `| ${columns.map((column) => column.label).join(' | ')} |`,
    `| ${columns.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${columns.map((column) => column.value(row) ?? '-').join(' | ')} |`),
  ].join('\n');
}

function variantSummaryTable(variants) {
  return table(Object.values(variants), [
    { label: 'Variant', value: (row) => row.label },
    { label: 'D008E0 before CLEAR', value: (row) => row.beforeClearFields?.D008E0 },
    { label: 'D008E0 final', value: (row) => row.finalFields?.D008E0 },
    { label: 'Final mismatches', value: (row) => row.finalMismatches.map((mismatch) => mismatch.name).join(', ') || 'none' },
    { label: 'D008E0 ROM rewrites during CLEAR', value: (row) => String(row.d008e0ChangesDuringClear.length) },
    { label: '0x0018EC', value: (row) => String(row.routeCounts.shortTail0018EC) },
    { label: '0x0018F8', value: (row) => String(row.routeCounts.cleanup0018F8) },
    { label: 'Termination', value: (row) => row.clearResult.termination },
  ]);
}

function timelineTable(common, variants) {
  const rows = [
    { point: 'stable boundary before browser replay', fields: common.stableSnapshot.watchedFields },
    { point: 'after current stable replay allow-list', fields: checkpointByLabel(common.route, 'afterCurrentStableReplay')?.fields },
    ...Object.values(variants).map((variant) => ({
      point: `${variant.label}: after edit seed`,
      fields: { D008E0: variant.bootReadyD008E0 },
    })),
    ...Object.values(variants).map((variant) => ({
      point: `${variant.label}: before CLEAR`,
      fields: variant.beforeClearFields,
    })),
    ...Object.values(variants).map((variant) => ({
      point: `${variant.label}: final`,
      fields: variant.finalFields,
    })),
  ];
  return table(rows, [
    { label: 'Point', value: (row) => row.point },
    { label: 'D008E0', value: (row) => row.fields?.D008E0 },
    { label: 'D0301B', value: (row) => row.fields?.D0301B },
    { label: 'D010EF', value: (row) => row.fields?.D010EF },
    { label: 'D010FE', value: (row) => row.fields?.D010FE },
    { label: 'D010F4', value: (row) => row.fields?.D010F4 },
  ]);
}

function eventFrameTable(variants) {
  const rows = Object.values(variants).flatMap((variant) => (
    variant.clearFrameEvents.map((event) => ({ variant: variant.label, ...event }))
  ));
  return table(rows, [
    { label: 'Variant', value: (row) => row.variant },
    { label: 'Event', value: (row) => row.label },
    { label: 'SP', value: (row) => row.sp },
    { label: 'D008E0', value: (row) => row.d008e0 },
    { label: 'Note', value: (row) => row.note },
  ]);
}

function fieldChangeTable(variants) {
  const rows = Object.values(variants).flatMap((variant) => (
    variant.d008e0ChangesDuringClear.map((change) => ({ variant: variant.label, ...change }))
  ));
  if (!rows.length) return 'No dynamic D008E0 changes were observed during any CLEAR run after the event-frame setup.';
  return table(rows, [
    { label: 'Variant', value: (row) => row.variant },
    { label: 'From', value: (row) => row.from },
    { label: 'To', value: (row) => row.to },
    { label: 'Prev PC', value: (row) => row.at?.prevPc },
    { label: 'Observed at PC', value: (row) => row.at?.pc },
    { label: 'Phase', value: (row) => row.at?.phase },
  ]);
}

function mismatchTable(variants) {
  const rows = Object.values(variants).flatMap((variant) => (
    variant.finalMismatches.map((row) => ({ variant: variant.label, ...row }))
  ));
  if (!rows.length) return 'No final watched-field mismatches.';
  return table(rows, [
    { label: 'Variant', value: (row) => row.variant },
    { label: 'Field', value: (row) => row.name },
    { label: 'Actual', value: (row) => row.actual },
    { label: 'Oracle', value: (row) => row.oracle },
  ]);
}

function browserEvidenceTable(evidence) {
  return table(Object.entries(evidence).map(([name, value]) => ({ name, value })), [
    { label: 'Browser evidence', value: (row) => row.name },
    { label: 'Present', value: (row) => row.value ? 'yes' : 'no' },
  ]);
}

function oracleStackTable(oracleStack) {
  return table(oracleStack, [
    { label: 'Address', value: (row) => row.addr },
    { label: '3-byte value', value: (row) => row.value },
  ]);
}

function buildReport(data) {
  if (data.error) {
    return [
      '# Phase 878: D008E0 errSP Delta',
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
    '# Phase 878: D008E0 errSP Delta',
    '',
    'Probe: `probe-phase878-d008e0-errsp-delta.mjs`  ',
    'Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase878-d008e0-errsp-delta.mjs`',
    '',
    '## Summary',
    '',
    `- Result: ${data.pass ? 'PASS' : 'FAIL'}.`,
    `- Browser/probe event frame uses reserve-24 + push-return + D008E0=SP recipe: ${data.analysis.browserUsesStockRecipe ? 'yes' : 'no'}.`,
    `- Stable boundary D008E0: ${data.analysis.stableBoundaryErrSp}; stock before-CLEAR D008E0: ${data.analysis.stockBeforeClearErrSp}; oracle after-CLEAR D008E0: ${data.analysis.exactMath.oracleErrSp}.`,
    `- Stock D0301B+D010 replay leaves only D008E0 mismatched: ${data.analysis.stockOnlyD008E0Mismatch ? 'yes' : 'no'}.`,
    `- Stable-boundary D008E0 override still mismatches: ${data.analysis.stableStillD008E0Mismatch ? 'yes' : 'no'}.`,
    `- Oracle D008E0 one-field override closes all watched-field mismatches: ${data.analysis.oracleErrSpClosesAll ? 'yes' : 'no'}.`,
    `- ROM rewrites D008E0 during CLEAR after event setup: ${(data.analysis.stockNoRomD008E0Rewrite && data.analysis.oracleNoRomD008E0Rewrite) ? 'no' : 'yes'}.`,
    `- Adjudication: ${data.analysis.conclusion}`,
    '',
    '## Exact Delta',
    '',
    '```json',
    JSON.stringify(data.analysis.exactMath, null, 2),
    '```',
    '',
    '## Timeline',
    '',
    timelineTable(data.common, data.analysis.variants),
    '',
    '## CLEAR Event-Frame Writes',
    '',
    eventFrameTable(data.analysis.variants),
    '',
    '## Variant Results',
    '',
    variantSummaryTable(data.analysis.variants),
    '',
    '## Dynamic D008E0 Changes During CLEAR',
    '',
    fieldChangeTable(data.analysis.variants),
    '',
    '## Browser Source Evidence',
    '',
    browserEvidenceTable(data.browserEvidence),
    '',
    '## Oracle Stack at D008E0',
    '',
    oracleStackTable(data.oracleErrSpStack),
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
        setupEvents: data.common.setupEvents,
        stableSnapshot: data.common.stableSnapshot,
        routeSummary: {
          totalBlocks: data.common.route.totalBlocks,
          targetCounts: data.common.route.targetCounts,
          fieldChanges: data.common.route.fieldChanges,
          checkpoints: data.common.route.checkpoints,
        },
      },
      variants: data.variantRuns.map((run) => ({
        variant: run.variant,
        boot: {
          stableReplayPatches: run.boot.stableReplayPatches,
          repaintFrameEvents: run.boot.repaintFrameEvents,
          repaintResult: run.boot.repaintResult,
          bootReadyFields: run.boot.bootReadyFields,
        },
        clear: {
          clearFrameEvents: run.clear.clearFrameEvents,
          result: run.clear.result,
          finalFields: run.clear.finalFields,
          targetCounts: run.clear.route.targetCounts,
          targetFirst: run.clear.route.targetFirst,
          fieldChanges: run.clear.route.fieldChanges,
          checkpoints: run.clear.route.checkpoints,
        },
      })),
      oracleAfter: data.oracleAfter,
      oracleErrSpStack: data.oracleErrSpStack,
    }, null, 2),
    '```',
    '',
    'No runtime, transpiler, browser-shell, decoder, peripheral, scheduler, ROM artifact, or `follow-alongs/` files were changed.',
    '',
  ].join('\n');
}

async function runProbe() {
  const oracleAfter = formatFields(readCaptureFields(afterClearRam));
  const oracleErrSp = readCaptureValue(afterClearRam, D008E0, 3);
  const oracleErrSpStack = formatStack(readCaptureStackSlots(afterClearRam, oracleErrSp, 6));
  const browserEvidence = parseBrowserEvidence();
  const common = runToStableReplayBoundary();
  const d010ReplayPatches = [
    { name: 'D010EF', addr: D010EF, len: 3, value: readCaptureValue(afterClearRam, D010EF, 3), timing: 'stable replay' },
    { name: 'D010FE', addr: D010FE, len: 3, value: readCaptureValue(afterClearRam, D010FE, 3), timing: 'stable replay' },
    { name: 'D010F4', addr: D010F4, len: 1, value: readCaptureValue(afterClearRam, D010F4, 1), timing: 'stable replay' },
  ];
  const stableReplayPatches = [
    { name: 'D0301B', addr: D0301B, len: 3, value: D0301B_MAGIC, timing: 'stable replay' },
    ...d010ReplayPatches,
  ];
  const stableBoundaryErrSp = Number.parseInt(common.stableSnapshot.watchedFields.D008E0.slice(2), 16);
  const variants = [
    {
      name: 'stockEventFrame',
      label: 'D0301B + D010 + stock event frame',
      stableReplayPatches,
      clearErrSpOverride: null,
    },
    {
      name: 'stableErrSpOverride',
      label: 'D0301B + D010 + stable-boundary D008E0',
      stableReplayPatches,
      clearErrSpOverride: stableBoundaryErrSp,
    },
    {
      name: 'oracleErrSpOverride',
      label: 'D0301B + D010 + oracle D008E0',
      stableReplayPatches,
      clearErrSpOverride: oracleErrSp,
    },
  ];

  const variantRuns = variants.map((variant) => {
    const boot = buildBootReadyVariant(common, variant);
    const clear = runClearVariant(boot, variant);
    const summary = summarizeVariant(variant, boot, clear, oracleAfter);
    return { variant, boot, clear, summary };
  });
  const analysis = analyze(common, variantRuns, oracleAfter, oracleErrSp, browserEvidence);

  return {
    probe: 'phase878-d008e0-errsp-delta',
    pass: analysis.pass,
    oracleAfter,
    oracleErrSpStack,
    browserEvidence,
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
    exactMath: summary.analysis.exactMath,
    stockOnlyD008E0Mismatch: summary.analysis.stockOnlyD008E0Mismatch,
    stableStillD008E0Mismatch: summary.analysis.stableStillD008E0Mismatch,
    oracleErrSpClosesAll: summary.analysis.oracleErrSpClosesAll,
    stockNoRomD008E0Rewrite: summary.analysis.stockNoRomD008E0Rewrite,
    oracleNoRomD008E0Rewrite: summary.analysis.oracleNoRomD008E0Rewrite,
    conclusion: summary.analysis.conclusion,
    report: path.basename(REPORT_PATH),
  }, null, 2));
  if (!summary.pass) process.exitCode = 1;
} catch (error) {
  summary = { probe: 'phase878-d008e0-errsp-delta', pass: false, error: String(error?.stack || error) };
  console.error(summary.error);
  process.exitCode = 1;
} finally {
  try { fs.writeFileSync(REPORT_PATH, `${buildReport(summary)}\n`); } catch {}
}
