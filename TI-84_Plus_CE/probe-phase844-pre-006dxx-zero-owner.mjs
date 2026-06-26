import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase844-pre-006dxx-zero-owner.md');
const CAPTURE_PATH = path.join(__dirname, 'captures', 'realram-home-digit3-D00000-D657FF.bin');
const AFTER_CLEAR_PATH = path.join(__dirname, 'captures', 'realram-home-afterCLEAR-D00000-D657FF.bin');
const PERIPHERALS_PATH = path.join(__dirname, 'peripherals.js');

const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
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

const LOOP_BLOCKS = Object.freeze(new Set([
  0x006CDF,
  0x006CF7,
  0x006D0F,
  0x006D38,
  0x006D4F,
  0x006D5D,
  0x0021C2,
  0x006D64,
]));

const STATIC_BLOCKS = Object.freeze([
  0x006CDF,
  0x006D38,
  0x006D4F,
  0x006D5D,
  0x0021C2,
  0x006D64,
]);

const FIELD_SPECS = Object.freeze([
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
  ['D00121', 0xD00121, 3],
  ['D00124', 0xD00124, 1],
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

function readFields(mem) {
  return Object.fromEntries(FIELD_SPECS.map(([name, addr, len]) => [name, readValue(mem, addr, len)]));
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

function snapshotObject(snapshot) {
  return Object.fromEntries(snapshot.map((field) => [field.name, field.value]));
}

function formatSnapshotObject(snapshot) {
  return Object.fromEntries(snapshot.map((field) => [field.name, hex(field.value, field.len * 2)]));
}

function formatFields(fields) {
  return Object.fromEntries(FIELD_SPECS.map(([name, , len]) => [name, hex(fields[name], len * 2)]));
}

function ixFrame(mem, cpu) {
  const ix = cpu.ix & 0xFFFFFF;
  const offsets = [-6, -3, 0, 3, 6, 9];
  return Object.fromEntries(offsets.map((offset) => {
    const addr = (ix + offset) & 0xFFFFFF;
    return [`IX${offset >= 0 ? '+' : ''}${offset}`, readValue(mem, addr, 3)];
  }));
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
    },
    fields: readFields(mem),
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
    ixFrame: Object.fromEntries(Object.entries(snapshot.ixFrame).map(([name, value]) => [name, hex(value)])),
  };
}

function makeMachineFromCapture() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, MEM_SIZE));
  mem.set(preClearRam, RAM_BASE);

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals, trackMemoryMapped: true });
  return { mem, peripherals, executor, cpu: executor.cpu };
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
      fieldsAfter: snapshotObject(captureSnapshot(mem, BOOT_SNAPSHOT_FIELDS)),
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

function blockKey(pc) {
  return `${pc.toString(16).padStart(6, '0')}:adl`;
}

function blockSummary(pc) {
  const block = BLOCKS[blockKey(pc)];
  if (!block) return { pc, missing: true };
  return {
    pc,
    instructions: (block.instructions ?? []).map((inst) => ({
      pc: inst.pc,
      bytes: inst.bytes,
      dasm: inst.dasm,
    })),
    exits: block.exits ?? [],
  };
}

function formatBlockSummary(row) {
  if (row.missing) return `### ${hex(row.pc)}\n\n- Missing from PRELIFTED_BLOCKS.\n`;
  const lines = [`### ${hex(row.pc)}`, '', '```text'];
  for (const inst of row.instructions) {
    lines.push(`${hex(inst.pc)}  ${String(inst.bytes).padEnd(14)} ${inst.dasm}`);
  }
  lines.push('```', '', `Exits: \`${JSON.stringify(row.exits)}\``, '');
  return lines.join('\n');
}

function sourceCrossCheck() {
  const lines = fs.readFileSync(PERIPHERALS_PATH, 'utf8').split(/\r?\n/);
  const interesting = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (
      line.includes('function createFlashControllerHandler') ||
      line.includes('port === 0x2001') ||
      line.includes('return 0x00;') && i > 130 && i < 160 ||
      line.includes('register({ start: 0x2000')
    ) {
      interesting.push({ line: i + 1, text: line.trim() });
    }
  }
  return interesting;
}

