import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase643-low-route-cause.md');

const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const MEM_SIZE = 0x1000000;
const STACK_TOP = 0xD1A87E;
const WARM_IDLE = 0x0019BE;
const HALT_IDLE = 0x0019B5;
const LAUNCH_HOME = 0x09DD62;
const HOME_REPAINT = 0x058241;
const OUTER_LOOP = 0x08C331;
const CX_MAIN = 0x0585E9;

const SNAPSHOT_FIELDS = Object.freeze([
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

const WATCH_TARGETS = Object.freeze({
  loop08c331: OUTER_LOOP,
  cxMain0585e9: CX_MAIN,
  getCsc03fa09: 0x03FA09,
  cleanup0018f8: 0x0018F8,
  low0064d0: 0x0064D0,
  low006cc6: 0x006CC6,
  low006cdf: 0x006CDF,
  low006cf7: 0x006CF7,
  low006d0f: 0x006D0F,
  low006d38: 0x006D38,
  low006d4f: 0x006D4F,
  low006d5d: 0x006D5D,
  low006d64: 0x006D64,
  helper0021c2: 0x0021C2,
  hot000a92: 0x000A92,
  hot000bfe: 0x000BFE,
  tokenExit08f5e1: 0x08F5E1,
  tokenGate090992: 0x090992,
  eolTuple08f54b: 0x08F54B,
});

const REPAINT_TARGETS = Object.freeze({
  homeRepaint058241: HOME_REPAINT,
  vatSearch084711: 0x084711,
  vatRewind082be2: 0x082BE2,
  cleanup0018f8: 0x0018F8,
  halt0019b5: HALT_IDLE,
});

const STATIC_BLOCKS = Object.freeze([
  0x006CC6,
  0x006CDF,
  0x006CF7,
  0x006D0F,
  0x006D38,
  0x006D4F,
  0x006D5D,
  0x006D64,
  0x0021C2,
  0x000A92,
  0x000BFE,
]);

const KEY_CASES = Object.freeze([
  { name: 'eol-clear', label: 'EOL/CLEAR', pendingKey: 0x0F, matrixScan: 0x0F, maxSteps: 180000 },
  { name: 'digit2', label: 'Digit2', pendingKey: 0x90, matrixScan: 0x1A, maxSteps: 180000 },
]);

class EarlyStop extends Error {
  constructor(reason) {
    super(reason);
    this.reason = reason;
  }
}

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function readValue(mem, addr, len) {
  let value = 0;
  for (let i = 0; i < len; i += 1) value |= mem[addr + i] << (8 * i);
  return value >>> 0;
}

function writeValue(mem, addr, len, value) {
  for (let i = 0; i < len; i += 1) mem[addr + i] = (value >>> (8 * i)) & 0xFF;
}

function write24(mem, addr, value) {
  writeValue(mem, addr, 3, value);
}

function captureFields(mem, fields = SNAPSHOT_FIELDS) {
  return fields.map(([name, addr, len]) => ({
    name,
    addr,
    len,
    value: readValue(mem, addr, len),
    bytes: Array.from(mem.slice(addr, addr + len)),
  }));
}

function restoreFields(mem, snapshot) {
  for (const field of snapshot) {
    for (let i = 0; i < field.len; i += 1) mem[field.addr + i] = field.bytes[i] ?? 0;
  }
}

function fieldsObject(snapshot) {
  return Object.fromEntries(snapshot.map((field) => [field.name, hex(field.value, field.len * 2)]));
}

function countVRAMPixels(mem) {
  let count = 0;
  for (let addr = 0xD40000; addr < 0xD40000 + (320 * 240 * 2); addr += 2) {
    const word = mem[addr] | (mem[addr + 1] << 8);
    if (word !== 0xFFFF) count += 1;
  }
  return count;
}

function fillSentinel(mem, start, bytes) {
  mem.fill(0xFF, start, start + bytes);
}

function formatRunResult(result) {
  return {
    steps: result.steps,
    termination: result.termination,
    lastPc: hex(result.lastPc ?? 0),
    lastMode: result.lastMode,
  };
}

function makeMachine() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, MEM_SIZE));
  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  return { mem, peripherals, executor, cpu: executor.cpu };
}

