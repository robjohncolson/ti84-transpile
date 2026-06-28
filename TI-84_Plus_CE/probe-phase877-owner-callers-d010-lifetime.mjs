import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase877-owner-callers-d010-lifetime.md');
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

const LIFETIME_FIELDS = Object.freeze([
  ['D0301B', D0301B, 3],
  ['D010EF', 0xD010EF, 3],
  ['D010FE', 0xD010FE, 3],
  ['D010F4', 0xD010F4, 1],
]);

const OWNER_TARGET_NAMES = Object.freeze([
  'ownerAStart040B05',
  'ownerAGuard040B09',
  'ownerADirect040B27',
  'ownerAAlt0454BE',
  'ownerAAlt045575',
  'ownerACommon040BDE',
  'ownerACall040BEC',
  'ownerAStore040BF0',
  'ownerAWrite040BF4',
  'ownerBStart040C26',
  'ownerBSetup040C2E',
  'ownerBReturn040C3F',
  'ownerBCall040C56',
  'ownerBReturn040C5A',
  'ownerBCall040C5E',
  'ownerBStore040C62',
  'ownerBWrite040C66',
]);

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
  ownerAStart040B05: 0x040B05,
  ownerAGuard040B09: 0x040B09,
  ownerADirect040B27: 0x040B27,
  ownerAAlt0454BE: 0x0454BE,
  ownerAAlt045575: 0x045575,
  ownerACommon040BDE: 0x040BDE,
  ownerACall040BEC: 0x040BEC,
  ownerAStore040BF0: 0x040BF0,
  ownerAWrite040BF4: 0x040BF4,
  ownerBStart040C26: 0x040C26,
  ownerBSetup040C2E: 0x040C2E,
  ownerBReturn040C3F: 0x040C3F,
  ownerBCall040C56: 0x040C56,
  ownerBReturn040C5A: 0x040C5A,
  ownerBCall040C5E: 0x040C5E,
  ownerBStore040C62: 0x040C62,
  ownerBWrite040C66: 0x040C66,
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
    fieldChanges: [],
    lastLifetimeValues: null,
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
  const prevPc = route.prevPc;
  route.phase = phase;
  route.totalBlocks += 1;
  route.phaseBlock += 1;

  const values = Object.fromEntries(
    LIFETIME_FIELDS.map(([name, fieldAddr, len]) => [name, readValue(mem, fieldAddr, len)]),
  );
  if (route.lastLifetimeValues === null) {
    route.lastLifetimeValues = values;
  } else {
    for (const [name, value] of Object.entries(values)) {
      if (value === route.lastLifetimeValues[name]) continue;
      if (route.fieldChanges.length < 80) {
        route.fieldChanges.push({
          name,
          from: route.lastLifetimeValues[name],
          to: value,
          at: snapshot(route, mem, cpu, addr, phase, prevPc),
        });
      }
      route.lastLifetimeValues[name] = value;
    }
  }

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

function blockKey(pc) {
  return `${pc.toString(16).padStart(6, '0')}:adl`;
}

function blockSource(pc) {
  return BLOCKS[blockKey(pc)]?.source ?? '';
}

function blockDasm(pc) {
  const source = blockSource(pc);
  if (!source) return '(block not lifted)';
  const rows = [];
  for (const line of source.split('\n')) {
    const match = line.match(/\/\/\s+(0x[0-9a-f]+)\s+([0-9a-f ]+)\s+(.+)/i);
    if (!match) continue;
    rows.push(`${match[1].toUpperCase()} ${match[3].trim()}`);
  }
  return rows.join('; ');
}