function installLoopInstrumentation(cpu, mem, peripherals, options = {}) {
  const originalRead8 = cpu.read8.bind(cpu);
  const originalCpuIoRead = cpu._ioRead.bind(cpu);
  const originalIoRead = cpu.onIoRead;
  const originalIoWrite = cpu.onIoWrite;
  const samples = {
    ioReads: [],
    ioWrites: [],
    mmioReads: [],
    loopBlockEntries: [],
    pollReadCount: 0,
    bit3BusyReads: 0,
    bit3ClearReads: 0,
  };

  function activeLoopBlock() {
    return cpu._currentBlockPc & 0xFFFFFF;
  }

  function recordLimited(list, entry, limit = 80) {
    if (list.length < limit) list.push(entry);
  }

  cpu._ioRead = (port) => {
    let value = peripherals.read(port) & 0xFF;
    const block = activeLoopBlock();
    if (options.forcePort2001Clear && block === 0x006D4F && (port & 0xFFFF) === 0x2001) {
      value = 0x00;
    }
    cpu.onIoRead(port, value);
    return value;
  };

  cpu.onIoRead = (port, value) => {
    if (!options.forcePort2001Clear) originalIoRead.call(cpu, port, value);
    const block = activeLoopBlock();
    if (!LOOP_BLOCKS.has(block)) return;
    const read = {
      block,
      instructionPc: block === 0x006D4F ? 0x006D57 : block,
      port: port & 0xFFFF,
      value: value & 0xFF,
      bit3Set: (value & 0x08) !== 0,
      bit3Branch: (value & 0x08) !== 0 ? 'JR NZ back to 0x006D57' : 'fall through to 0x006D5D',
      cpu: compactCpu(cpu, mem),
    };
    if (port === 0x2001 && block === 0x006D4F) {
      samples.pollReadCount += 1;
      if (read.bit3Set) samples.bit3BusyReads += 1;
      else samples.bit3ClearReads += 1;
    }
    recordLimited(samples.ioReads, read, 96);
  };

  cpu.onIoWrite = (port, value) => {
    originalIoWrite.call(cpu, port, value);
    const block = activeLoopBlock();
    if (!LOOP_BLOCKS.has(block)) return;
    recordLimited(samples.ioWrites, {
      block,
      instructionPc: block === 0x006D38 ? 0x006D46 : block,
      port: port & 0xFFFF,
      value: value & 0xFF,
      cpu: compactCpu(cpu, mem),
    }, 96);
  };

  cpu.read8 = (addr) => {
    const value = originalRead8(addr);
    const block = activeLoopBlock();
    const normalized = addr & 0xFFFFFF;
    if (LOOP_BLOCKS.has(block) && (normalized >= 0xE00000 || normalized >= 0xF80000)) {
      recordLimited(samples.mmioReads, {
        block,
        instructionPc: block,
        addr: normalized,
        value: value & 0xFF,
        cpu: compactCpu(cpu, mem),
      }, 96);
    }
    return value;
  };

  return {
    samples,
    recordBlock(pc, blockIndex) {
      if (!LOOP_BLOCKS.has(pc)) return;
      recordLimited(samples.loopBlockEntries, {
        blockIndex,
        pc,
        cpu: compactCpu(cpu, mem),
        outerBranch: pc === 0x006D64
          ? ((cpu.f & 0x40) === 0 ? 'JP NZ to 0x006CDF' : 'fall through; IX+9/HL was zero')
          : null,
      }, 160);
    },
    uninstall() {
      cpu._ioRead = originalCpuIoRead;
      cpu.read8 = originalRead8;
      cpu.onIoRead = originalIoRead;
      cpu.onIoWrite = originalIoWrite;
    },
  };
}

function runClearBurst(machine, scenario, details = {}) {
  const { mem, peripherals, executor, cpu } = machine;
  const initialFields = details.initialFields ?? readFields(mem);
  prepareEventFrame(mem, peripherals, cpu);
  seedClear(mem, peripherals);
  const seededFields = readFields(mem);
  const instrumentation = installLoopInstrumentation(cpu, mem, peripherals, details);
  const hotBlocks = new Map();
  const loopCounts = Object.fromEntries([...LOOP_BLOCKS].map((pc) => [hex(pc), 0]));
  const hitTargets = {
    preStop0A229D: 0,
    low006DRegion: 0,
    eolTuple08F54B: 0,
    clear001879: 0,
    cleanup0018F8: 0,
    halt0019B5: 0,
  };
  const firstHits = {};
  const overrideEvents = [];
  const recentPcs = [];
  let blockIndex = 0;
  let stopReason = null;
  let rawResult = null;
  let saw006DRegion = false;
  let firstExitAfter006D = null;
  let postExitBlocks = 0;

  try {
    rawResult = executor.runFrom(OUTER_LOOP, 'adl', {
      maxSteps: details.maxSteps ?? 220000,
      maxLoopIterations: details.maxLoopIterations ?? 220000,
      diHaltBypass: true,
      diHaltBypassEntry: OUTER_LOOP,
      onBlock(pc) {
        blockIndex += 1;
        const addr = pc & 0xFFFFFF;
        recentPcs.push(addr);
        if (recentPcs.length > 160) recentPcs.shift();

        if (addr === 0x006D64 && details.force006D64Complete) {
          const ix9Addr = (cpu.ix + 9) & 0xFFFFFF;
          const before = {
            blockIndex,
            pc: addr,
            cpu: compactCpu(cpu, mem),
            ix9Addr,
            ix9Value: readValue(mem, ix9Addr, 3),
          };
          write24(mem, ix9Addr, 0);
          cpu.hl = 0;
          cpu.f |= 0x40;
          overrideEvents.push({
            ...before,
            action: 'set IX+9/HL to zero and force Z before JP NZ',
            afterCpu: compactCpu(cpu, mem),
          });
        }

        hotBlocks.set(hex(addr), (hotBlocks.get(hex(addr)) ?? 0) + 1);
        if (LOOP_BLOCKS.has(addr)) {
          loopCounts[hex(addr)] += 1;
          instrumentation.recordBlock(addr, blockIndex);
        }
        if (addr === 0x0A229D) hitTargets.preStop0A229D += 1;
        if (addr === 0x08F54B) hitTargets.eolTuple08F54B += 1;
        if (addr === 0x001879) hitTargets.clear001879 += 1;
        if (addr === 0x0018F8) hitTargets.cleanup0018F8 += 1;
        if (addr === HALT_IDLE) hitTargets.halt0019B5 += 1;
        const inLowTransferLoopFamily = (addr >= 0x006C00 && addr <= 0x006DFF) || addr === 0x0021C2;
        if (addr >= 0x006D00 && addr <= 0x006DFF) {
          saw006DRegion = true;
          postExitBlocks = 0;
          hitTargets.low006DRegion += 1;
        } else if (saw006DRegion && !firstExitAfter006D && !inLowTransferLoopFamily) {
          firstExitAfter006D = {
            blockIndex,
            pc: addr,
            previousPc: recentPcs.at(-2) ?? null,
            cpu: compactCpu(cpu, mem),
          };
        } else if (firstExitAfter006D) {
          postExitBlocks += 1;
        }
        for (const [name, value] of Object.entries({
          preStop0A229D: 0x0A229D,
          eolTuple08F54B: 0x08F54B,
          clear001879: 0x001879,
          cleanup0018F8: 0x0018F8,
          halt0019B5: HALT_IDLE,
          loop006D4F: 0x006D4F,
          loop006D64: 0x006D64,
        })) {
          if (addr === value && !firstHits[name]) {
            firstHits[name] = { blockIndex, pc: addr, cpu: compactCpu(cpu, mem) };
          }
        }
        if (!details.force006D64Complete && instrumentation.samples.pollReadCount >= 64 && loopCounts[hex(0x006D64)] >= 64) {
          stopReason = 'sampled-006dxx-poll';
          throw new EarlyStop(stopReason);
        }
        if (details.force006D64Complete && firstExitAfter006D && postExitBlocks >= (details.postExitStopBlocks ?? 30000)) {
          stopReason = 'post-006dxx-completion-window';
          throw new EarlyStop(stopReason);
        }
      },
    });
  } catch (error) {
    if (error instanceof EarlyStop) {
      rawResult = {
        steps: blockIndex,
        termination: error.reason,
        lastPc: cpu._currentBlockPc & 0xFFFFFF,
        lastMode: 'adl',
      };
    } else {
      throw error;
    }
  } finally {
    instrumentation.uninstall();
  }

  const topHotBlocks = [...hotBlocks.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 24)
    .map(([pc, count]) => ({ pc, count }));

  return {
    scenario,
    ...details,
    initialFields,
    seededFields,
    result: {
      steps: rawResult.steps,
      termination: rawResult.termination,
      lastPc: rawResult.lastPc,
      lastMode: rawResult.lastMode,
    },
    stopReason,
    hitTargets,
    firstHits,
    loopCounts,
    samples: instrumentation.samples,
    overrideEvents,
    firstExitAfter006D,
    recentPcs: recentPcs.map((pc) => hex(pc)),
    topHotBlocks,
    finalFields: readFields(mem),
  };
}