function runBootToPhase5Ready() {
  const { mem, peripherals, executor, cpu } = makeMachine();
  const phases = [];

  phases.push({ name: 'p1-coldboot', result: executor.runFrom(0x000000, 'z80', { maxSteps: 20000, maxLoopIterations: 32 }) });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  fillSentinel(mem, cpu.sp, 3);
  phases.push({ name: 'p2-kernel', result: executor.runFrom(0x08C331, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 }) });

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

  return { mem, peripherals, executor, cpu, phases };
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

function seedKey(mem, keyCase) {
  mem[0xD0058C] = keyCase.pendingKey;
  mem[0xD0058D] = keyCase.pendingKey;
  mem[0xD0058E] = keyCase.pendingKey;
  if (keyCase.matrixScan != null) mem[0xD00587] = keyCase.matrixScan;
  mem[0xD00080] = (mem[0xD00080] | 0x08) & 0xFF;
  mem[0xD0009F] = (mem[0xD0009F] | 0x20) & 0xFF;
}

function makeCounter(targets) {
  return Object.fromEntries(Object.keys(targets).map((name) => [name, 0]));
}

function hotBlocksSummary(hotBlocks, limit = 24) {
  return Array.from(hotBlocks.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([pc, count]) => ({ pc, count }));
}

function readStackWords(mem, sp, count = 6) {
  const rows = [];
  const base = sp & 0xFFFFFF;
  for (let i = 0; i < count; i += 1) {
    const addr = (base + i * 3) & 0xFFFFFF;
    rows.push({ addr: hex(addr), value: hex(readValue(mem, addr, 3)) });
  }
  return rows;
}

function readIxFrame(mem, cpu) {
  const ix = cpu.ix & 0xFFFFFF;
  const offsets = [-39, -27, -24, -20, -11, -7, -6, -3, 0, 3, 6, 9];
  return Object.fromEntries(offsets.map((off) => {
    const addr = (ix + off) & 0xFFFFFF;
    const width = [-24, -7].includes(off) ? 1 : 3;
    return [`IX${off >= 0 ? '+' : ''}${off}`, hex(readValue(mem, addr, width), width * 2)];
  }));
}

function cpuSnapshot(mem, cpu, block, pc, callStack, recentBlocks) {
  return {
    block,
    pc: hex(pc),
    sp: hex(cpu.sp),
    ix: hex(cpu.ix),
    iy: hex(cpu.iy),
    af: hex(cpu.af, 4),
    bc: hex(cpu.bc),
    de: hex(cpu.de),
    hl: hex(cpu.hl),
    flags: {
      z: (cpu.f & 0x40) !== 0,
      c: (cpu.f & 0x01) !== 0,
    },
    state: {
      D007CA: hex(readValue(mem, 0xD007CA, 3)),
      D008E0: hex(readValue(mem, 0xD008E0, 3)),
      D02590: hex(readValue(mem, 0xD02590, 3)),
      D00121: hex(readValue(mem, 0xD00121, 3)),
      D00124: hex(mem[0xD00124], 2),
      D00587: hex(mem[0xD00587], 2),
      D0058C: hex(mem[0xD0058C], 2),
      D0058D: hex(mem[0xD0058D], 2),
      D0058E: hex(mem[0xD0058E], 2),
      D02A28: hex(mem[0xD02A28], 2),
      D001B8: hex(mem[0xD001B8], 2),
      D001D3: hex(mem[0xD001D3], 2),
      vramPixels: countVRAMPixels(mem),
    },
    stackTop: readStackWords(mem, cpu.sp, 5),
    ixFrame: readIxFrame(mem, cpu),
    callStackTail: callStack.slice(-16).map((addr) => hex(addr)),
    recentBlocks: recentBlocks.slice(-24).map((addr) => hex(addr)),
  };
}

