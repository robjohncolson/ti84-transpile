import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { decodeInstruction } from './ez80-decoder.js';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase875-d0301b-owner-lifetime.md');
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');
const BROWSER_SHELL_PATH = path.join(__dirname, 'browser-shell.html');
const PRE_CLEAR_CAPTURE = path.join(__dirname, 'captures', 'realram-home-digit3-D00000-D657FF.bin');
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
const ROUTE_LIMIT = 5600;

const romBytes = fs.readFileSync(ROM_PATH);
const preClearRam = fs.readFileSync(PRE_CLEAR_CAPTURE);
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

const TARGETS = Object.freeze({
  launchHome09DD62: 0x09DD62,
  phase5PreWipe001879: 0x001879,
  phase5Cleanup0018F8: 0x0018F8,
  homeRepaint058241: 0x058241,
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
  d0301bWriter00086F: 0x00086F,
  d0301bWriter00141C: 0x00141C,
  d0301bWriter001B06: 0x001B06,
  d0301bWriter0141AE: 0x0141AE,
  d0301bReader0402BB: 0x0402BB,
  d0301bMagicLoad040BF0: 0x040BF0,
  d0301bWriter040BF4: 0x040BF4,
  d0301bMagicLoad040C62: 0x040C62,
  d0301bWriter040C66: 0x040C66,
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

function compactCpu(cpu) {
  return {
    pc: cpu.pc & 0xFFFFFF,
    currentBlockPc: cpu._currentBlockPc & 0xFFFFFF,
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

function makeRoute(label) {
  return {
    label,
    phase: 'init',
    totalBlocks: 0,
    phaseBlock: 0,
    prevPc: null,
    targetCounts: Object.fromEntries(Object.keys(TARGETS).map((name) => [name, 0])),
    targetFirst: {},
    rows: [],
    d0301bChanges: [],
    checkpoints: [],
    lastD0301B: null,
  };
}

function resetRoute(route, label) {
  route.label = label;
  route.phase = 'init';
  route.totalBlocks = 0;
  route.phaseBlock = 0;
  route.prevPc = null;
  route.targetCounts = Object.fromEntries(Object.keys(TARGETS).map((name) => [name, 0]));
  route.targetFirst = {};
  route.rows = [];
  route.d0301bChanges = [];
  route.checkpoints = [];
  route.lastD0301B = null;
}

function observeRoute(route, mem, cpu, pc, phase) {
  const addr = pc & 0xFFFFFF;
  const prevPc = route.prevPc;
  route.phase = phase;
  route.totalBlocks += 1;
  route.phaseBlock += 1;

  const d0301b = readValue(mem, D0301B, 3);
  if (route.lastD0301B === null) {
    route.lastD0301B = d0301b;
  } else if (d0301b !== route.lastD0301B) {
    route.d0301bChanges.push({
      from: route.lastD0301B,
      to: d0301b,
      at: snapshot(route, mem, cpu, addr, phase, prevPc),
    });
    route.lastD0301B = d0301b;
  }

  for (const [name, target] of Object.entries(TARGETS)) {
    if (addr !== target) continue;
    route.targetCounts[name] += 1;
    if (!route.targetFirst[name]) route.targetFirst[name] = snapshot(route, mem, cpu, addr, phase, prevPc);
  }

  if (route.rows.length < ROUTE_LIMIT) {
    const interesting = Object.values(TARGETS).includes(addr) || d0301b !== 0;
    if (interesting) route.rows.push(snapshot(route, mem, cpu, addr, phase, prevPc));
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

function formatCheckpoint(point) {
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
    d0301bChanges: route.d0301bChanges.map((change) => ({
      from: hex(change.from),
      to: hex(change.to),
      at: formatSnapshot(change.at),
    })),
    checkpoints: route.checkpoints.map(formatCheckpoint),
    sampleRows: route.rows.slice(0, 80).map(formatSnapshot),
  };
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

function makeMachine() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, MEM_SIZE));
  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals, trackMemoryMapped: true });
  const route = makeRoute('phase875-coldboot');
  return { mem, peripherals, executor, cpu: executor.cpu, route };
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

function runColdboot(machine) {
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
            fields: captureFieldSnapshot(mem, BROWSER_STABLE_REPLAY_FIELDS),
            watchedFields: readFields(mem),
          };
        }
      },
    }),
  });
  checkpoint(route, mem, cpu, 'afterPhase5');

  if (stableSnapshot) restoreFieldSnapshot(mem, stableSnapshot.fields);
  checkpoint(route, mem, cpu, 'afterStableReplay');

  prepareEventFrame(mem, peripherals, cpu);
  phases.push({ name: 'p6-home-repaint', result: runWithTrace(machine, 'p6-home-repaint', HOME_REPAINT, 'adl', { maxSteps: 300000, maxLoopIterations: 30000 }) });
  checkpoint(route, mem, cpu, 'afterPhase6');

  seedBrowserEditContext(mem);
  checkpoint(route, mem, cpu, 'afterEditSeed');
  checkpoint(route, mem, cpu, 'afterBootReady');

  return { phases, stableSnapshot };
}