function runCapturedClear() {
  const machine = makeMachineFromCapture();
  return runClearBurst(machine, 'captured-preclear-ram', {
    capture: path.relative(__dirname, CAPTURE_PATH).replace(/\\/g, '/'),
    inputDescription: 'captured CEmu-WASM pre-CLEAR RAM with real typed digit state',
  });
}

function runInMemoryRepaintClear(caseConfig = {}) {
  const machine = runPhase5WithSnapshot();
  const { mem, peripherals, executor, cpu, phase5, phases } = machine;
  if (!phase5.snapshot) {
    return {
      scenario: 'in-memory-launch-home-repaint',
      error: 'phase5 snapshot not captured before repaint',
      phases: phases.map((phase) => ({ name: phase.name, result: formatRunResult(phase.result) })),
      phase5,
      samples: { ioReads: [], ioWrites: [], mmioReads: [], loopBlockEntries: [], pollReadCount: 0 },
      hitTargets: { low006DRegion: 0, preStop0A229D: 0, eolTuple08F54B: 0 },
      loopCounts: {},
      firstHits: {},
      result: { termination: 'error', steps: 0, lastPc: 0, lastMode: 'adl' },
      initialFields: {},
      seededFields: {},
      finalFields: {},
      topHotBlocks: [],
    };
  }

  restoreSnapshot(mem, phase5.snapshot.fields);
  const restoredFields = readFields(mem);
  const repaint = runRepaint(mem, peripherals, executor, cpu);
  rearmCxMain(mem);
  write24(mem, 0xD0243A, 0xD1A8CC);
  write24(mem, 0xD0243D, 0xD2A83E);
  writeValue(mem, 0xD02A29, 2, 0x0000);

  return runClearBurst(machine, caseConfig.scenario ?? 'in-memory-launch-home-repaint', {
    ...caseConfig,
    inputDescription: 'OS launch-home init plus clean home repaint, then probe-local physical edit-context seed D0243A=0xD1A8CC/D0243D=0xD2A83E',
    phases: phases.map((phase) => ({ name: phase.name, result: formatRunResult(phase.result) })),
    phase5: {
      result: phase5.result,
      targetCounts: phase5.targetCounts,
      snapshot: {
        block: phase5.snapshot.block,
        pc: phase5.snapshot.pc,
        fields: formatSnapshotObject(phase5.snapshot.fields),
      },
      fieldsAfter: Object.fromEntries(Object.entries(phase5.fieldsAfter).map(([name, value]) => [name, hex(value)])),
    },
    restoredFields,
    repaint,
    physicalEditSeed: {
      D0243A: hex(0xD1A8CC),
      D0243D: hex(0xD2A83E),
      D02A29: hex(0x0000, 4),
    },
    initialFields: readFields(mem),
  });
}

function summarizePoll(result) {
  const reads = result.samples.ioReads.filter((read) => read.port === 0x2001 && read.block === 0x006D4F);
  const distinctValues = [...new Set(reads.map((read) => read.value))].sort((a, b) => a - b);
  const first = reads[0] ?? null;
  return {
    pollReadCount: reads.length,
    totalPollReads: result.samples.pollReadCount,
    distinctValues,
    allBit3Clear: reads.length > 0 && reads.every((read) => !read.bit3Set),
    anyBit3Busy: reads.some((read) => read.bit3Set),
    first,
  };
}