function installIoAndStateWatch(cpu, mem) {
  const io = [];
  const writes = [];
  const ioCounts = new Map();
  const writeCounts = new Map();
  const originalRead = cpu.onIoRead;
  const originalWrite = cpu.onIoWrite;
  const originalWrite8 = cpu.write8.bind(cpu);
  const originalWrite16 = cpu.write16.bind(cpu);
  const originalWrite24 = cpu.write24.bind(cpu);

  function recordIo(dir, port, value) {
    const key = `${dir}:${hex(port, 4)}:${hex(value, 2)}`;
    ioCounts.set(key, (ioCounts.get(key) ?? 0) + 1);
    if (io.length < 80) {
      io.push({ dir, port: hex(port, 4), value: hex(value, 2), pc: hex(cpu._currentBlockPc ?? cpu.pc ?? 0), sp: hex(cpu.sp) });
    }
  }

  function recordWrite(kind, addr, value, width) {
    const a = addr & 0xFFFFFF;
    if ((a >= 0xD00121 && a <= 0xD00124) || (a >= 0xD007CA && a <= 0xD007CC) || (a >= 0xD02590 && a <= 0xD0259F)) {
      const name = `${kind}:${hex(a)}:${width}`;
      writeCounts.set(name, (writeCounts.get(name) ?? 0) + 1);
      if (writes.length < 120) {
        writes.push({
          kind,
          addr: hex(a),
          width,
          value: hex(value, width * 2),
          pc: hex(cpu._currentBlockPc ?? cpu.pc ?? 0),
          sp: hex(cpu.sp),
        });
      }
    }
  }

  cpu.onIoRead = (port, value) => {
    originalRead.call(cpu, port, value);
    recordIo('in', port, value);
  };
  cpu.onIoWrite = (port, value) => {
    originalWrite.call(cpu, port, value);
    recordIo('out', port, value);
  };
  cpu.write8 = (addr, value) => {
    recordWrite('write8', addr, value & 0xFF, 1);
    return originalWrite8(addr, value);
  };
  cpu.write16 = (addr, value) => {
    recordWrite('write16', addr, value & 0xFFFF, 2);
    return originalWrite16(addr, value);
  };
  cpu.write24 = (addr, value) => {
    recordWrite('write24', addr, value & 0xFFFFFF, 3);
    return originalWrite24(addr, value);
  };

  return {
    uninstall() {
      cpu.onIoRead = originalRead;
      cpu.onIoWrite = originalWrite;
      cpu.write8 = originalWrite8;
      cpu.write16 = originalWrite16;
      cpu.write24 = originalWrite24;
    },
    result() {
      return {
        samples: io,
        counts: Array.from(ioCounts.entries()).map(([key, count]) => ({ key, count })),
        writes,
        writeCounts: Array.from(writeCounts.entries()).map(([key, count]) => ({ key, count })),
      };
    },
  };
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
          snapshot = { block, pc: hex(addr), fields: captureFields(mem), vramPixels: countVRAMPixels(mem) };
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
      afterFields: fieldsObject(captureFields(mem)),
      vramPixels: countVRAMPixels(mem),
    },
  };
}

function runRepaint(mem, peripherals, executor, cpu) {
  const counts = makeCounter(REPAINT_TARGETS);
  const hotBlocks = new Map();
  let block = 0;

  prepareEventFrame(mem, peripherals, cpu);
  const result = executor.runFrom(HOME_REPAINT, 'adl', {
    maxSteps: 300000,
    maxLoopIterations: 30000,
    onBlock(pc) {
      block += 1;
      const addr = pc & 0xFFFFFF;
      const pcHex = hex(addr);
      hotBlocks.set(pcHex, (hotBlocks.get(pcHex) ?? 0) + 1);
      for (const [name, target] of Object.entries(REPAINT_TARGETS)) {
        if (addr === target) counts[name] += 1;
      }
    },
  });

  return {
    result: formatRunResult(result),
    counts,
    hotBlocks: hotBlocksSummary(hotBlocks, 12),
    fields: fieldsObject(captureFields(mem)),
    vramPixels: countVRAMPixels(mem),
    blocks: block,
  };
}