function runClearRoute(machine) {
  const { mem, peripherals, cpu, route } = machine;
  resetRoute(route, 'phase875-clear-route-port-bit-skip');

  if (!peripherals.register) throw new Error('peripheral bus has no register() API for port override');
  peripherals.register(0x03, {
    read() { return 0xFE; },
    write() {},
  });

  rearmCxMain(mem);
  prepareEventFrame(mem, peripherals, cpu);
  seedClear(mem, peripherals);
  checkpoint(route, mem, cpu, 'beforeClearRun');

  const result = runWithTrace(machine, 'p7-clear-route', OUTER_LOOP, 'adl', {
    maxSteps: 160000,
    maxLoopIterations: 500000,
    diHaltBypass: true,
    diHaltBypassEntry: OUTER_LOOP,
  });
  checkpoint(route, mem, cpu, 'afterClearRun');

  return { result, route: formatRoute(route), finalFields: formatFields(readFields(mem)) };
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

function findSequence(bytes, sequence) {
  const hits = [];
  for (let i = 0; i <= bytes.length - sequence.length; i += 1) {
    let ok = true;
    for (let j = 0; j < sequence.length; j += 1) {
      if (bytes[i + j] !== sequence[j]) {
        ok = false;
        break;
      }
    }
    if (ok) hits.push(i);
  }
  return hits;
}

function formatInst(inst) {
  if (!inst) return '(decode failed)';
  const upper = (value) => String(value ?? '').toUpperCase();
  if (inst.tag === 'ret') return 'RET';
  if (inst.tag === 'ret-conditional') return `RET ${upper(inst.condition)}`;
  if (inst.tag === 'call') return `CALL ${hex(inst.target)}`;
  if (inst.tag === 'jp') return `JP ${hex(inst.target)}`;
  if (inst.tag === 'jr') return `JR ${hex(inst.target)}`;
  if (inst.tag === 'jr-conditional') return `JR ${upper(inst.condition)}, ${hex(inst.target)}`;
  if (inst.tag === 'ld-reg-mem') return `LD ${upper(inst.dest)}, (${hex(inst.addr)})`;
  if (inst.tag === 'ld-mem-reg') return `LD (${hex(inst.addr)}), ${upper(inst.src)}`;
  if (inst.tag === 'ld-pair-imm') return `LD ${upper(inst.pair ?? inst.dest)}, ${hex(inst.value)}`;
  if (inst.tag === 'ld-pair-mem') {
    return inst.direction === 'to-mem'
      ? `LD (${hex(inst.addr)}), ${upper(inst.pair)}`
      : `LD ${upper(inst.pair)}, (${hex(inst.addr)})`;
  }
  if (inst.tag === 'ld-reg-imm') return `LD ${upper(inst.dest)}, ${hex(inst.value, 2)}`;
  if (inst.tag === 'sbc-pair') return `SBC HL, ${upper(inst.src)}`;
  if (inst.tag === 'in0') return `IN0 ${upper(inst.reg)}, (${hex(inst.port, 2)})`;
  if (inst.tag === 'out0') return `OUT0 (${hex(inst.port, 2)}), ${upper(inst.reg)}`;
  if (inst.tag === 'alu-reg') return `${upper(inst.op)} ${upper(inst.src)}`;
  if (inst.tag === 'alu-imm') return `${upper(inst.op)} ${hex(inst.value, 2)}`;
  if (inst.tag === 'bit-set') return `SET ${inst.bit}, ${upper(inst.reg)}`;
  if (inst.tag === 'bit-res') return `RES ${inst.bit}, ${upper(inst.reg)}`;
  if (inst.tag === 'bit-test') return `BIT ${inst.bit}, ${upper(inst.reg)}`;
  if (inst.tag === 'ldir') return 'LDIR';
  return `${inst.tag} ${JSON.stringify(Object.fromEntries(Object.entries(inst).filter(([key]) => !['tag', 'pc', 'length', 'nextPc'].includes(key))))}`;
}

function decodeCandidatesForHit(hit, sequenceLength) {
  const rows = [];
  for (let pc = Math.max(0, hit - 6); pc <= hit; pc += 1) {
    try {
      const inst = decodeInstruction(romBytes, pc, 'adl');
      const end = pc + inst.length;
      if (pc <= hit && end >= hit + sequenceLength) {
        rows.push({
          pc,
          bytes: Array.from(romBytes.subarray(pc, end), (byte) => byte.toString(16).toUpperCase().padStart(2, '0')).join(' '),
          instruction: formatInst(inst),
          tag: inst.tag,
        });
      }
    } catch {}
  }
  return rows;
}

function staticReferences() {
  const addressHits = findSequence(romBytes, [0x1B, 0x30, 0xD0]).map((hit) => ({
    kind: 'D0301B address bytes',
    hit: hex(hit),
    candidates: decodeCandidatesForHit(hit, 3).map((row) => ({ ...row, pc: hex(row.pc) })),
  }));
  const magicHits = findSequence(romBytes, [0x5A, 0xA5, 0x5A]).map((hit) => ({
    kind: '0x5AA55A magic bytes',
    hit: hex(hit),
    candidates: decodeCandidatesForHit(hit, 3).map((row) => ({ ...row, pc: hex(row.pc) })),
  }));
  return { addressHits, magicHits };
}

function checkpointByLabel(route, label) {
  return route.checkpoints.find((point) => point.label === label) ?? null;
}

function targetRow(route, name) {
  return route.targetFirst?.[name] ?? null;
}

function summarizeLifecycle(coldbootRoute, clearRoute, stableFieldInfo, refs) {
  const preOracle = formatFields(readCaptureFields(preClearRam));
  const afterOracle = formatFields(readCaptureFields(afterClearRam));
  const stableNames = stableFieldInfo.names;
  const afterBoot = checkpointByLabel(coldbootRoute, 'afterBootReady');
  const stableBoundary = coldbootRoute.stableSnapshot
    ? formatFields(coldbootRoute.stableSnapshot.watchedFields)
    : null;
  const afterStableReplay = checkpointByLabel(coldbootRoute, 'afterStableReplay');
  const beforeClear = clearRoute.route.checkpoints.find((point) => point.label === 'beforeClearRun') ?? null;
  const gateRow = targetRow(clearRoute.route, 'sentinelBlock0018D7');
  const skipRow = targetRow(clearRoute.route, 'portSkip0018AF');
  const largeClearRow = targetRow(clearRoute.route, 'largeClear001881');
  const shortTailRow = targetRow(clearRoute.route, 'shortTail0018EC');

  const captureHasMagic = preOracle.D0301B === hex(D0301B_MAGIC) && afterOracle.D0301B === hex(D0301B_MAGIC);
  const replayIncludesD0301B = stableNames.includes('D0301B');
  const browserReadyZero = formatFields(afterBoot?.fields ?? {}).D0301B === '0x000000';
  const gateZero = gateRow?.fields?.D0301B === '0x000000';
  const directWriterHits = refs.addressHits.flatMap((hit) => hit.candidates).some((candidate) => {
    const text = candidate.instruction ?? '';
    return text.includes('(0xD0301B),');
  });
  const ownerTargetNames = Object.keys(TARGETS).filter((name) => (
    name.startsWith('d0301bWriter') || name.startsWith('d0301bMagicLoad')
  ));
  const ownerTargetsHit = ownerTargetNames.some((name) => (
    (coldbootRoute.targetCounts?.[name] ?? 0) > 0
    || (clearRoute.route.targetCounts?.[name] ?? 0) > 0
  ));
  const pass = captureHasMagic
    && stableFieldInfo.found
    && !replayIncludesD0301B
    && browserReadyZero
    && gateZero
    && directWriterHits
    && !ownerTargetsHit
    && clearRoute.route.targetCounts.portSkip0018AF > 0
    && clearRoute.route.targetCounts.largeClear001881 > 0;

  return {
    pass,
    captureHasMagic,
    stableFieldInfo,
    replayIncludesD0301B,
    browserReadyZero,
    gateZero,
    directWriterHits,
    ownerTargetNames,
    ownerTargetsHit,
    preOracle,
    afterOracle,
    stableBoundary,
    afterStableReplay: formatCheckpoint(afterStableReplay),
    afterBoot: formatCheckpoint(afterBoot),
    beforeClear: formatCheckpoint(beforeClear),
    skipRow: formatSnapshot(skipRow),
    gateRow: formatSnapshot(gateRow),
    largeClearRow: formatSnapshot(largeClearRow),
    shortTailRow: formatSnapshot(shortTailRow),
    conclusion: pass
      ? 'D0301B is not lost inside the CLEAR branch; the browser recipe enters the route with it already zero. Real RAM has 0x5AA55A before and after CLEAR, and static scan found direct ROM owner candidates, including magic-load/store pairs at 0x040BF0->0x040BF4 and 0x040C62->0x040C66. The traced browser coldboot/CLEAR path never reaches those candidates and the browser stable replay packet omits D0301B, so the browser route loses the sentinel before CLEAR by not executing or replaying the owner state.'
      : 'The D0301B lifecycle did not match the expected missing-replay pattern; inspect the route rows and static-reference table before treating the stable packet as the owner.',
  };
}

function table(rows, columns) {
  return [
    `| ${columns.map((column) => column.label).join(' | ')} |`,
    `| ${columns.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${columns.map((column) => column.value(row) ?? '-').join(' | ')} |`),
  ].join('\n');
}