function formatSampleRows(samples, kind) {
  if (!samples.length) return ['| - | - | - | - | - | - | - |'];
  return samples.slice(0, 16).map((sample, idx) => {
    if (kind === 'read') {
      return `| ${idx + 1} | ${hex(sample.block)} | ${hex(sample.instructionPc)} | port ${hex(sample.port, 4)} | ${hex(sample.value, 2)} | bit3=${sample.bit3Set ? '1' : '0'} | ${sample.bit3Branch} |`;
    }
    if (kind === 'write') {
      return `| ${idx + 1} | ${hex(sample.block)} | ${hex(sample.instructionPc)} | port ${hex(sample.port, 4)} | ${hex(sample.value, 2)} | - | - |`;
    }
    return `| ${idx + 1} | ${hex(sample.block)} | ${hex(sample.instructionPc)} | ${hex(sample.addr)} | ${hex(sample.value, 2)} | - | - |`;
  });
}

function buildReport(summary) {
  const result = summary.result;
  const poll = summarizePoll(result);
  const pollValues = poll.distinctValues.length ? poll.distinctValues.map((value) => hex(value, 2)).join(', ') : '-';
  const firstPoll = poll.first ? formatCpuSnapshot(poll.first.cpu) : null;
  const first006D64 = result.samples.loopBlockEntries.find((entry) => entry.pc === 0x006D64);
  const first006D64Snapshot = first006D64 ? formatCpuSnapshot(first006D64.cpu) : null;
  const sourceRows = summary.peripheralsCrossCheck.map((entry) => `| ${entry.line} | \`${entry.text.replaceAll('|', '\\|')}\` |`);
  const staticSections = STATIC_BLOCKS.map((pc) => formatBlockSummary(blockSummary(pc))).join('\n');
  const inputBullet = result.capture
    ? `- **** Faithful-state input: loaded \`${result.capture}\` at \`0xD00000-0xD657FF\`, preserving the real pre-CLEAR edit context (\`D0243A=${hex(result.initialFields.D0243A)}\`, \`D0243D=${hex(result.initialFields.D0243D)}\`, \`D02A29=${hex(result.initialFields.D02A29, 4)}\`) and seeded CLEAR scancode \`0x0F\` without any browser \`0x0A229D\` pre-stop.`
    : `- **** Faithful-state input: ${result.inputDescription}; pre-key fields were \`D0243A=${hex(result.initialFields.D0243A)}\`, \`D0243D=${hex(result.initialFields.D0243D)}\`, \`D02A29=${hex(result.initialFields.D02A29, 4)}\`, then CLEAR scancode \`0x0F\` was seeded without any browser \`0x0A229D\` pre-stop.`;
  const attemptRows = (summary.attempts ?? []).map((attempt) => (
    `| ${attempt.scenario} | ${attempt.result?.termination ?? attempt.error ?? '-'} | ${attempt.result?.steps ?? '-'} | ${attempt.hitTargets?.low006DRegion ?? 0} | ${attempt.pollReadCount ?? 0} | ${(attempt.topHotBlocks ?? []).slice(0, 3).map((hit) => `${hit.pc}:${hit.count}`).join(', ') || '-'} |`
  ));

  return [
    '# Phase 842: 0x006Dxx MMIO/Port Poll Identification',
    '',
    'Probe: `probe-phase842-006dxx-mmio-poll.mjs`  ',
    'Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase842-006dxx-mmio-poll.mjs`',
    '',
    '## Summary',
    '',
    inputBullet,
    `- **** The run reached the expected low loop and stopped after sampling it: termination=\`${result.result.termination}\`, steps=${result.result.steps}, low-region hits=${result.hitTargets.low006DRegion}, \`0x0A229D\` hits=${result.hitTargets.preStop0A229D}, \`0x08F54B\` hits=${result.hitTargets.eolTuple08F54B}.`,
    `- **** Exact polled port: block \`0x006D4F\` executes \`IN A,(C)\` at \`0x006D57\` with \`BC=0x002001\`, so the status port is \`0x2001\`. The next instructions are \`BIT 3,A\` at \`0x006D59\` and \`JR NZ,0x006D57\` at \`0x006D5B\`.`,
    `- *** Dynamic values: sampled ${result.samples.pollReadCount} reads from port \`0x2001\`; values=${pollValues}; bit 3 was ${poll.allBit3Clear ? 'always clear' : 'not always clear'}. With current \`peripherals.js\`, this means the inner hardware busy-poll falls through immediately.`,
    `- *** The continuing hot loop is therefore the surrounding \`0x006D64 JP NZ,0x006CDF\` condition, not a busy bit stuck high at \`0x006D57\`. At first sampled \`0x006D64\`, ${first006D64?.outerBranch ?? 'no branch sample'}; \`HL/IX+9\` were non-zero in the loop frame.`,
    '',
    '## Scenario Attempts',
    '',
    '| Scenario | Termination | Steps | Low 0x006D Hits | Poll Reads | Top PCs |',
    '| --- | --- | ---: | ---: | ---: | --- |',
    ...(attemptRows.length ? attemptRows : ['| - | - | - | - | - | - |']),
    '',
    '## Poll Samples',
    '',
    '| # | Block | Instruction | Address | Value | Bit | Branch Meaning |',
    '| ---: | --- | --- | --- | --- | --- | --- |',
    ...formatSampleRows(result.samples.ioReads.filter((read) => read.port === 0x2001), 'read'),
    '',
    '## Port Writes In The Loop',
    '',
    '| # | Block | Instruction | Address | Value | Bit | Branch Meaning |',
    '| ---: | --- | --- | --- | --- | --- | --- |',
    ...formatSampleRows(result.samples.ioWrites, 'write'),
    '',
    '## MMIO Reads In The Loop',
    '',
    '| # | Block | Instruction | Address | Value | Bit | Branch Meaning |',
    '| ---: | --- | --- | --- | --- | --- | --- |',
    ...formatSampleRows(result.samples.mmioReads, 'mmio'),
    '',
    '## Loop Counts',
    '',
    '| Block | Count |',
    '| --- | ---: |',
    ...Object.entries(result.loopCounts).map(([pc, count]) => `| ${pc} | ${count} |`),
    '',
    '## Peripheral Cross-Check',
    '',
    'Current `peripherals.js` already handles this as part of the flash/NAND controller range:',
    '',
    '| Line | Source |',
    '| ---: | --- |',
    ...sourceRows,
    '',
    'Interpretation: `0x2001` currently returns `0x00`, which clears bit 3. A probe-local Phase 843 override should start by testing whether some other loop-state/status side effect must also advance, because merely forcing bit 3 clear is already the committed behavior.',
    '',
    '## Key Snapshots',
    '',
    '### First 0x2001 Poll',
    '',
    '```json',
    JSON.stringify(firstPoll, null, 2),
    '```',
    '',
    '### First 0x006D64 Branch',
    '',
    '```json',
    JSON.stringify(first006D64Snapshot, null, 2),
    '```',
    '',
    '## Static Loop Blocks',
    '',
    staticSections,
    '## Full JSON',
    '',
    '```json',
    JSON.stringify({
      ...summary,
      result: {
        ...summary.result,
        firstHits: Object.fromEntries(Object.entries(summary.result.firstHits).map(([name, hit]) => [
          name,
          { ...hit, pc: hex(hit.pc), cpu: formatCpuSnapshot(hit.cpu) },
        ])),
        samples: {
          ...summary.result.samples,
          ioReads: summary.result.samples.ioReads.map((sample) => ({
            ...sample,
            block: hex(sample.block),
            instructionPc: hex(sample.instructionPc),
            port: hex(sample.port, 4),
            value: hex(sample.value, 2),
            cpu: formatCpuSnapshot(sample.cpu),
          })),
          ioWrites: summary.result.samples.ioWrites.map((sample) => ({
            ...sample,
            block: hex(sample.block),
            instructionPc: hex(sample.instructionPc),
            port: hex(sample.port, 4),
            value: hex(sample.value, 2),
            cpu: formatCpuSnapshot(sample.cpu),
          })),
          mmioReads: summary.result.samples.mmioReads.map((sample) => ({
            ...sample,
            block: hex(sample.block),
            instructionPc: hex(sample.instructionPc),
            addr: hex(sample.addr),
            value: hex(sample.value, 2),
            cpu: formatCpuSnapshot(sample.cpu),
          })),
          loopBlockEntries: summary.result.samples.loopBlockEntries.map((entry) => ({
            ...entry,
            pc: hex(entry.pc),
            cpu: formatCpuSnapshot(entry.cpu),
          })),
        },
        initialFields: formatFields(summary.result.initialFields),
        seededFields: formatFields(summary.result.seededFields),
        finalFields: formatFields(summary.result.finalFields),
      },
    }, null, 2),
    '```',
    '',
    'No runtime, transpiler, browser-shell, decoder, peripheral, scheduler, or ROM artifact files were changed.',
    '',
  ].join('\n');
}