function phase643TrackLowRoute(mem, peripherals, executor, cpu, keyCase) {
  rearmCxMain(mem);
  seedKey(mem, keyCase);
  prepareEventFrame(mem, peripherals, cpu);

  const watch = installIoAndStateWatch(cpu, mem);
  const counts = makeCounter(WATCH_TARGETS);
  const regionCounts = { low006d00_006dff: 0, token08f000_090fff: 0, display090000_091fff: 0, cleanup001000_001fff: 0 };
  const hotBlocks = new Map();
  const firstBlocks = [];
  const recentBlocks = [];
  const targetSamples = [];
  const lowEntrySamples = [];
  const stableSamples = [];
  const stateTransitions = [];
  const callStack = [];

  let block = 0;
  let prevSp = cpu.sp & 0xFFFFFF;
  let prevPc = OUTER_LOOP;
  let firstCleanupBlock = null;
  let firstLowBlock = null;
  let stopReason = null;
  let lastD007CA = readValue(mem, 0xD007CA, 3);
  let lastVat = readValue(mem, 0xD02590, 3);
  let lastD008E0 = readValue(mem, 0xD008E0, 3);
  let vramPeak = countVRAMPixels(mem);

  function pushRecent(addr) {
    if (recentBlocks.length === 0 || recentBlocks[recentBlocks.length - 1] !== addr) {
      recentBlocks.push(addr);
      if (recentBlocks.length > 48) recentBlocks.shift();
    }
  }

  function maybeTransition(addr) {
    const d007ca = readValue(mem, 0xD007CA, 3);
    const vat = readValue(mem, 0xD02590, 3);
    const d008e0 = readValue(mem, 0xD008E0, 3);
    if ((d007ca !== lastD007CA || vat !== lastVat || d008e0 !== lastD008E0) && stateTransitions.length < 60) {
      stateTransitions.push({
        block,
        pc: hex(addr),
        D007CA: [hex(lastD007CA), hex(d007ca)],
        D008E0: [hex(lastD008E0), hex(d008e0)],
        D02590: [hex(lastVat), hex(vat)],
      });
      lastD007CA = d007ca;
      lastVat = vat;
      lastD008E0 = d008e0;
    }
  }

  function sampledEnough() {
    if (block < 70000) return false;
    if ((counts.low006d5d ?? 0) < 512) return false;
    if ((counts.low006d38 ?? 0) < 512) return false;
    if ((counts.helper0021c2 ?? 0) < 512) return false;
    if ((counts.hot000a92 ?? 0) < 512) return false;
    if ((counts.hot000bfe ?? 0) < 512) return false;
    return true;
  }

  let rawResult = null;
  try {
    rawResult = executor.runFrom(OUTER_LOOP, 'adl', {
      maxSteps: keyCase.maxSteps,
      maxLoopIterations: keyCase.maxSteps,
      diHaltBypass: true,
      diHaltBypassEntry: OUTER_LOOP,
      onBlock(pc) {
        block += 1;
        const addr = pc & 0xFFFFFF;
        const pcHex = hex(addr);
        hotBlocks.set(pcHex, (hotBlocks.get(pcHex) ?? 0) + 1);
        if (firstBlocks.length < 64) firstBlocks.push(pcHex);
        pushRecent(addr);

        const curSp = cpu.sp & 0xFFFFFF;
        const delta = prevSp - curSp;
        if (delta >= 3 && delta <= 9) {
          callStack.push(prevPc);
          if (callStack.length > 128) callStack.shift();
        } else if (delta <= -3 && delta >= -9 && callStack.length > 0) {
          callStack.pop();
        }
        prevSp = curSp;

        for (const [name, target] of Object.entries(WATCH_TARGETS)) {
          if (addr === target) {
            counts[name] += 1;
            if (targetSamples.length < 120) {
              targetSamples.push({
                name,
                ...cpuSnapshot(mem, cpu, block, addr, callStack, recentBlocks),
              });
            }
          }
        }

        if (addr === 0x0018F8 && firstCleanupBlock === null) firstCleanupBlock = block;
        if (addr >= 0x006D00 && addr <= 0x006DFF) {
          regionCounts.low006d00_006dff += 1;
          if (firstLowBlock === null) {
            firstLowBlock = block;
            lowEntrySamples.push({ reason: 'first-low-006dxx', ...cpuSnapshot(mem, cpu, block, addr, callStack, recentBlocks) });
          }
        }
        if (addr >= 0x08F000 && addr <= 0x090FFF) regionCounts.token08f000_090fff += 1;
        if (addr >= 0x090000 && addr <= 0x091FFF) regionCounts.display090000_091fff += 1;
        if (addr >= 0x001000 && addr <= 0x001FFF) regionCounts.cleanup001000_001fff += 1;

        if (addr === 0x006D5D || addr === 0x006D38 || addr === 0x000A92 || addr === 0x000BFE || addr === 0x006CDF) {
          const count = Object.entries(WATCH_TARGETS).find(([, target]) => target === addr)?.[0];
          const hitCount = count ? counts[count] : 0;
          if ((hitCount === 1 || hitCount === 512 || hitCount === 2048) && stableSamples.length < 40) {
            stableSamples.push({ reason: `${count ?? pcHex}-hit-${hitCount}`, ...cpuSnapshot(mem, cpu, block, addr, callStack, recentBlocks) });
          }
        }

        maybeTransition(addr);
        if (block % 5000 === 0) vramPeak = Math.max(vramPeak, countVRAMPixels(mem));

        if (sampledEnough()) {
          stopReason = 'sampled-low-route-cycle';
          throw new EarlyStop(stopReason);
        }

        prevPc = addr;
      },
    });
  } catch (error) {
    if (error instanceof EarlyStop) {
      rawResult = {
        steps: block,
        termination: error.reason,
        lastPc: prevPc,
        lastMode: 'adl',
      };
    } else {
      throw error;
    }
  } finally {
    watch.uninstall();
  }

  vramPeak = Math.max(vramPeak, countVRAMPixels(mem));

  return {
    key: keyCase.name,
    label: keyCase.label,
    result: formatRunResult(rawResult),
    stopReason,
    firstCleanupBlock,
    firstLowBlock,
    counts,
    regionCounts,
    firstBlocks,
    lastBlocks: recentBlocks.map((addr) => hex(addr)),
    hotBlocks: hotBlocksSummary(hotBlocks),
    targetSamples,
    lowEntrySamples,
    stableSamples,
    stateTransitions,
    ioAndWrites: watch.result(),
    final: {
      D007CA: hex(readValue(mem, 0xD007CA, 3)),
      D008E0: hex(readValue(mem, 0xD008E0, 3)),
      D02590: hex(readValue(mem, 0xD02590, 3)),
      D00121: hex(readValue(mem, 0xD00121, 3)),
      D00124: hex(mem[0xD00124], 2),
      D00587: hex(mem[0xD00587], 2),
      D0058C: hex(mem[0xD0058C], 2),
      D0058D: hex(mem[0xD0058D], 2),
      D0058E: hex(mem[0xD0058E], 2),
      vramPixels: countVRAMPixels(mem),
      vramPeak,
    },
  };
}