function lifecycleTable(summary) {
  const rows = [
    { label: 'CEmu before CLEAR', fields: summary.preOracle },
    { label: 'CEmu after CLEAR', fields: summary.afterOracle },
    { label: 'browser phase5 stable boundary', fields: summary.stableBoundary },
    { label: 'browser after stable replay', fields: summary.afterStableReplay?.fields },
    { label: 'browser after boot ready', fields: summary.afterBoot?.fields },
    { label: 'browser before CLEAR run', fields: summary.beforeClear?.fields },
    { label: 'route at 0x0018AF', fields: summary.skipRow?.fields },
    { label: 'route at 0x0018D7', fields: summary.gateRow?.fields },
  ];
  const fields = ['D0301B', 'D007CA', 'D008E0', 'D010EF', 'D010FE', 'D010F4', 'D02437', 'D0243A', 'D02590'];
  return table(rows, [
    { label: 'Point', value: (row) => row.label },
    ...fields.map((field) => ({ label: field, value: (row) => row.fields?.[field] })),
  ]);
}

function targetTable(route) {
  const rows = Object.entries(route.targetCounts)
    .filter(([, count]) => count > 0)
    .map(([name, count]) => ({ name, count, first: route.targetFirst[name] }));
  return table(rows, [
    { label: 'Target', value: (row) => row.name },
    { label: 'Count', value: (row) => String(row.count) },
    { label: 'First PC', value: (row) => row.first?.pc },
    { label: 'Prev', value: (row) => row.first?.prevPc ?? '-' },
    { label: 'D0301B', value: (row) => row.first?.fields?.D0301B },
    { label: 'D007CA', value: (row) => row.first?.fields?.D007CA },
    { label: 'D02590', value: (row) => row.first?.fields?.D02590 },
  ]);
}