function incomingRefs(targetPc) {
  const target = `0x${targetPc.toString(16).padStart(6, '0')}`;
  const refs = [];
  for (const block of Object.values(BLOCKS)) {
    const source = block.source ?? '';
    if (!source.includes(target)) continue;
    const startPc = block.startPc ?? Number.parseInt(String(block.id ?? '').slice(0, 6), 16);
    const kinds = [];
    if (source.includes(`cpu.push(${target});`)) kinds.push('call-return-continuation');
    if (source.includes(`return ${target};`)) kinds.push('branch-or-fallthrough');
    if (source.includes(`if (cpu.checkCondition`) && source.includes(`return ${target};`)) kinds.push('conditional-branch');
    refs.push({
      target: hex(targetPc),
      from: Number.isFinite(startPc) ? hex(startPc) : String(block.id ?? '?'),
      kind: kinds.length ? [...new Set(kinds)].join(', ') : 'source-reference',
      dasm: Number.isFinite(startPc) ? blockDasm(startPc) : '(unknown)',
    });
  }
  return refs
    .sort((a, b) => a.from.localeCompare(b.from))
    .slice(0, 12);
}

function ownerStaticAnalysis() {
  const chainRows = [
    { owner: 'A', pc: 0x040B05, role: 'guard entry', expectedNext: 'CALL 0x03F1ED -> ret 0x040B09' },
    { owner: 'A', pc: 0x040B09, role: 'D00894 branch', expectedNext: 'NZ -> 0x040BE2, else -> 0x040B12 -> 0x040BDE' },
    { owner: 'A', pc: 0x040B27, role: 'alternate direct branch', expectedNext: 'JP 0x040BE4' },
    { owner: 'A', pc: 0x040BDE, role: 'alternate common entry', expectedNext: 'LD A,0x03 -> JR 0x040BE4' },
    { owner: 'A', pc: 0x040BEC, role: 'pre-store call', expectedNext: 'CALL 0x04572C -> ret 0x040BF0' },
    { owner: 'A', pc: 0x040BF0, role: 'magic load + store', expectedNext: 'LD HL,0x5AA55A; LD (D0301B),HL at 0x040BF4' },
    { owner: 'B', pc: 0x040C26, role: 'setup entry', expectedNext: 'CALL 0x061DEF -> ret 0x040C2E' },
    { owner: 'B', pc: 0x040C2E, role: 'ON-SP/context setup', expectedNext: 'CALL 0x040C41 -> ret 0x040C3F' },
    { owner: 'B', pc: 0x040C56, role: 'pre-owner call 1', expectedNext: 'CALL 0x05519F -> ret 0x040C5A' },
    { owner: 'B', pc: 0x040C5E, role: 'pre-store call 2', expectedNext: 'CALL 0x0246D7 -> ret 0x040C62' },
    { owner: 'B', pc: 0x040C62, role: 'magic load + store', expectedNext: 'LD HL,0x5AA55A; LD (D0301B),HL at 0x040C66' },
  ].map((row) => ({ ...row, pcHex: hex(row.pc), dasm: blockDasm(row.pc) }));

  const incomingTargets = [0x040BF0, 0x040C62, 0x040BE4, 0x040BDE, 0x040B27, 0x040C56, 0x040C5E, 0x040C2E];
  const incoming = Object.fromEntries(incomingTargets.map((pc) => [hex(pc), incomingRefs(pc)]));
  const ownerAContinuationFound = incoming[hex(0x040BF0)]?.some((row) => row.from === hex(0x040BEC) && row.kind.includes('call-return-continuation'));
  const ownerBContinuationFound = incoming[hex(0x040C62)]?.some((row) => row.from === hex(0x040C5E) && row.kind.includes('call-return-continuation'));
  return { chainRows, incoming, ownerAContinuationFound, ownerBContinuationFound };
}