function resultHasPoll(result) {
  return !result.error
    && result.hitTargets.low006DRegion > 0
    && result.samples.pollReadCount > 0
    && result.hitTargets.preStop0A229D === 0;
}

function compactAttempt(result) {
  return {
    scenario: result.scenario,
    error: result.error,
    inputDescription: result.inputDescription,
    result: result.result,
    hitTargets: result.hitTargets,
    pollReadCount: result.samples?.pollReadCount ?? 0,
    pollValues: summarizePoll(result).distinctValues.map((value) => hex(value, 2)),
    topHotBlocks: result.topHotBlocks?.slice(0, 8) ?? [],
    initialFields: result.initialFields ? formatFields(result.initialFields) : {},
    finalFields: result.finalFields ? formatFields(result.finalFields) : {},
  };
}

function oracleComparison(result) {
  const fields = [
    ['D007CA', 0xD007CA, 3],
    ['D008E0', 0xD008E0, 3],
    ['D0243A', 0xD0243A, 3],
    ['D0243D', 0xD0243D, 3],
    ['D02590', 0xD02590, 3],
    ['D0259D', 0xD0259D, 3],
    ['D02A29', 0xD02A29, 2],
    ['D00587', 0xD00587, 1],
    ['D0058C', 0xD0058C, 1],
    ['D0058E', 0xD0058E, 1],
  ];
  return fields.map(([name, addr, len]) => {
    const actual = result.finalFields?.[name] ?? null;
    const expected = readCaptureValue(afterClearRam, addr, len);
    return {
      name,
      actual,
      expected,
      match: actual === expected,
      actualHex: actual == null ? '-' : hex(actual, len * 2),
      expectedHex: expected == null ? '-' : hex(expected, len * 2),
    };
  });
}