function ownerDynamicTable(coldbootRoute, clearRoute, ownerTargetNames) {
  const rows = ownerTargetNames.map((name) => ({
    name,
    pc: hex(TARGETS[name]),
    coldboot: coldbootRoute.targetCounts?.[name] ?? 0,
    clear: clearRoute.route.targetCounts?.[name] ?? 0,
    firstColdboot: coldbootRoute.targetFirst?.[name] ?? null,
    firstClear: clearRoute.route.targetFirst?.[name] ?? null,
  }));
  return table(rows, [
    { label: 'Owner Candidate', value: (row) => row.name },
    { label: 'PC', value: (row) => row.pc },
    { label: 'Coldboot Hits', value: (row) => String(row.coldboot) },
    { label: 'CLEAR Hits', value: (row) => String(row.clear) },
    { label: 'First Coldboot D0301B', value: (row) => row.firstColdboot?.fields?.D0301B ?? '-' },
    { label: 'First CLEAR D0301B', value: (row) => row.firstClear?.fields?.D0301B ?? '-' },
  ]);
}

function stableReplayTable(info) {
  return table(info.names.map((name) => ({ name, included: name === 'D0301B' ? 'yes' : 'no' })), [
    { label: 'Browser Stable Replay Field', value: (row) => row.name },
  ]);
}