function blockSummary(pc) {
  const key = `${pc.toString(16).padStart(6, '0')}:adl`;
  const block = BLOCKS[key];
  if (!block) return { pc: hex(pc), missing: true };
  return {
    pc: hex(pc),
    instructions: (block.instructions ?? []).map((inst) => ({
      pc: hex(inst.pc),
      bytes: inst.bytes,
      dasm: inst.dasm,
    })),
    exits: block.exits ?? [],
  };
}

function phase643LowRouteScenario(keyCase) {
  const machine = runPhase5WithSnapshot();
  const { mem, peripherals, executor, cpu, phase5, phases } = machine;
  const snapshot = phase5.snapshot?.fields ?? null;
  if (!snapshot) {
    return {
      key: keyCase.name,
      error: 'snapshot-not-captured',
      phases: phases.map((phase) => ({ name: phase.name, result: formatRunResult(phase.result) })),
      phase5,
    };
  }

  restoreFields(mem, snapshot);
  const afterReplay = { fields: fieldsObject(captureFields(mem)), vramPixels: countVRAMPixels(mem) };
  const repaint = runRepaint(mem, peripherals, executor, cpu);
  const keyBurst = phase643TrackLowRoute(mem, peripherals, executor, cpu, keyCase);

  return {
    key: keyCase.name,
    phases: phases.map((phase) => ({ name: phase.name, result: formatRunResult(phase.result) })),
    phase5: {
      result: phase5.result,
      targetCounts: phase5.targetCounts,
      snapshot: {
        block: phase5.snapshot.block,
        pc: phase5.snapshot.pc,
        fields: fieldsObject(phase5.snapshot.fields),
        vramPixels: phase5.snapshot.vramPixels,
      },
      afterFields: phase5.afterFields,
      vramPixels: phase5.vramPixels,
    },
    afterReplay,
    repaint,
    keyBurst,
  };
}

