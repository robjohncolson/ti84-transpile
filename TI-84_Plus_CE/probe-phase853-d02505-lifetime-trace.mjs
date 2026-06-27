import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { decodeInstruction } from './ez80-decoder.js';
import { createPeripheralBus } from './peripherals.js';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase853-d02505-lifetime-trace.md');
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

const LIFETIME_FIELDS = Object.freeze([
  ['D02504', 0xD02504, 1],
  ['D02505', 0xD02505, 1],
  ['D02506', 0xD02506, 1],
  ['D00595', 0xD00595, 1],
  ['D00596', 0xD00596, 1],
  ['D0243A', 0xD0243A, 3],
  ['D0243D', 0xD0243D, 3],
  ['D02590', 0xD02590, 3],
  ['D0259D', 0xD0259D, 3],
  ['D000CA', 0xD000CA, 1],
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

const WATCH_WRITE_ADDRS = Object.freeze(new Set([0xD02504, 0xD02505, 0xD02506]));

const TARGET_PCS = Object.freeze(new Map([
  [0x058D54, 'candidate-writer-entry-058d54'],
  [0x058D5C, 'candidate-writer-predicate-call-058d5c'],
  [0x058D60, 'candidate-writer-z-branch-058d60'],
  [0x058D62, 'candidate-writer-non-z-path-058d62'],
  [0x058D65, 'candidate-writer-store-d02505-058d65'],
  [0x058D89, 'candidate-writer-cleanup-ret-058d89'],
  [0x0A223A, 'display-window-clear-0a223a'],
  [0x0A225B, 'display-window-read-d02505-0a225b'],
  [0x0A2294, 'display-window-read-d02505-0a2294'],
  [0x0A2802, 'display-window-save-shadow-0a2802'],
  [0x0A20CC, 'scroll-parent-0a20cc'],
  [0x0A20EA, 'scroll-parent-calls-0a321d'],
  [0x0A321D, 'scroll-down-entry-0a321d'],
  [0x0A322B, 'scroll-owner-di-0a322b'],
  [0x0A31FD, 'd02505-owner-boundary-0a31fd'],
  [0x0A3205, 'd02505-owner-fallthrough-0a3205'],
  [0x0A31B8, 'scroll-copy-setup-0a31b8'],
  [0x0A31E2, 'destructive-copy-owner-0a31e2'],
  [0x0A31A2, 'post-copy-tail-0a31a2'],
]));

const DECODE_WINDOWS = Object.freeze([
  { label: 'Known D02505 writer 0x058D54..0x058D8E', start: 0x058D54, end: 0x058D8E },
  { label: 'Display-window SaveShadow 0x0A2802..0x0A282D', start: 0x0A2802, end: 0x0A282D },
  { label: 'Display-window clear/fill 0x0A223A..0x0A22B1', start: 0x0A223A, end: 0x0A22B1 },
  { label: 'Scroll parent 0x0A20CC..0x0A20EE', start: 0x0A20CC, end: 0x0A20EE },
  { label: 'Scroll owner 0x0A321D..0x0A323A', start: 0x0A321D, end: 0x0A323A },
  { label: 'D02505 geometry gate 0x0A31FD..0x0A3216', start: 0x0A31FD, end: 0x0A3216 },
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

function captureValue(capture, addr, len) {
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

function formatBySpec(values, spec) {
  return Object.fromEntries(spec.map(([name, , len]) => [name, hex(values[name], len * 2)]));
}

function formatLifetimeFields(values) {
  return formatBySpec(values, LIFETIME_FIELDS);
}

function captureSnapshot(mem, fields) {
  return fields.map(([name, addr, len]) => ({
    name,
    addr,
    len,
    bytes: Array.from(mem.slice(addr, addr + len)),
    value: readValue(mem, addr, len),
  }));
}

function restoreSnapshot(mem, snapshot) {
  for (const field of snapshot) {
    for (let i = 0; i < field.len; i += 1) mem[field.addr + i] = field.bytes[i] ?? 0;
  }
}

function compactCpu(cpu) {
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
  };
}

function formatCpu(cpu) {
  return {
    ...cpu,
    pc: hex(cpu.pc),
    currentBlockPc: hex(cpu.currentBlockPc),
    sp: hex(cpu.sp),
    ix: hex(cpu.ix),
    iy: hex(cpu.iy),
    af: hex(cpu.af, 4),
    bc: hex(cpu.bc),
    de: hex(cpu.de),
    hl: hex(cpu.hl),
  };
}

function makeTrace() {
  return {
    phase: 'init',
    globalBlock: 0,
    phaseBlock: 0,
    recentPcs: [],
    branchHits: [],
    writeEvents: [],
    snapshots: [],
    targetCounts: Object.fromEntries([...TARGET_PCS.keys()].map((pc) => [hex(pc), 0])),
  };
}

function pushRecent(trace, pc) {
  trace.recentPcs.push(pc & 0xFFFFFF);
  if (trace.recentPcs.length > 96) trace.recentPcs.shift();
}

function snapshot(label, mem, cpu, trace, extra = {}) {
  const row = {
    label,
    phase: trace.phase,
    globalBlock: trace.globalBlock,
    phaseBlock: trace.phaseBlock,
    fields: readFieldList(mem, LIFETIME_FIELDS),
    cpu: compactCpu(cpu),
    recentPcs: [...trace.recentPcs],
    ...extra,
  };
  trace.snapshots.push(row);
  return row;
}

function formatSnapshot(row) {
  return {
    ...row,
    fields: formatLifetimeFields(row.fields),
    cpu: formatCpu(row.cpu),
    recentPcs: row.recentPcs.map((pc) => hex(pc)),
  };
}

function recordBranchHit(trace, mem, cpu, pc, mode) {
  const label = TARGET_PCS.get(pc);
  if (!label) return;
  const key = hex(pc);
  trace.targetCounts[key] = (trace.targetCounts[key] ?? 0) + 1;
  trace.branchHits.push({
    label,
    pc,
    mode,
    phase: trace.phase,
    globalBlock: trace.globalBlock,
    phaseBlock: trace.phaseBlock,
    cpu: compactCpu(cpu),
    fields: readFieldList(mem, LIFETIME_FIELDS),
    recentPcs: [...trace.recentPcs],
  });
}

function formatBranchHit(hit) {
  return {
    ...hit,
    pc: hex(hit.pc),
    cpu: formatCpu(hit.cpu),
    fields: formatLifetimeFields(hit.fields),
    recentPcs: hit.recentPcs.map((pc) => hex(pc)),
  };
}

function installWriteTrace(cpu, mem, trace) {
  const originalWrite8 = cpu.write8.bind(cpu);
  const originalWrite16 = cpu.write16.bind(cpu);
  const originalWrite24 = cpu.write24.bind(cpu);
  const recordCoveredWatchedBytes = (kind, addr, byteCount, beforeBytes) => {
    for (const watched of WATCH_WRITE_ADDRS) {
      const offset = (watched - (addr & 0xFFFFFF)) >>> 0;
      if (offset >= byteCount) continue;
      const before = beforeBytes[offset] ?? 0;
      const after = mem[watched] ?? 0;
      trace.writeEvents.push({
        kind,
        phase: trace.phase,
        globalBlock: trace.globalBlock,
        phaseBlock: trace.phaseBlock,
        blockPc: cpu._currentBlockPc & 0xFFFFFF,
        pc: cpu.pc & 0xFFFFFF,
        addr: watched,
        beforeValue: before,
        afterValue: after,
        cpu: compactCpu(cpu),
        recentPcs: [...trace.recentPcs],
      });
    }
  };

  cpu.write8 = (addr, value) => {
    const normalized = addr & 0xFFFFFF;
    const before = mem[normalized] ?? 0;
    originalWrite8(addr, value);
    if (WATCH_WRITE_ADDRS.has(normalized)) {
      trace.writeEvents.push({
        kind: 'write8',
        phase: trace.phase,
        globalBlock: trace.globalBlock,
        phaseBlock: trace.phaseBlock,
        blockPc: cpu._currentBlockPc & 0xFFFFFF,
        pc: cpu.pc & 0xFFFFFF,
        addr: normalized,
        beforeValue: before,
        afterValue: mem[normalized] ?? 0,
        cpu: compactCpu(cpu),
        recentPcs: [...trace.recentPcs],
      });
    }
  };
  cpu.write16 = (addr, value) => {
    const normalized = addr & 0xFFFFFF;
    const beforeBytes = [mem[normalized] ?? 0, mem[(normalized + 1) & 0xFFFFFF] ?? 0];
    originalWrite16(addr, value);
    recordCoveredWatchedBytes('write16', normalized, 2, beforeBytes);
  };
  cpu.write24 = (addr, value) => {
    const normalized = addr & 0xFFFFFF;
    const beforeBytes = [
      mem[normalized] ?? 0,
      mem[(normalized + 1) & 0xFFFFFF] ?? 0,
      mem[(normalized + 2) & 0xFFFFFF] ?? 0,
    ];
    originalWrite24(addr, value);
    recordCoveredWatchedBytes('write24', normalized, 3, beforeBytes);
  };

  return {
    uninstall() {
      cpu.write8 = originalWrite8;
      cpu.write16 = originalWrite16;
      cpu.write24 = originalWrite24;
    },
  };
}

function formatWriteEvent(event) {
  return {
    ...event,
    blockPc: hex(event.blockPc),
    pc: hex(event.pc),
    addr: hex(event.addr),
    beforeValue: hex(event.beforeValue, 2),
    afterValue: hex(event.afterValue, 2),
    cpu: formatCpu(event.cpu),
    recentPcs: event.recentPcs.map((pc) => hex(pc)),
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

function runWithTrace(machine, trace, phase, startAddress, startMode, opts = {}) {
  const { executor, mem, cpu } = machine;
  const userOnBlock = opts.onBlock;
  trace.phase = phase;
  trace.phaseBlock = 0;
  return executor.runFrom(startAddress, startMode, {
    ...opts,
    onBlock(pc, mode, meta, steps) {
      trace.globalBlock += 1;
      trace.phaseBlock += 1;
      const addr = pc & 0xFFFFFF;
      pushRecent(trace, addr);
      recordBranchHit(trace, mem, cpu, addr, mode);
      if (userOnBlock) userOnBlock(pc, mode, meta, steps);
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
  snapshot('after p1 coldboot', mem, cpu, trace);

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  fillSentinel(mem, cpu.sp, 3);
  phases.push({ name: 'p2-kernel', result: runWithTrace(machine, trace, 'p2-kernel', OUTER_LOOP, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 }) });
  snapshot('after p2 kernel', mem, cpu, trace);

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
  snapshot('after p3 postinit', mem, cpu, trace);

  cpu.halted = false;
  cpu.iff1 = 1;
  cpu.iff2 = 1;
  cpu._iy = 0xD00080;
  cpu.mbase = 0xD0;
  cpu.sp = STACK_TOP - 12;
  fillSentinel(mem, cpu.sp, 12);
  phases.push({ name: 'p4-warm-idle', result: runWithTrace(machine, trace, 'p4-warm-idle', WARM_IDLE, 'adl', { maxSteps: 1500000, maxLoopIterations: 100000 }) });
  snapshot('after p4 warm-idle', mem, cpu, trace);

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
  const targetCounts = { launchHome09dd62: 0, memInit09dee0: 0, clear001879: 0, cleanup0018f8: 0, halt0019b5: 0 };
  let snapshotBeforeClear = null;

  const result = runWithTrace(machine, trace, 'p5-launch-home-09dd62', LAUNCH_HOME, 'adl', {
    maxSteps: 300000,
    maxLoopIterations: 30000,
    onBlock(pc) {
      const addr = pc & 0xFFFFFF;
      if (addr === LAUNCH_HOME) targetCounts.launchHome09dd62 += 1;
      if (addr === 0x09DEE0) targetCounts.memInit09dee0 += 1;
      if (addr === 0x001879) {
        targetCounts.clear001879 += 1;
        if (!snapshotBeforeClear && readValue(mem, 0xD02590, 3) !== 0) {
          snapshotBeforeClear = {
            block: trace.globalBlock,
            pc: addr,
            fields: captureSnapshot(mem, BOOT_SNAPSHOT_FIELDS),
          };
        }
      }
      if (addr === 0x0018F8) targetCounts.cleanup0018f8 += 1;
      if (addr === HALT_IDLE) targetCounts.halt0019b5 += 1;
    },
  });
  snapshot('after p5 launch-home', mem, machine.cpu, trace);

  return { result, targetCounts, snapshotBeforeClear };
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
  snapshot('after p6 repaint', mem, cpu, trace);
  return { result, counts };
}

function runClearToOwner(machine, trace) {
  const { mem, peripherals, cpu } = machine;
  prepareEventFrame(mem, peripherals, cpu);
  seedClear(mem, peripherals);
  snapshot('after CLEAR seed before outer-loop', mem, cpu, trace);

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
  }
  snapshot('after p7 bounded owner stop', mem, cpu, trace, { stopReason });
  return { result: rawResult, stopReason };
}

function fmtAddr(value, width = 6) {
  return hex(value, width);
}

function fmtDisp(value) {
  return `${value >= 0 ? '+' : ''}${value}`;
}

function formatInstruction(insn) {
  switch (insn.tag) {
    case 'nop': return 'NOP';
    case 'di': return 'DI';
    case 'ei': return 'EI';
    case 'ret': return 'RET';
    case 'ret-conditional': return `RET ${insn.condition.toUpperCase()}`;
    case 'jr': return `JR ${fmtAddr(insn.target)}`;
    case 'jr-conditional': return `JR ${insn.condition.toUpperCase()},${fmtAddr(insn.target)}`;
    case 'jp': return `JP ${fmtAddr(insn.target)}`;
    case 'jp-conditional': return `JP ${insn.condition.toUpperCase()},${fmtAddr(insn.target)}`;
    case 'call': return `CALL ${fmtAddr(insn.target)}`;
    case 'call-conditional': return `CALL ${insn.condition.toUpperCase()},${fmtAddr(insn.target)}`;
    case 'push': return `PUSH ${insn.pair.toUpperCase()}`;
    case 'pop': return `POP ${insn.pair.toUpperCase()}`;
    case 'ld-special': return `LD ${insn.dest.toUpperCase()},${insn.src.toUpperCase()}`;
    case 'ld-reg-reg': return `LD ${insn.dest.toUpperCase()},${insn.src.toUpperCase()}`;
    case 'ld-reg-imm': return `LD ${insn.dest.toUpperCase()},${fmtAddr(insn.value, 2)}`;
    case 'ld-pair-imm': return `LD ${insn.pair.toUpperCase()},${fmtAddr(insn.value)}`;
    case 'ld-reg-mem': return `LD ${insn.dest.toUpperCase()},(${fmtAddr(insn.addr)})`;
    case 'ld-mem-reg': return `LD (${fmtAddr(insn.addr)}),${insn.src.toUpperCase()}`;
    case 'ld-reg-ind': return `LD ${insn.dest.toUpperCase()},(${insn.src.toUpperCase()})`;
    case 'ld-pair-mem': return `LD ${insn.pair.toUpperCase()},(${fmtAddr(insn.addr)})`;
    case 'ld-mem-pair': return `LD (${fmtAddr(insn.addr)}),${insn.pair.toUpperCase()}`;
    case 'ld-reg-ixd': return `LD ${insn.dest.toUpperCase()},(${insn.indexRegister.toUpperCase()}${fmtDisp(insn.displacement)})`;
    case 'ld-ixd-reg': return `LD (${insn.indexRegister.toUpperCase()}${fmtDisp(insn.displacement)}),${insn.src.toUpperCase()}`;
    case 'alu-reg': return `${insn.op.toUpperCase()} ${insn.src.toUpperCase()}`;
    case 'alu-imm': return `${insn.op.toUpperCase()} ${fmtAddr(insn.value, 2)}`;
    case 'alu-ixd': return `${insn.op.toUpperCase()} (${insn.indexRegister.toUpperCase()}${fmtDisp(insn.displacement)})`;
    case 'sbc-pair': return `SBC HL,${insn.src.toUpperCase()}`;
    case 'add-pair': return `ADD ${insn.dest.toUpperCase()},${insn.src.toUpperCase()}`;
    case 'inc-reg': return `INC ${insn.reg.toUpperCase()}`;
    case 'dec-reg': return `DEC ${insn.reg.toUpperCase()}`;
    case 'inc-pair': return `INC ${insn.pair.toUpperCase()}`;
    case 'dec-pair': return `DEC ${insn.pair.toUpperCase()}`;
    case 'mlt': return `MLT ${(insn.pair ?? insn.reg ?? '?').toUpperCase()}`;
    case 'lddr': return 'LDDR';
    case 'ldir': return 'LDIR';
    case 'ex-de-hl': return 'EX DE,HL';
    case 'indexed-cb-bit': return `BIT ${insn.bit},(${insn.indexRegister.toUpperCase()}${fmtDisp(insn.displacement)})`;
    case 'indexed-cb-set': return `SET ${insn.bit},(${insn.indexRegister.toUpperCase()}${fmtDisp(insn.displacement)})`;
    case 'indexed-cb-res': return `RES ${insn.bit},(${insn.indexRegister.toUpperCase()}${fmtDisp(insn.displacement)})`;
    default: return `${(insn.tag ?? 'unknown').toUpperCase()} ${JSON.stringify(insn)}`;
  }
}

function byteText(pc, length) {
  const bytes = [];
  for (let i = 0; i < length; i += 1) bytes.push(hex(romBytes[pc + i] ?? 0, 2).slice(2));
  return bytes.join(' ');
}

function decodeRange(start, end) {
  const records = [];
  let pc = start;
  while (pc < end) {
    let insn;
    try {
      insn = decodeInstruction(romBytes, pc, 'adl');
    } catch (error) {
      insn = { pc, length: 1, tag: 'db', error: String(error?.message || error) };
    }
    if (!Number.isFinite(insn.length) || insn.length <= 0) {
      insn = { pc, length: 1, tag: 'db', error: 'invalid decoded length' };
    }
    const length = Math.min(insn.length, end - pc);
    records.push({
      pc,
      length,
      bytes: byteText(pc, length),
      tag: insn.tag,
      text: insn.tag === 'db' ? `DB ${hex(romBytes[pc] ?? 0, 2)} ; ${insn.error}` : formatInstruction(insn),
      raw: insn,
    });
    pc += length;
  }
  return records;
}

function decodeTable(records) {
  return [
    '| PC | Bytes | Decode |',
    '| --- | --- | --- |',
    ...records.map((record) => `| ${hex(record.pc)} | \`${record.bytes}\` | \`${record.text}\` |`),
  ].join('\n');
}

function classifyAddressRef(addressPos) {
  const p1 = romBytes[addressPos - 1];
  const p2 = romBytes[addressPos - 2];
  const opPc = p2 === 0xDD || p2 === 0xFD || p2 === 0xED ? addressPos - 2 : addressPos - 1;
  let kind = 'unknown';
  let access = 'unknown';
  if (p1 === 0x3A) {
    kind = 'LD A,(addr)';
    access = 'read';
  } else if (p1 === 0x32) {
    kind = 'LD (addr),A';
    access = 'write';
  } else if (p1 === 0x21) {
    kind = 'LD HL,addr';
    access = 'address-load';
  } else if (p1 === 0x11) {
    kind = 'LD DE,addr';
    access = 'address-load';
  } else if (p1 === 0x01) {
    kind = 'LD BC,addr';
    access = 'address-load';
  } else if (p2 === 0xDD && p1 === 0x21) {
    kind = 'LD IX,addr';
    access = 'address-load';
  } else if (p2 === 0xFD && p1 === 0x21) {
    kind = 'LD IY,addr';
    access = 'address-load';
  } else if (p2 === 0xED && [0x4B, 0x5B, 0x6B, 0x7B].includes(p1)) {
    kind = 'LD pair,(addr)';
    access = 'read';
  } else if (p2 === 0xED && [0x43, 0x53, 0x63, 0x73].includes(p1)) {
    kind = 'LD (addr),pair';
    access = 'write';
  }
  let decode = null;
  if (opPc >= 0) {
    try {
      const insn = decodeInstruction(romBytes, opPc, 'adl');
      decode = {
        pc: opPc,
        bytes: byteText(opPc, Math.max(1, Math.min(insn.length ?? 1, 6))),
        text: formatInstruction(insn),
        tag: insn.tag,
      };
    } catch {
      decode = null;
    }
  }
  return { pc: opPc, addressPos, kind, access, decode };
}

function findDirectAddressRefs(addr) {
  const b0 = addr & 0xFF;
  const b1 = (addr >>> 8) & 0xFF;
  const b2 = (addr >>> 16) & 0xFF;
  const refs = [];
  for (let i = 0; i < romBytes.length - 2; i += 1) {
    if (romBytes[i] === b0 && romBytes[i + 1] === b1 && romBytes[i + 2] === b2) {
      refs.push(classifyAddressRef(i));
    }
  }
  const dedup = new Map();
  for (const ref of refs) {
    const key = `${ref.pc}:${ref.addressPos}:${ref.kind}`;
    if (!dedup.has(key)) dedup.set(key, ref);
  }
  return [...dedup.values()].sort((a, b) => a.pc - b.pc);
}

function formatRef(ref) {
  return {
    ...ref,
    pc: hex(ref.pc),
    addressPos: hex(ref.addressPos),
    decode: ref.decode ? {
      ...ref.decode,
      pc: hex(ref.decode.pc),
    } : null,
  };
}

function accessTable(refs) {
  if (!refs.length) return '- none';
  return [
    '| PC | Access | Kind | Decode |',
    '| --- | --- | --- | --- |',
    ...refs.map((ref) => `| ${hex(ref.pc)} | ${ref.access} | ${ref.kind} | \`${ref.decode?.text ?? '-'}\` |`),
  ].join('\n');
}

function snapshotTable(snapshots) {
  return [
    '| Snapshot | D02504 | D02505 | D02506 | D00595 | D00596 | D0243A | D02590 | D000CA |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...snapshots.map((row) => {
      const f = formatLifetimeFields(row.fields);
      return `| ${row.label} | ${f.D02504} | ${f.D02505} | ${f.D02506} | ${f.D00595} | ${f.D00596} | ${f.D0243A} | ${f.D02590} | ${f.D000CA} |`;
    }),
  ].join('\n');
}

function writeTable(events) {
  if (!events.length) return '- no CPU writes to `D02504..D02506` were observed';
  return [
    '| # | Phase | Block PC | Address | Before | After | Recent path tail |',
    '| ---: | --- | --- | --- | --- | --- | --- |',
    ...events.map((event, index) => {
      const recent = event.recentPcs.slice(-8).map((pc) => hex(pc)).join(' -> ');
      return `| ${index + 1} | ${event.phase} / ${event.kind ?? 'write8'} | ${hex(event.blockPc)} | ${hex(event.addr)} | ${hex(event.beforeValue, 2)} | ${hex(event.afterValue, 2)} | ${recent} |`;
    }),
  ].join('\n');
}

function branchTable(hits) {
  if (!hits.length) return '- no target hits were observed';
  return [
    '| # | Phase | PC | Label | Z | D02505 | Recent path tail |',
    '| ---: | --- | --- | --- | --- | --- | --- |',
    ...hits.map((hit, index) => {
      const recent = hit.recentPcs.slice(-8).map((pc) => hex(pc)).join(' -> ');
      return `| ${index + 1} | ${hit.phase} | ${hex(hit.pc)} | ${hit.label} | ${hit.cpu.flags.z ? '1' : '0'} | ${hex(hit.fields.D02505, 2)} | ${recent} |`;
    }),
  ].join('\n');
}

function buildDecodeSections(decodes) {
  return decodes.map((section) => [
    `### ${section.label}`,
    '',
    decodeTable(section.records),
  ].join('\n')).join('\n\n');
}

function buildReport(summary) {
  const tenWriteWord = summary.counts.d02505WritesTo0A === 1 ? 'write' : 'writes';
  const zeroWriteWord = summary.counts.d02505ZeroAfterTenWrites === 1 ? 'write' : 'writes';
  return [
    '# Phase 853: D02505 Owner / Lifetime Trace',
    '',
    'Probe: `probe-phase853-d02505-lifetime-trace.mjs`  ',
    'Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase853-d02505-lifetime-trace.mjs`',
    '',
    '## Summary',
    '',
    `- Result: ${summary.pass ? 'PASS' : 'FAIL'}; CLEAR route termination=\`${summary.clearRoute.result.termination}\`, steps=${summary.clearRoute.result.steps}.`,
    `- Real captures hold \`D02505=${summary.realCapture.D02505.pre}\` before CLEAR and \`${summary.realCapture.D02505.after}\` after CLEAR.`,
    `- Lifted route reaches \`0x0A31FD\` with \`D02505=${summary.atOwnerD02505}\`; the later \`0x0A31F2\` geometry therefore uses the Phase852 bad input unless patched.`,
    `- Candidate writer \`0x058D54..0x058D65\` was hit ${summary.counts.hit058d54} times, but \`0x058D65\` was hit ${summary.counts.hit058d65} times. Every observed \`0x058D60\` branch had Z=${summary.counts.all058d60Z ? '1' : 'not always 1'}, so the route goes to \`0x058D89\` and skips the \`LD (D02505),A\` store.`,
    `- CPU write watch found ${summary.counts.d02505Writes} writes to \`D02505\`, including ${summary.counts.d02505WritesTo0A} ${tenWriteWord} of \`0x0A\` and ${summary.counts.d02505ZeroAfterTenWrites} later zeroing ${zeroWriteWord} after a \`0x0A\` value. Diagnostic conclusion: ${summary.conclusion}.`,
    '',
    '## Lifted Lifetime Snapshots',
    '',
    snapshotTable(summary.snapshots),
    '',
    '## D02504..D02506 Write Watch',
    '',
    writeTable(summary.writeEvents),
    '',
    '## Candidate / Owner Hit Trace',
    '',
    branchTable(summary.branchHits),
    '',
    '## Direct ROM References To D02505',
    '',
    `Total refs with literal operand bytes: ${summary.directRefs.length}. Direct writes: ${summary.directWriteRefs.length}.`,
    '',
    accessTable(summary.directRefs),
    '',
    '## Candidate Decodes',
    '',
    buildDecodeSections(summary.decodes),
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

function summarizeRealCapture() {
  return Object.fromEntries(LIFETIME_FIELDS.map(([name, addr, len]) => [name, {
    pre: captureValue(preClearRam, addr, len),
    after: captureValue(afterClearRam, addr, len),
    len,
  }]));
}

function formatRealCapture(row) {
  return Object.fromEntries(Object.entries(row).map(([name, value]) => [name, {
    pre: value.pre == null ? null : hex(value.pre, value.len * 2),
    after: value.after == null ? null : hex(value.after, value.len * 2),
  }]));
}

function runProbe() {
  const trace = makeTrace();
  const machine = makeFreshMachine(trace);
  const phases = [];
  let phase5 = null;
  let repaint = null;
  let clearRoute = null;

  try {
    phases.push(...runBootToPhase5Ready(machine, trace));
    phase5 = runPhase5(machine, trace);
    phases.push({ name: 'p5-launch-home', result: phase5.result });
    if (!phase5.snapshotBeforeClear) throw new Error('phase5 pre-clear snapshot not captured');

    restoreSnapshot(machine.mem, phase5.snapshotBeforeClear.fields);
    snapshot('after restoring phase5 pre-clear snapshot', machine.mem, machine.cpu, trace);
    repaint = runRepaint(machine, trace);
    phases.push({ name: 'p6-home-repaint', result: repaint.result });

    rearmCxMain(machine.mem);
    write24(machine.mem, 0xD0243A, 0xD1A8CC);
    write24(machine.mem, 0xD0243D, 0xD2A83E);
    writeValue(machine.mem, 0xD02A29, 2, 0x0000);
    snapshot('after manual cx/edit setup before CLEAR', machine.mem, machine.cpu, trace);

    clearRoute = runClearToOwner(machine, trace);
    phases.push({ name: 'p7-clear-outer-loop-to-owner', result: clearRoute.result });
  } finally {
    machine.writeHook.uninstall();
  }

  const realCapture = summarizeRealCapture();
  const directRefs = findDirectAddressRefs(0xD02505);
  const directWriteRefs = directRefs.filter((ref) => ref.access === 'write');
  const decodes = DECODE_WINDOWS.map((window) => ({ ...window, records: decodeRange(window.start, window.end) }));
  const atOwnerHit = trace.branchHits.find((hit) => hit.pc === 0x0A31FD) ?? null;
  const branch058d60Hits = trace.branchHits.filter((hit) => hit.pc === 0x058D60);
  const d02505Writes = trace.writeEvents.filter((event) => event.addr === 0xD02505);
  const d02505WritesTo0A = d02505Writes.filter((event) => event.afterValue === 0x0A);
  const firstD02505TenWrite = d02505WritesTo0A[0] ?? null;
  const d02505ZeroAfterTenWrites = firstD02505TenWrite
    ? d02505Writes.filter((event) => event.globalBlock >= firstD02505TenWrite.globalBlock && event.afterValue === 0x00)
    : [];
  const hit058d54 = trace.branchHits.filter((hit) => hit.pc === 0x058D54).length;
  const hit058d65 = trace.branchHits.filter((hit) => hit.pc === 0x058D65).length;
  const all058d60Z = branch058d60Hits.length > 0 && branch058d60Hits.every((hit) => hit.cpu.flags.z);
  const atOwnerD02505Raw = atOwnerHit?.fields?.D02505 ?? readValue(machine.mem, 0xD02505, 1);

  const clearRouteReachedOwner = clearRoute?.result?.termination === 'captured-0a31e2-to-0a31a2'
    && Boolean(atOwnerHit);
  const realHasTen = realCapture.D02505.pre === 0x0A && realCapture.D02505.after === 0x0A;
  const skippedKnownWriter = hit058d54 > 0 && hit058d65 === 0 && all058d60Z;
  const liftedTenIsTransient = d02505WritesTo0A.length > 0 && d02505ZeroAfterTenWrites.length > 0;
  const ownerZero = atOwnerD02505Raw === 0x00;
  const conclusion = skippedKnownWriter && liftedTenIsTransient
    ? 'D02505 does become 0x0A transiently during launch-home, but a later 0x001879 clear zeros it; the CLEAR route then skips the 0x058D65 rewriter because 0x0800A8 leaves Z set at 0x058D60, so D02505 remains zero into 0x0A31FD'
    : 'lifted route did not produce a single unambiguous writer-skip explanation; inspect full JSON';
  const pass = clearRouteReachedOwner && realHasTen && ownerZero && skippedKnownWriter && liftedTenIsTransient;

  return {
    pass,
    conclusion,
    phases: phases.map((phase) => ({ name: phase.name, result: formatRunResult(phase.result) })),
    phase5: {
      result: formatRunResult(phase5.result),
      targetCounts: phase5.targetCounts,
      snapshotBeforeClear: {
        block: phase5.snapshotBeforeClear.block,
        pc: hex(phase5.snapshotBeforeClear.pc),
      },
    },
    repaint: {
      result: formatRunResult(repaint.result),
      counts: repaint.counts,
    },
    clearRoute: {
      result: formatRunResult(clearRoute.result),
      stopReason: clearRoute.stopReason,
    },
    atOwnerD02505: hex(atOwnerD02505Raw, 2),
    realCapture: formatRealCapture(realCapture),
    counts: {
      hit058d54,
      hit058d65,
      branch058d60Hits: branch058d60Hits.length,
      all058d60Z,
      d02504Writes: trace.writeEvents.filter((event) => event.addr === 0xD02504).length,
      d02505Writes: d02505Writes.length,
      d02505WritesTo0A: d02505WritesTo0A.length,
      d02505ZeroAfterTenWrites: d02505ZeroAfterTenWrites.length,
      d02506Writes: trace.writeEvents.filter((event) => event.addr === 0xD02506).length,
    },
    writeEvents: trace.writeEvents.map(formatWriteEvent),
    branchHits: trace.branchHits.map(formatBranchHit),
    snapshots: trace.snapshots.map(formatSnapshot),
    directRefs: directRefs.map(formatRef),
    directWriteRefs: directWriteRefs.map(formatRef),
    decodes,
    machine: {
      probe: 'phase853-d02505-lifetime-trace',
      pass,
      checks: {
        clearRouteReachedOwner,
        realHasTen,
        ownerZero,
        skippedKnownWriter,
        liftedTenIsTransient,
      },
      conclusion,
      rawCounts: {
        targetCounts: trace.targetCounts,
        writeEvents: trace.writeEvents.length,
        branchHits: trace.branchHits.length,
        snapshots: trace.snapshots.length,
        directRefs: directRefs.length,
        directWriteRefs: directWriteRefs.length,
      },
    },
  };
}

try {
  console.log('phase853: D02505 owner/lifetime trace');
  const summary = runProbe();
  fs.writeFileSync(REPORT_PATH, `${buildReport(summary)}\n`);
  console.log(JSON.stringify({
    probe: summary.machine.probe,
    pass: summary.pass,
    checks: summary.machine.checks,
    counts: summary.counts,
    atOwnerD02505: summary.atOwnerD02505,
    conclusion: summary.conclusion,
    report: path.basename(REPORT_PATH),
  }, null, 2));
  if (!summary.pass) process.exitCode = 1;
} catch (error) {
  const message = String(error?.stack || error);
  fs.writeFileSync(REPORT_PATH, [
    '# Phase 853: D02505 Owner / Lifetime Trace',
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