function staticRefTable(refs) {
  const rows = [];
  for (const hit of [...refs.addressHits, ...refs.magicHits]) {
    if (hit.candidates.length === 0) {
      rows.push({ kind: hit.kind, hit: hit.hit, pc: '-', bytes: '-', instruction: '-' });
    } else {
      for (const candidate of hit.candidates) {
        rows.push({ kind: hit.kind, hit: hit.hit, ...candidate });
      }
    }
  }
  return table(rows, [
    { label: 'Kind', value: (row) => row.kind },
    { label: 'Byte Hit', value: (row) => row.hit },
    { label: 'Decode PC', value: (row) => row.pc },
    { label: 'Bytes', value: (row) => `\`${row.bytes}\`` },
    { label: 'Instruction', value: (row) => row.instruction },
  ]);
}

function d0301bChangeTable(...routes) {
  const rows = routes.flatMap((route) => route.d0301bChanges.map((change) => ({
    route: route.label,
    from: change.from,
    to: change.to,
    phase: change.at.phase,
    pc: change.at.pc,
    prevPc: change.at.prevPc,
    block: change.at.block,
  })));
  if (rows.length === 0) return 'No D0301B value changes were observed in the traced coldboot or CLEAR route.';
  return table(rows, [
    { label: 'Route', value: (row) => row.route },
    { label: 'From', value: (row) => row.from },
    { label: 'To', value: (row) => row.to },
    { label: 'Phase', value: (row) => row.phase },
    { label: 'PC', value: (row) => row.pc },
    { label: 'Prev', value: (row) => row.prevPc ?? '-' },
    { label: 'Block', value: (row) => String(row.block) },
  ]);
}