function runToStableReplayBoundary() {
  const machine = makeMachine('phase877-common-stable-replay');
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
  const machine = makeMachine(`phase877-boot-${variant.name}`, common.stableReplayMem);
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
  const machine = makeMachine(`phase877-clear-${variant.name}`, boot.bootReadyMem);
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

function ownerCounts(...routes) {
  return Object.fromEntries(OWNER_TARGET_NAMES.map((name) => [
    name,
    routes.reduce((sum, route) => sum + (route.targetCounts?.[name] ?? 0), 0),
  ]));
}

function ownerHitTotal(counts) {
  return Object.values(counts).reduce((sum, value) => sum + value, 0);
}

function summarizeVariant(variant, boot, clear, oracleAfter) {
  const counts = clear.route.targetCounts;
  const beforeClear = checkpointByLabel(clear.route, 'beforeClearRun');
  const afterClear = checkpointByLabel(clear.route, 'afterClearRun');
  const ownerHitCounts = ownerCounts(boot.route, clear.route);
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
    ownerHitCounts,
    ownerHitTotal: ownerHitTotal(ownerHitCounts),
  };
}

function analyze(common, variantRuns, oracleAfter, stableFieldInfo, ownerStatic) {
  const variants = Object.fromEntries(variantRuns.map((run) => [run.variant.name, run.summary]));
  const baseline = variants.currentPacket;
  const d0301b = variants.d0301bReplay;
  const d010 = variants.d0301bD010Replay;
  const afterCurrentReplay = checkpointByLabel(common.route, 'afterCurrentStableReplay')?.fields ?? {};
  const commonOwnerCounts = ownerCounts(common.route);
  const allOwnerHitTotal = ownerHitTotal(commonOwnerCounts)
    + Object.values(variants).reduce((sum, variant) => sum + variant.ownerHitTotal, 0);

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
  const browserPacketOmitsD010 = stableFieldInfo.found && ['D010EF', 'D010FE', 'D010F4'].every(
    (name) => !stableFieldInfo.names.includes(name),
  );
  const stableBoundaryHasD010 = ['D010EF', 'D010FE', 'D010F4'].every(
    (name) => common.stableSnapshot.watchedFields[name] === oracleAfter[name],
  );
  const currentReplayDropsD010 = afterCurrentReplay.D010EF === '0x000000'
    && afterCurrentReplay.D010FE === '0x000000'
    && afterCurrentReplay.D010F4 === '0x00';
  const ownerContinuationsFound = ownerStatic.ownerAContinuationFound && ownerStatic.ownerBContinuationFound;
  const ownerCandidatesNotHit = allOwnerHitTotal === 0;

  const pass = browserPacketStillOmitsD0301B
    && browserPacketOmitsD010
    && stableBoundaryHasD010
    && currentReplayDropsD010
    && ownerContinuationsFound
    && ownerCandidatesNotHit
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
    browserPacketOmitsD010,
    stableBoundaryD0301B: common.stableSnapshot.watchedFields.D0301B,
    stableBoundaryD010: {
      D010EF: common.stableSnapshot.watchedFields.D010EF,
      D010FE: common.stableSnapshot.watchedFields.D010FE,
      D010F4: common.stableSnapshot.watchedFields.D010F4,
    },
    afterCurrentReplayD010: {
      D010EF: afterCurrentReplay.D010EF,
      D010FE: afterCurrentReplay.D010FE,
      D010F4: afterCurrentReplay.D010F4,
    },
    stableBoundaryHasD010,
    currentReplayDropsD010,
    ownerContinuationsFound,
    ownerCandidatesNotHit,
    commonOwnerCounts,
    allOwnerHitTotal,
    baselineTakesLargeWipe,
    d0301bSurvivesToClear,
    d0301bTakesShortTail,
    d0301bEditVatMatchesOracle: d0301b.editVatMatchesOracle,
    d0301bLeavesOnlyGap,
    d010ReplayClosesD010,
    d010ReplayStillD008E0Only,
    variants,
    conclusion: pass
      ? 'The direct D0301B owner candidates are real store continuations, but the browser coldboot/replay/CLEAR route never reaches them. The OS has D010EF/D010FE/D010F4 at the stable boundary; the current browser stable replay drops those fields because the allow-list omits them. Replaying D0301B plus the D010 mirror preserves the after-CLEAR oracle fields except the separate D008E0 stack-anchor delta.'
      : 'The owner/lifetime trace did not match the expected narrow pattern; inspect static incoming refs, owner hit counts, and field chronology before patching browser-shell.',
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

function ownerChainTable(ownerStatic) {
  return table(ownerStatic.chainRows, [
    { label: 'Owner', value: (row) => row.owner },
    { label: 'PC', value: (row) => row.pcHex },
    { label: 'Role', value: (row) => row.role },
    { label: 'Expected next', value: (row) => row.expectedNext },
    { label: 'Lifted block evidence', value: (row) => row.dasm },
  ]);
}

function incomingRefTable(ownerStatic) {
  const rows = Object.values(ownerStatic.incoming).flat();
  return table(rows, [
    { label: 'Target', value: (row) => row.target },
    { label: 'From block', value: (row) => row.from },
    { label: 'Kind', value: (row) => row.kind },
    { label: 'From block evidence', value: (row) => row.dasm },
  ]);
}

function ownerHitTable(analysis) {
  const rows = [
    { scope: 'common coldboot -> stable boundary', counts: analysis.commonOwnerCounts },
    ...Object.values(analysis.variants).map((variant) => ({
      scope: variant.label,
      counts: variant.ownerHitCounts,
    })),
  ];
  return table(rows, [
    { label: 'Scope', value: (row) => row.scope },
    { label: 'Owner A 0x040BF0/0x040BF4', value: (row) => String((row.counts.ownerAStore040BF0 ?? 0) + (row.counts.ownerAWrite040BF4 ?? 0)) },
    { label: 'Owner B 0x040C62/0x040C66', value: (row) => String((row.counts.ownerBStore040C62 ?? 0) + (row.counts.ownerBWrite040C66 ?? 0)) },
    { label: 'All owner-chain targets', value: (row) => String(ownerHitTotal(row.counts)) },
  ]);
}

function fieldChronologyTable(common, variants) {
  const currentReplay = checkpointByLabel(common.route, 'afterCurrentStableReplay')?.fields ?? {};
  const rows = [
    { point: 'stable boundary before browser replay', fields: common.stableSnapshot.watchedFields },
    { point: 'after current stable replay allow-list', fields: currentReplay },
    { point: 'current packet before CLEAR', fields: variants.currentPacket.beforeClearFields },
    { point: 'current packet final', fields: variants.currentPacket.finalFields },
    { point: 'D0301B + D010 replay before CLEAR', fields: variants.d0301bD010Replay.beforeClearFields },
    { point: 'D0301B + D010 replay final', fields: variants.d0301bD010Replay.finalFields },
  ];
  return table(rows, [
    { label: 'Point', value: (row) => row.point },
    { label: 'D0301B', value: (row) => row.fields?.D0301B },
    { label: 'D010EF', value: (row) => row.fields?.D010EF },
    { label: 'D010FE', value: (row) => row.fields?.D010FE },
    { label: 'D010F4', value: (row) => row.fields?.D010F4 },
    { label: 'D008E0', value: (row) => row.fields?.D008E0 },
  ]);
}

function fieldChangeTable(route) {
  if (!route.fieldChanges.length) return 'No in-ROM lifetime field changes were observed before the stable boundary.';
  return table(route.fieldChanges, [
    { label: 'Field', value: (row) => row.name },
    { label: 'From', value: (row) => row.from },
    { label: 'To', value: (row) => row.to },
    { label: 'Prev PC', value: (row) => row.at?.prevPc },
    { label: 'Observed at PC', value: (row) => row.at?.pc },
    { label: 'Phase', value: (row) => row.at?.phase },
  ]);
}

function buildReport(data) {
  if (data.error) {
    return [
      '# Phase 877: Owner Callers + D010 Lifetime',
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
    '# Phase 877: Owner Callers + D010 Lifetime',
    '',
    'Probe: `probe-phase877-owner-callers-d010-lifetime.mjs`  ',
    'Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase877-owner-callers-d010-lifetime.mjs`',
    '',
    '## Summary',
    '',
    `- Result: ${data.pass ? 'PASS' : 'FAIL'}.`,
    `- Browser stable replay packet still omits D0301B: ${data.analysis.browserPacketStillOmitsD0301B ? 'yes' : 'no'}.`,
    `- Browser stable replay packet omits D010EF/D010FE/D010F4: ${data.analysis.browserPacketOmitsD010 ? 'yes' : 'no'}.`,
    `- Static owner continuations found for 0x040BEC -> 0x040BF0 and 0x040C5E -> 0x040C62: ${data.analysis.ownerContinuationsFound ? 'yes' : 'no'}.`,
    `- Dynamic route hits any D0301B owner-chain target: ${data.analysis.ownerCandidatesNotHit ? 'no' : 'yes'}.`,
    `- Stable boundary has oracle D010 mirror fields: ${data.analysis.stableBoundaryHasD010 ? 'yes' : 'no'}.`,
    `- Current stable replay drops D010 mirror fields: ${data.analysis.currentReplayDropsD010 ? 'yes' : 'no'}.`,
    `- D0301B+D010 replay closes D010EF/D010FE/D010F4 and leaves only D008E0: ${data.analysis.d010ReplayClosesD010 && data.analysis.d010ReplayStillD008E0Only ? 'yes' : 'no'}.`,
    `- Adjudication: ${data.analysis.conclusion}`,
    '',
    '## Owner Candidate Static Chains',
    '',
    ownerChainTable(data.ownerStatic),
    '',
    '## Owner Incoming References',
    '',
    incomingRefTable(data.ownerStatic),
    '',
    '## Dynamic Owner Hit Counts',
    '',
    ownerHitTable(data.analysis),
    '',
    '## D010/D0301B Chronology',
    '',
    fieldChronologyTable(data.common, data.analysis.variants),
    '',
    '## In-ROM Lifetime Field Changes Before Stable Boundary',
    '',
    fieldChangeTable(data.common.route),
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
      ownerStatic: data.ownerStatic,
      common: {
        phases: data.common.phases,
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
          repaintResult: run.boot.repaintResult,
          bootReadyFields: run.boot.bootReadyFields,
        },
        clear: {
          beforeClearPatches: run.clear.beforeClearPatches,
          result: run.clear.result,
          finalFields: run.clear.finalFields,
          targetCounts: run.clear.route.targetCounts,
          targetFirst: run.clear.route.targetFirst,
          fieldChanges: run.clear.route.fieldChanges,
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
  const ownerStatic = ownerStaticAnalysis();
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
  const analysis = analyze(common, variantRuns, oracleAfter, stableFieldInfo, ownerStatic);

  return {
    probe: 'phase877-owner-callers-d010-lifetime',
    pass: analysis.pass,
    stableFieldInfo,
    ownerStatic,
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
    ownerContinuationsFound: summary.analysis.ownerContinuationsFound,
    ownerCandidatesNotHit: summary.analysis.ownerCandidatesNotHit,
    stableBoundaryHasD010: summary.analysis.stableBoundaryHasD010,
    currentReplayDropsD010: summary.analysis.currentReplayDropsD010,
    d010ReplayClosesD010: summary.analysis.d010ReplayClosesD010,
    d010ReplayStillD008E0Only: summary.analysis.d010ReplayStillD008E0Only,
    conclusion: summary.analysis.conclusion,
    report: path.basename(REPORT_PATH),
  }, null, 2));
  if (!summary.pass) process.exitCode = 1;
} catch (error) {
  summary = { probe: 'phase877-owner-callers-d010-lifetime', pass: false, error: String(error?.stack || error) };
  console.error(summary.error);
  process.exitCode = 1;
} finally {
  try { fs.writeFileSync(REPORT_PATH, `${buildReport(summary)}\n`); } catch {}
}