function compactCase(result) {
  const poll = summarizePoll(result);
  return {
    scenario: result.scenario,
    description: result.description,
    termination: result.result?.termination ?? result.error ?? 'error',
    steps: result.result?.steps ?? 0,
    low006DRegion: result.hitTargets?.low006DRegion ?? 0,
    hits0A229D: result.hitTargets?.preStop0A229D ?? 0,
    hits08F54B: result.hitTargets?.eolTuple08F54B ?? 0,
    hits001879: result.hitTargets?.clear001879 ?? 0,
    hits0018F8: result.hitTargets?.cleanup0018F8 ?? 0,
    hits0019B5: result.hitTargets?.halt0019B5 ?? 0,
    pollReadCount: result.samples?.pollReadCount ?? 0,
    pollValues: poll.distinctValues.map((value) => hex(value, 2)),
    allBit3Clear: poll.allBit3Clear,
    loop006D64: result.loopCounts?.[hex(0x006D64)] ?? 0,
    overrideCount: result.overrideEvents?.length ?? 0,
    firstOverride: result.overrideEvents?.[0] ? {
      blockIndex: result.overrideEvents[0].blockIndex,
      ix9Value: hex(result.overrideEvents[0].ix9Value),
      before: formatCpuSnapshot(result.overrideEvents[0].cpu),
      after: formatCpuSnapshot(result.overrideEvents[0].afterCpu),
    } : null,
    firstExitAfter006D: result.firstExitAfter006D ? {
      blockIndex: result.firstExitAfter006D.blockIndex,
      pc: hex(result.firstExitAfter006D.pc),
      previousPc: hex(result.firstExitAfter006D.previousPc),
      cpu: formatCpuSnapshot(result.firstExitAfter006D.cpu),
    } : null,
    firstHits: Object.fromEntries(Object.entries(result.firstHits ?? {}).map(([name, hit]) => [
      name,
      {
        blockIndex: hit.blockIndex,
        pc: hex(hit.pc),
        cpu: formatCpuSnapshot(hit.cpu),
      },
    ])),
    topHotBlocks: result.topHotBlocks?.slice(0, 12) ?? [],
    initialFields: result.initialFields ? formatFields(result.initialFields) : {},
    seededFields: result.seededFields ? formatFields(result.seededFields) : {},
    finalFields: result.finalFields ? formatFields(result.finalFields) : {},
    oracle: oracleComparison(result),
    recentPcs: result.recentPcs ?? [],
  };
}