function buildReport(data) {
  if (data.error) {
    return [
      '# Phase 875: D0301B Owner/Lifetime',
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
    '# Phase 875: D0301B Owner/Lifetime',
    '',
    'Probe: `probe-phase875-d0301b-owner-lifetime.mjs`  ',
    'Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase875-d0301b-owner-lifetime.mjs`',
    '',
    '## Summary',
    '',
    `- Result: ${data.pass ? 'PASS' : 'FAIL'}.`,
    `- CEmu captures keep D0301B magic before/after CLEAR: ${data.lifecycle.captureHasMagic ? 'yes' : 'no'}.`,
    `- Browser stable replay packet includes D0301B: ${data.lifecycle.replayIncludesD0301B ? 'yes' : 'no'}.`,
    `- Browser coldboot-ready D0301B is zero: ${data.lifecycle.browserReadyZero ? 'yes' : 'no'}.`,
    `- Port-skip route reaches D0301B gate with zero: ${data.lifecycle.gateZero ? 'yes' : 'no'}.`,
    `- Direct absolute D0301B writer found in static scan: ${data.lifecycle.directWriterHits ? 'yes' : 'no'}.`,
    `- Traced browser coldboot/CLEAR route reaches any direct owner candidate: ${data.lifecycle.ownerTargetsHit ? 'yes' : 'no'}.`,
    `- Adjudication: ${data.lifecycle.conclusion}`,
    '',
    '## Lifecycle Field Table',
    '',
    lifecycleTable(data.lifecycle),
    '',
    '## Browser Stable Replay Packet',
    '',
    stableReplayTable(data.lifecycle.stableFieldInfo),
    '',
    '## D0301B Change Trace',
    '',
    d0301bChangeTable(data.coldbootRoute, data.clearRoute.route),
    '',
    '## Owner Candidate Dynamic Counts',
    '',
    ownerDynamicTable(data.coldbootRoute, data.clearRoute, data.lifecycle.ownerTargetNames),
    '',
    '## CLEAR Route Target Counts',
    '',
    targetTable(data.clearRoute.route),
    '',
    '## Static Direct References',
    '',
    staticRefTable(data.staticRefs),
    '',
    '## Machine JSON',
    '',
    '```json',
    JSON.stringify({
      pass: data.pass,
      lifecycle: data.lifecycle,
      phases: data.phases,
      coldbootRoute: {
        totalBlocks: data.coldbootRoute.totalBlocks,
        targetCounts: data.coldbootRoute.targetCounts,
        checkpoints: data.coldbootRoute.checkpoints,
        d0301bChanges: data.coldbootRoute.d0301bChanges,
        stableSnapshot: data.coldbootRoute.stableSnapshot,
      },
      clearRoute: data.clearRoute,
      staticRefs: data.staticRefs,
    }, null, 2),
    '```',
    '',
    'No runtime, transpiler, browser-shell, decoder, peripheral, scheduler, ROM artifact, or `follow-alongs/` files were changed.',
    '',
  ].join('\n');
}

async function runProbe() {
  const machine = makeMachine();
  const coldboot = runColdboot(machine);
  const coldbootRoute = formatRoute(machine.route);
  coldbootRoute.stableSnapshot = coldboot.stableSnapshot
    ? {
      atBlock: coldboot.stableSnapshot.atBlock,
      watchedFields: formatFields(coldboot.stableSnapshot.watchedFields),
      replayFields: coldboot.stableSnapshot.fields.map((field) => ({
        name: field.name,
        addr: hex(field.addr),
        len: field.len,
        value: formatFieldValue(field.name, field.value),
      })),
    }
    : null;

  const clearRoute = runClearRoute(machine);
  const stableFieldInfo = parseBrowserStableReplayFieldNames();
  const staticRefs = staticReferences();
  const lifecycle = summarizeLifecycle(coldbootRoute, clearRoute, stableFieldInfo, staticRefs);
  const phases = coldboot.phases.map((phase) => ({ name: phase.name, result: formatRunResult(phase.result) }));

  return {
    probe: 'phase875-d0301b-owner-lifetime',
    pass: lifecycle.pass,
    phases,
    lifecycle,
    coldbootRoute,
    clearRoute,
    staticRefs,
  };
}

let summary;
try {
  summary = await runProbe();
  console.log(JSON.stringify({
    probe: summary.probe,
    pass: summary.pass,
    captureHasMagic: summary.lifecycle.captureHasMagic,
    replayIncludesD0301B: summary.lifecycle.replayIncludesD0301B,
    browserReadyZero: summary.lifecycle.browserReadyZero,
    gateZero: summary.lifecycle.gateZero,
    directWriterHits: summary.lifecycle.directWriterHits,
    conclusion: summary.lifecycle.conclusion,
    report: path.basename(REPORT_PATH),
  }, null, 2));
  if (!summary.pass) process.exitCode = 1;
} catch (error) {
  summary = { probe: 'phase875-d0301b-owner-lifetime', pass: false, error: String(error?.stack || error) };
  console.error(summary.error);
  process.exitCode = 1;
} finally {
  try { fs.writeFileSync(REPORT_PATH, `${buildReport(summary)}\n`); } catch {}
}