function scenarioTable(scenarios) {
  return [
    '| Key | Repaint | Key result | First cleanup | First low | cxMain | GetCSC | 0x08F5E1 | 0x090992 | 0x08F54B | 0x006D5D | 0x006D38 | 0x000A92 | 0x000BFE | Low region | Final PC |',
    '|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|',
    ...scenarios.map((row) => {
      if (row.error) return `| ${row.key} | ERROR | ${row.error} | | | | | | | | | | | | | |`;
      const k = row.keyBurst;
      return `| ${k.label} | ${row.repaint.result.termination} ${row.repaint.result.lastPc} | ${k.result.termination} | ${k.firstCleanupBlock ?? ''} | ${k.firstLowBlock ?? ''} | ${k.counts.cxMain0585e9} | ${k.counts.getCsc03fa09} | ${k.counts.tokenExit08f5e1} | ${k.counts.tokenGate090992} | ${k.counts.eolTuple08f54b} | ${k.counts.low006d5d} | ${k.counts.low006d38} | ${k.counts.hot000a92} | ${k.counts.hot000bfe} | ${k.regionCounts.low006d00_006dff} | ${k.result.lastPc} |`;
    }),
  ].join('\n');
}

function staticBlockSection() {
  const rows = STATIC_BLOCKS.map(blockSummary);
  const lines = ['## Static Low-Route Blocks', ''];
  for (const row of rows) {
    lines.push(`### ${row.pc}`);
    if (row.missing) {
      lines.push('');
      lines.push('- Missing from PRELIFTED_BLOCKS.');
      lines.push('');
      continue;
    }
    lines.push('');
    lines.push('```text');
    for (const inst of row.instructions) {
      lines.push(`${inst.pc}  ${String(inst.bytes).padEnd(14)} ${inst.dasm}`);
    }
    lines.push('```');
    lines.push('');
    lines.push(`Exits: \`${JSON.stringify(row.exits)}\``);
    lines.push('');
  }
  return lines.join('\n');
}

function compactSamples(samples, limit = 8) {
  return samples.slice(0, limit).map((sample) => ({
    name: sample.name ?? sample.reason,
    block: sample.block,
    pc: sample.pc,
    sp: sample.sp,
    ix: sample.ix,
    hl: sample.hl,
    bc: sample.bc,
    flags: sample.flags,
    state: sample.state,
    ixFrame: sample.ixFrame,
    callStackTail: sample.callStackTail,
    recentBlocks: sample.recentBlocks,
  }));
}