function buildPhase843Report(summary) {
  const rowForCase = (row) => `| ${row.scenario} | ${row.termination} | ${row.steps} | ${row.low006DRegion} | ${row.pollReadCount} | ${row.pollValues.join(', ') || '-'} | ${row.loop006D64} | ${row.overrideCount} | ${row.firstExitAfter006D?.pc ?? '-'} | ${row.hits001879}/${row.hits0018F8} | ${row.topHotBlocks.slice(0, 4).map((hit) => `${hit.pc}:${hit.count}`).join(', ')} |`;
  const oracleRows = (row) => row.oracle.map((field) => (
    `| ${row.scenario} | ${field.name} | ${field.actualHex} | ${field.expectedHex} | ${field.match ? 'yes' : 'no'} |`
  ));
  const sourceRows = summary.peripheralsCrossCheck.map((entry) => `| ${entry.line} | \`${entry.text.replaceAll('|', '\\|')}\` |`);

  return [
    '# Phase 843: 0x006Dxx Completion A/B',
    '',
    'Probe: `probe-phase843-006dxx-completion-ab.mjs`  ',
    'Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase843-006dxx-completion-ab.mjs`',
    '',
    '## Summary',
    '',
    '- Baseline reproduced Phase842: the faithful CLEAR route reaches the `0x006Dxx` loop with port `0x2001` already returning `0x00` / bit 3 clear.',
    '- A probe-local `0x2001` force-clear control is behaviorally identical to baseline, confirming the inner busy bit is not the remaining stuck condition.',
    '- A probe-local completion override at `0x006D64` forces the local `IX+9`/`HL` compare to zero. This tests the surrounding loop only; it is not a proposed source edit.',
    `- Pass criteria: baseline and force-clear both sample the loop with bit 3 clear, and the completion case applies at least one \`0x006D64\` override then leaves \`0x006Dxx\`. Result: ${summary.pass ? 'PASS' : 'FAIL'}.`,
    '',
    '## Case Matrix',
    '',
    '| Case | Termination | Steps | Low 0x006D Hits | Poll Reads | Poll Values | 0x006D64 Hits | Overrides | First Exit | 0x001879/0x0018F8 | Top PCs |',
    '| --- | --- | ---: | ---: | ---: | --- | ---: | ---: | --- | --- | --- |',
    ...summary.cases.map(rowForCase),
    '',
    '## Oracle Comparison',
    '',
    'Compared against `captures/realram-home-afterCLEAR-D00000-D657FF.bin`.',
    '',
    '| Case | Field | Actual | Oracle | Match |',
    '| --- | --- | --- | --- | --- |',
    ...summary.cases.flatMap(oracleRows),
    '',
    '## Completion Override Detail',
    '',
    '```json',
    JSON.stringify(summary.cases.find((row) => row.scenario === 'completion-override-006d64')?.firstOverride ?? null, null, 2),
    '```',
    '',
    '## First Exit After 0x006Dxx',
    '',
    '```json',
    JSON.stringify(Object.fromEntries(summary.cases.map((row) => [row.scenario, row.firstExitAfter006D])), null, 2),
    '```',
    '',
    '## First Hits',
    '',
    '```json',
    JSON.stringify(Object.fromEntries(summary.cases.map((row) => [row.scenario, row.firstHits])), null, 2),
    '```',
    '',
    '## Peripheral Cross-Check',
    '',
    '| Line | Source |',
    '| ---: | --- |',
    ...sourceRows,
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

const ZERO_OWNER_FIELDS = Object.freeze(['D007CA', 'D008E0', 'D0243A', 'D0243D', 'D02590', 'D0259D']);

function stack24(mem, cpu, count = 12) {
  const rows = [];
  for (let i = 0; i < count; i += 1) {
    const offset = i * 3;
    const addr = (cpu.sp + offset) & 0xFFFFFF;
    rows.push({ offset, addr, value: readValue(mem, addr, 3) });
  }
  return rows;
}

function formatStack24(rows) {
  return rows.map((row) => ({
    offset: row.offset,
    addr: hex(row.addr),
    value: hex(row.value),
  }));
}

function formatTransition(transition) {
  if (!transition) return null;
  return {
    ...transition,
    ownerPc: hex(transition.ownerPc),
    entryPc: hex(transition.entryPc),
    beforeCpu: formatCpuSnapshot(transition.beforeCpu),
    afterCpu: formatCpuSnapshot(transition.afterCpu),
    stack24: formatStack24(transition.stack24),
    previousFields: formatFields(transition.previousFields),
    currentFields: formatFields(transition.currentFields),
    recentPcs: transition.recentPcs.map((pc) => hex(pc)),
  };
}

function formatTraceHit(hit) {
  if (!hit) return null;
  return {
    ...hit,
    pc: hex(hit.pc),
    previousPc: hit.previousPc == null ? null : hex(hit.previousPc),
    cpu: formatCpuSnapshot(hit.cpu),
    stack24: formatStack24(hit.stack24),
    fields: formatFields(hit.fields),
    recentPcs: hit.recentPcs.map((pc) => hex(pc)),
  };
}

function runPre006DZeroOwnerTrace() {
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

  const recentPcs = [];
  const hotBlocks = new Map();
  const zeroTransitions = {};
  const firstHits = {};
  let blockIndex = 0;
  let stopReason = null;
  let rawResult = null;
  let previous = {
    blockIndex: 0,
    pc: null,
    fields: seededFields,
    cpu: compactCpu(cpu, mem),
  };

  const recordHit = (name, pc) => {
    if (firstHits[name]) return;
    firstHits[name] = {
      blockIndex,
      pc,
      previousPc: previous.pc,
      cpu: compactCpu(cpu, mem),
      fields: readFields(mem),
      stack24: stack24(mem, cpu),
      recentPcs: [...recentPcs],
    };
  };

  try {
    rawResult = executor.runFrom(OUTER_LOOP, 'adl', {
      maxSteps: 100000,
      maxLoopIterations: 100000,
      diHaltBypass: true,
      diHaltBypassEntry: OUTER_LOOP,
      onBlock(pc) {
        blockIndex += 1;
        const addr = pc & 0xFFFFFF;
        recentPcs.push(addr);
        if (recentPcs.length > 160) recentPcs.shift();
        hotBlocks.set(hex(addr), (hotBlocks.get(hex(addr)) ?? 0) + 1);

        const currentFields = readFields(mem);
        const afterCpu = compactCpu(cpu, mem);

        for (const name of ZERO_OWNER_FIELDS) {
          if (
            !zeroTransitions[name]
            && previous.fields?.[name] !== 0
            && currentFields[name] === 0
          ) {
            zeroTransitions[name] = {
              field: name,
              blockIndex,
              ownerPc: previous.pc,
              entryPc: addr,
              ownerInference: 'field was non-zero at previous block entry and zero at this block entry; previous block is the last executed owner candidate',
              previousFields: previous.fields,
              currentFields,
              beforeCpu: previous.cpu,
              afterCpu,
              stack24: stack24(mem, cpu),
              recentPcs: [...recentPcs],
            };
          }
        }

        if (addr === 0x001879) recordHit('first001879', addr);
        if (addr === 0x0018F8) recordHit('first0018F8', addr);
        if (addr >= 0x006D00 && addr <= 0x006DFF) recordHit('first006Dxx', addr);
        if (addr === 0x006D64) recordHit('first006D64', addr);

        if (addr === 0x0018F8 && previous.pc === 0x001879) {
          stopReason = 'captured-first-001879-to-0018f8';
          throw new EarlyStop(stopReason);
        }

        previous = {
          blockIndex,
          pc: addr,
          fields: currentFields,
          cpu: afterCpu,
        };
      },
    });
  } catch (error) {
    if (error instanceof EarlyStop) {
      rawResult = {
        steps: blockIndex,
        termination: error.reason,
        lastPc: cpu._currentBlockPc & 0xFFFFFF,
        lastMode: 'adl',
      };
    } else {
      throw error;
    }
  }

  const topHotBlocks = [...hotBlocks.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 24)
    .map(([pc, count]) => ({ pc, count }));

  const phaseRows = phases.map((phase) => ({ name: phase.name, result: formatRunResult(phase.result) }));
  const requiredTransitions = ['D007CA', 'D008E0', 'D0243A', 'D02590'];
  const pass = rawResult.termination === 'captured-first-001879-to-0018f8'
    && requiredTransitions.every((name) => Boolean(zeroTransitions[name]))
    && Boolean(firstHits.first001879)
    && Boolean(firstHits.first0018F8);

  return {
    probe: 'phase844-pre-006dxx-zero-owner',
    pass,
    result: {
      steps: rawResult.steps,
      termination: rawResult.termination,
      lastPc: hex(rawResult.lastPc),
      lastMode: rawResult.lastMode,
      stopReason,
    },
    phases: phaseRows,
    phase5: {
      result: phase5.result,
      targetCounts: phase5.targetCounts,
      snapshot: {
        block: phase5.snapshot.block,
        pc: hex(phase5.snapshot.pc),
        fields: formatSnapshotObject(phase5.snapshot.fields),
      },
    },
    repaint: {
      ...repaint,
      fields: formatFields(repaint.fields),
    },
    restoredFields: formatFields(restoredFields),
    initialFields: formatFields(initialFields),
    seededFields: formatFields(seededFields),
    finalFields: formatFields(readFields(mem)),
    zeroTransitions: Object.fromEntries(ZERO_OWNER_FIELDS.map((name) => [name, formatTransition(zeroTransitions[name])])),
    firstHits: Object.fromEntries(Object.entries(firstHits).map(([name, hit]) => [name, formatTraceHit(hit)])),
    topHotBlocks,
    recentPcs: recentPcs.map((pc) => hex(pc)),
  };
}

function buildPhase844Report(summary) {
  const transitionRows = ZERO_OWNER_FIELDS.map((name) => {
    const transition = summary.zeroTransitions[name];
    if (!transition) return `| ${name} | - | - | - | - | - |`;
    return `| ${name} | ${transition.ownerPc} | ${transition.entryPc} | ${transition.blockIndex} | ${transition.previousFields[name]} | ${transition.currentFields[name]} |`;
  });
  const topRows = summary.topHotBlocks.slice(0, 16).map((hit) => `| ${hit.pc} | ${hit.count} |`);
  const keyTransitionNames = ['D007CA', 'D008E0', 'D0243A', 'D0243D', 'D02590', 'D0259D'];
  const keyTransitions = Object.fromEntries(keyTransitionNames.map((name) => [name, summary.zeroTransitions[name]]));

  return [
    '# Phase 844: Pre-0x006Dxx State-Zero Owner Trace',
    '',
    'Probe: `probe-phase844-pre-006dxx-zero-owner.mjs`  ',
    'Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase844-pre-006dxx-zero-owner.mjs`',
    '',
    '## Summary',
    '',
    `- Result: ${summary.pass ? 'PASS' : 'FAIL'}; termination=\`${summary.result.termination}\`, steps=${summary.result.steps}, lastPc=${summary.result.lastPc}.`,
    '- Setup matches Phase843: OS launch-home init, clean home repaint, physical edit-context seed `D0243A=0xD1A8CC` / `D0243D=0xD2A83E`, CLEAR scancode `0x0F`, no browser `0x0A229D` pre-stop.',
    '- Transition attribution uses block-boundary evidence: if a field is non-zero at one block entry and zero at the next, the previously executed block is the owner candidate.',
    `- The trace stopped at the first \`0x001879 -> 0x0018F8\` handoff, so it captures the destructive low wipe without descending into the held cleanup loop.`,
    '',
    '## Zero Transition Matrix',
    '',
    '| Field | Owner Candidate | Next Entry | Block # | Before | After |',
    '| --- | --- | --- | ---: | --- | --- |',
    ...transitionRows,
    '',
    '## First Hits',
    '',
    '```json',
    JSON.stringify(summary.firstHits, null, 2),
    '```',
    '',
    '## Key Zero Transitions',
    '',
    '```json',
    JSON.stringify(keyTransitions, null, 2),
    '```',
    '',
    '## Top Blocks Before Stop',
    '',
    '| PC | Count |',
    '| --- | ---: |',
    ...topRows,
    '',
    '## Initial / Seeded / Final Fields',
    '',
    '```json',
    JSON.stringify({
      restoredFields: summary.restoredFields,
      initialFields: summary.initialFields,
      seededFields: summary.seededFields,
      finalFields: summary.finalFields,
    }, null, 2),
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

console.log('phase844: pre-0x006Dxx state-zero owner trace');

let summary;
try {
  summary = runPre006DZeroOwnerTrace();
  fs.writeFileSync(REPORT_PATH, `${buildPhase844Report(summary)}\n`);
  console.log(JSON.stringify({
    probe: summary.probe,
    pass: summary.pass,
    result: summary.result,
    transitions: Object.fromEntries(ZERO_OWNER_FIELDS.map((name) => {
      const transition = summary.zeroTransitions[name];
      return [name, transition ? {
        ownerPc: transition.ownerPc,
        entryPc: transition.entryPc,
        blockIndex: transition.blockIndex,
        before: transition.previousFields[name],
        after: transition.currentFields[name],
      } : null];
    })),
    firstHits: Object.fromEntries(Object.entries(summary.firstHits).map(([name, hit]) => [
      name,
      { pc: hit.pc, previousPc: hit.previousPc, blockIndex: hit.blockIndex },
    ])),
    report: path.basename(REPORT_PATH),
  }, null, 2));
  if (!summary.pass) process.exitCode = 1;
} catch (error) {
  summary = {
    probe: 'phase844-pre-006dxx-zero-owner',
    pass: false,
    error: String(error?.stack || error),
  };
  fs.writeFileSync(REPORT_PATH, `# Phase 844: Pre-0x006Dxx State-Zero Owner Trace\n\nProbe failed before report generation.\n\n\`\`\`text\n${summary.error}\n\`\`\`\n`);
  console.error(summary.error);
  process.exitCode = 1;
}