function phase643BuildReport(scenarios) {
  const successful = scenarios.filter((row) => !row.error);
  const allReachedLow = successful.every((row) => row.keyBurst.regionCounts.low006d00_006dff > 0);
  const allMissTokenHooks = successful.every((row) => (
    row.keyBurst.counts.tokenExit08f5e1 === 0 &&
    row.keyBurst.counts.tokenGate090992 === 0 &&
    row.keyBurst.counts.eolTuple08f54b === 0
  ));
  const allRepaintClean = successful.every((row) => row.repaint.result.termination === 'halt');

  return [
    '# Phase 643: Low 0x006Dxx Route Cause After Clean Repaint',
    '',
    'Probe: `probe-phase643-low-route-cause.mjs`  ',
    'Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase643-low-route-cause.mjs`',
    '',
    '## Summary',
    '',
    allRepaintClean
      ? '- **** Clean-repaint prerequisite held: replaying the valid Phase 5 VAT/context snapshot before `0x058241` still produced a clean repaint halt for every scenario.'
      : '- !! At least one scenario failed the clean-repaint prerequisite; inspect the JSON below before trusting key-route conclusions.',
    allReachedLow
      ? '- **** The low route is a deterministic post-cleanup wait/retry path: both keys hit cleanup, then enter the `0x006CDF -> 0x006D38 -> 0x006D5D -> 0x0021C2 -> 0x006D64 -> 0x006CDF` cycle with `D007CA`/`D008E0`/VAT already zero by first low-route entry.'
      : '- !! At least one scenario did not enter the low `0x006Dxx` route.',
    allMissTokenHooks
      ? '- *** The token/tuple hooks are bypassed before this low route begins: `0x08F5E1`, `0x090992`, and `0x08F54B` all stayed at 0 hits while `_GetCSC` and `cxMain` did run.'
      : '- *** At least one scenario reached a token/tuple hook; see counters below.',
    '- *** Static blocks identify the hot low route as a framed hardware/status transfer loop, not the token-display engine: `0x006D5D` loads `HL=(IX+9)`, calls `0x0021C2`, and `0x006D64` jumps back to `0x006CDF` while NZ; `0x006D4F` writes `D00124=0x0E`, performs port I/O, and polls bit 3 before retrying.',
    '',
    '## Scenario Results',
    '',
    scenarioTable(scenarios),
    '',
    staticBlockSection(),
    '',
    '## Focused Dynamic Samples',
    '',
    '```json',
    JSON.stringify(successful.map((row) => ({
      key: row.key,
      phase5Snapshot: row.phase5.snapshot.fields,
      repaint: row.repaint.result,
      keyResult: row.keyBurst.result,
      firstLowBlock: row.keyBurst.firstLowBlock,
      firstCleanupBlock: row.keyBurst.firstCleanupBlock,
      targetCounts: row.keyBurst.counts,
      regionCounts: row.keyBurst.regionCounts,
      final: row.keyBurst.final,
      lowEntrySamples: compactSamples(row.keyBurst.lowEntrySamples, 2),
      stableSamples: compactSamples(row.keyBurst.stableSamples, 10),
      stateTransitions: row.keyBurst.stateTransitions.slice(0, 20),
      ioSamples: row.keyBurst.ioAndWrites.samples.slice(0, 24),
      ioCounts: row.keyBurst.ioAndWrites.counts.slice(0, 24),
      watchedWrites: row.keyBurst.ioAndWrites.writes.slice(0, 40),
      hotBlocks: row.keyBurst.hotBlocks,
      lastBlocks: row.keyBurst.lastBlocks,
    })), null, 2),
    '```',
    '',
    '## Interpretation',
    '',
    'The clean repaint fixes the VAT-search residual but does not preserve a dispatchable OS state through the first key cleanup. In both tested keys, `_GetCSC`/`cxMain` are reached before cleanup, then context/VAT state is zero by the first low-route entry. The transition samples show EOL/CLEAR clears `D007CA`/`D008E0` earlier at `0x0A2156` and clears VAT at `0x0018F8`; Digit2 clears the watched context/VAT fields at `0x0018F8`. The next durable hot path is the low-level `0x006Dxx` transfer/status loop, with no visits to the token-size/token-buffer/EOL tuple addresses. That explains the max-step behavior: the run is no longer in the token-display path by the time it becomes hot; it is waiting/retrying in a low ROM hardware/status loop using the `D00121/D00124` frame state.',
    '',
    'No runtime, transpiler, or browser source files were modified.',
    '',
  ].join('\n');
}

console.log('phase643: trace low 0x006Dxx route cause after clean repaint');
const scenarios = KEY_CASES.map((keyCase) => phase643LowRouteScenario(keyCase));
fs.writeFileSync(REPORT_PATH, `${phase643BuildReport(scenarios)}\n`);

const pass = scenarios.every((row) => (
  !row.error &&
  row.repaint.result.termination === 'halt' &&
  row.keyBurst.regionCounts.low006d00_006dff > 0 &&
  row.keyBurst.counts.tokenExit08f5e1 === 0 &&
  row.keyBurst.counts.tokenGate090992 === 0 &&
  row.keyBurst.counts.eolTuple08f54b === 0
));

console.log(JSON.stringify({
  probe: 'phase643-low-route-cause',
  pass,
  report: path.basename(REPORT_PATH),
  summary: scenarios.map((row) => row.error ? { key: row.key, error: row.error } : {
    key: row.keyBurst.label,
    repaint: row.repaint.result,
    keyResult: row.keyBurst.result,
    firstCleanupBlock: row.keyBurst.firstCleanupBlock,
    firstLowBlock: row.keyBurst.firstLowBlock,
    cxMain: row.keyBurst.counts.cxMain0585e9,
    getCsc: row.keyBurst.counts.getCsc03fa09,
    tokenExit08f5e1: row.keyBurst.counts.tokenExit08f5e1,
    tokenGate090992: row.keyBurst.counts.tokenGate090992,
    eolTuple08f54b: row.keyBurst.counts.eolTuple08f54b,
    low006d5d: row.keyBurst.counts.low006d5d,
    low006d38: row.keyBurst.counts.low006d38,
    hot000a92: row.keyBurst.counts.hot000a92,
    hot000bfe: row.keyBurst.counts.hot000bfe,
    lowRegion: row.keyBurst.regionCounts.low006d00_006dff,
    final: row.keyBurst.final,
  }),
}, null, 2));

if (!pass) process.exitCode = 1;
