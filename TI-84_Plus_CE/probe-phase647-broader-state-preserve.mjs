import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase647-broader-state-preserve.md');

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

const PHASE5_FIELDS = Object.freeze([
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

const CORE_PRESERVE_RANGES = Object.freeze([
  ['contextTable_D007CA_D007ED', 0xD007CA, 0x24],
  ['errSP_D008E0', 0xD008E0, 3],
  ['vatTuple_D02587_D025A2', 0xD02587, 0x1C],
  ['heapSize_D025C5', 0xD025C5, 3],
]);

const BROAD_PRESERVE_RANGES = Object.freeze([
  ...CORE_PRESERVE_RANGES,
  ['iyFlags_D00080_D000FF', 0xD00080, 0x80],
  ['lowFrame_D00121_D00124', 0xD00121, 0x04],
  ['keyBuffers_D00587_D0058E', 0xD00587, 0x08],
  ['editState_D02317_D02448', 0xD02317, 0x132],
]);

const PRESERVE_MODES = Object.freeze([
  { name: 'core', label: 'Core cx/VAT restore', ranges: CORE_PRESERVE_RANGES },
  { name: 'broad', label: 'Broad IY/key/edit/low-frame restore', ranges: BROAD_PRESERVE_RANGES },
]);

const TARGETS = Object.freeze({
  outerLoop08c331: OUTER_LOOP,
  cxMain0585e9: CX_MAIN,
  getCsc03fa09: 0x03FA09,
  eolClear0a2150: 0x0A2150,
  eolFill0a2156: 0x0A2156,
  bulkClear001879: 0x001879,
  bulkTail0018f8: 0x0018F8,
  lowCaller0017fc: 0x0017FC,
  lowSelect0064d0: 0x0064D0,
  lowFrame006cc6: 0x006CC6,
  lowLoop006cdf: 0x006CDF,
  lowPoll006d38: 0x006D38,
  lowCall006d5d: 0x006D5D,
  lowBackedge006d64: 0x006D64,
  hot000a92: 0x000A92,
  hot000bfe: 0x000BFE,
  tokenExit08f5e1: 0x08F5E1,
  tokenGate090992: 0x090992,
  eolTuple08f54b: 0x08F54B,
});

const STATIC_BLOCKS = Object.freeze([
  0x0017FC,
  0x006475,
  0x00647D,
  0x0064C7,
  0x0064D0,
  0x006CC6,
  0x006CDF,
  0x006D38,
  0x006D5D,
  0x006D64,
  0x0021C2,
  0x000A92,
  0x000BFE,
]);

const KEY_CASES = Object.freeze([
  { name: 'eol-clear', label: 'EOL/CLEAR', pendingKey: 0x0F, matrixScan: 0x0F, maxSteps: 165000 },
  { name: 'digit2', label: 'Digit2', pendingKey: 0x90, matrixScan: 0x1A, maxSteps: 150000 },
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
  for (let i = 0; i < len; i += 1) value |= mem[(addr + i) & 0xFFFFFF] << (8 * i);
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

function captureFields(mem, fields = PHASE5_FIELDS) {
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

function captureRanges(mem, ranges = CORE_PRESERVE_RANGES) {
  return ranges.map(([name, addr, len]) => ({
    name,
    addr,
    len,
    bytes: Array.from(mem.slice(addr, addr + len)),
  }));
}

function restoreRanges(mem, snapshot) {
  for (const range of snapshot) {
    for (let i = 0; i < range.len; i += 1) mem[range.addr + i] = range.bytes[i] ?? 0;
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
  const machine = makeMachine();
  const { mem, peripherals, executor, cpu } = machine;
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

  return { ...machine, phases };
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
  mem[0xD00587] = keyCase.matrixScan;
  mem[0xD00080] = (mem[0xD00080] | 0x08) & 0xFF;
  mem[0xD0009F] = (mem[0xD0009F] | 0x20) & 0xFF;
}

function readStackWords(mem, sp, count = 7) {
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
  const offsets = [-45, -42, -39, -30, -27, -24, -20, -17, -11, -8, -7, -6, -3, 0, 3, 6, 9];
  return Object.fromEntries(offsets.map((off) => {
    const addr = (ix + off) & 0xFFFFFF;
    const width = [-24, -8, -7].includes(off) ? 1 : 3;
    return [`IX${off >= 0 ? '+' : ''}${off}`, hex(readValue(mem, addr, width), width * 2)];
  }));
}

function stateSummary(mem, cpu) {
  return {
    pc: hex(cpu.pc ?? 0),
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
      n: (cpu.f & 0x02) !== 0,
    },
    D00080: hex(mem[0xD00080], 2),
    D00081: hex(mem[0xD00081], 2),
    D0008D: hex(mem[0xD0008D], 2),
    D0009F: hex(mem[0xD0009F], 2),
    D000A0: hex(mem[0xD000A0], 2),
    D000A3: hex(mem[0xD000A3], 2),
    D000A8: hex(mem[0xD000A8], 2),
    D000C2: hex(mem[0xD000C2], 2),
    D000C4: hex(mem[0xD000C4], 2),
    D00121: hex(readValue(mem, 0xD00121, 3)),
    D00124: hex(mem[0xD00124], 2),
    D00587: hex(mem[0xD00587], 2),
    D0058C: hex(mem[0xD0058C], 2),
    D0058D: hex(mem[0xD0058D], 2),
    D0058E: hex(mem[0xD0058E], 2),
    D007CA: hex(readValue(mem, 0xD007CA, 3)),
    D007CD: hex(readValue(mem, 0xD007CD, 3)),
    D007D0: hex(readValue(mem, 0xD007D0, 3)),
    D008E0: hex(readValue(mem, 0xD008E0, 3)),
    D0231A: hex(readValue(mem, 0xD0231A, 3)),
    D0243A: hex(readValue(mem, 0xD0243A, 3)),
    D0243D: hex(readValue(mem, 0xD0243D, 3)),
    D02590: hex(readValue(mem, 0xD02590, 3)),
    D02593: hex(readValue(mem, 0xD02593, 3)),
    D0259A: hex(readValue(mem, 0xD0259A, 3)),
    D0259D: hex(readValue(mem, 0xD0259D, 3)),
    D025C5: hex(readValue(mem, 0xD025C5, 3)),
    D02A28: hex(mem[0xD02A28], 2),
    D001B8: hex(mem[0xD001B8], 2),
    D001D3: hex(mem[0xD001D3], 2),
    vramPixels: countVRAMPixels(mem),
  };
}

function makeCounter(targets) {
  return Object.fromEntries(Object.keys(targets).map((name) => [name, 0]));
}

function captureExecution(mem, cpu, block, pc, callStack, recentBlocks) {
  return {
    block,
    pc: hex(pc),
    state: stateSummary(mem, cpu),
    stackTop: readStackWords(mem, cpu.sp),
    ixFrame: readIxFrame(mem, cpu),
    callStackTail: callStack.slice(-24).map((addr) => hex(addr)),
    recentBlocks: recentBlocks.slice(-36).map((addr) => hex(addr)),
  };
}

function shouldSample(name, count) {
  if (count <= 3) return true;
  if (name === 'lowLoop006cdf' || name === 'lowPoll006d38' || name === 'lowCall006d5d' || name === 'lowBackedge006d64') {
    return count === 16 || count === 64 || count === 256 || count === 512;
  }
  if (name === 'hot000a92' || name === 'hot000bfe') {
    return count === 1 || count === 16 || count === 64;
  }
  return false;
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
  const counts = { homeRepaint058241: 0, vatSearch084711: 0, cleanup0018f8: 0, halt0019b5: 0 };
  let block = 0;

  prepareEventFrame(mem, peripherals, cpu);
  const result = executor.runFrom(HOME_REPAINT, 'adl', {
    maxSteps: 300000,
    maxLoopIterations: 30000,
    onBlock(pc) {
      block += 1;
      const addr = pc & 0xFFFFFF;
      if (addr === HOME_REPAINT) counts.homeRepaint058241 += 1;
      if (addr === 0x084711) counts.vatSearch084711 += 1;
      if (addr === 0x0018F8) counts.cleanup0018f8 += 1;
      if (addr === HALT_IDLE) counts.halt0019b5 += 1;
    },
  });

  return {
    result: formatRunResult(result),
    counts,
    fields: fieldsObject(captureFields(mem)),
    vramPixels: countVRAMPixels(mem),
    blocks: block,
  };
}

function runKeyTrace(mem, peripherals, executor, cpu, keyCase, preserveMode) {
  rearmCxMain(mem);
  seedKey(mem, keyCase);
  prepareEventFrame(mem, peripherals, cpu);

  const preKeySnapshot = captureRanges(mem, preserveMode.ranges);
  const counts = makeCounter(TARGETS);
  const samples = [];
  const afterSamples = [];
  const restorations = [];
  const recentBlocks = [];
  const callStack = [];
  const pendingAfter = [];
  const hotBlocks = new Map();

  let block = 0;
  let prevSp = cpu.sp & 0xFFFFFF;
  let prevPc = OUTER_LOOP;
  let currentBlock = OUTER_LOOP;
  let pendingRestore = null;
  let stopReason = null;
  let firstTokenTailBlock = null;
  const firstHits = {};

  function pushRecent(addr) {
    if (recentBlocks.length === 0 || recentBlocks[recentBlocks.length - 1] !== addr) {
      recentBlocks.push(addr);
      if (recentBlocks.length > 96) recentBlocks.shift();
    }
  }

  function restoreNow(label, addr) {
    const before = stateSummary(mem, cpu);
    restoreRanges(mem, preKeySnapshot);
    restorations.push({
      label,
      atBlock: block,
      atPc: hex(addr),
      before,
      after: stateSummary(mem, cpu),
    });
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

        if (pendingRestore) {
          restoreNow(pendingRestore, addr);
          pendingRestore = null;
        }

        while (pendingAfter.length > 0) {
          const pending = pendingAfter.shift();
          afterSamples.push({
            ...pending,
            afterBlock: block,
            afterPc: hex(addr),
            after: stateSummary(mem, cpu),
          });
        }

        currentBlock = addr;
        hotBlocks.set(hex(addr), (hotBlocks.get(hex(addr)) ?? 0) + 1);
        pushRecent(addr);

        const curSp = cpu.sp & 0xFFFFFF;
        const delta = prevSp - curSp;
        if (delta >= 3 && delta <= 18) {
          callStack.push(prevPc);
          if (callStack.length > 200) callStack.shift();
        } else if (delta <= -3 && delta >= -18) {
          const pops = Math.max(1, Math.floor((-delta) / 3));
          callStack.splice(Math.max(0, callStack.length - pops), pops);
        }
        prevSp = curSp;

        for (const [name, target] of Object.entries(TARGETS)) {
          if (addr === target) {
            counts[name] += 1;
            if (!(name in firstHits)) firstHits[name] = block;
            if (
              firstTokenTailBlock === null &&
              (name === 'tokenExit08f5e1' || name === 'tokenGate090992' || name === 'eolTuple08f54b')
            ) {
              firstTokenTailBlock = block;
            }
            if (shouldSample(name, counts[name]) && samples.length < 120) {
              const sample = { name, ...captureExecution(mem, cpu, block, addr, callStack, recentBlocks) };
              samples.push(sample);
              pendingAfter.push({ name, targetPc: hex(addr), beforeBlock: block, before: sample.state });
            }
          }
        }

        if (addr === 0x0A2150) pendingRestore = 'after-0x0A2150-LDIR';
        if (addr === 0x001879) pendingRestore = 'after-0x001879-bulk-clear';

        if (firstTokenTailBlock !== null && block > firstTokenTailBlock + 64) {
          stopReason = 'after-token-tail-hit';
          throw new EarlyStop(stopReason);
        }

        if (preserveMode.name === 'broad' && counts.eolClear0a2150 >= 3 && addr === 0x0A2156) {
          stopReason = 'repeated-0x0A2150-clear-loop';
          throw new EarlyStop(stopReason);
        }

        if (counts.hot000a92 > 0 && counts.hot000bfe > 0 && block > firstHits.hot000bfe + 16) {
          stopReason = 'after-hot-low-loop-inputs';
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
  }

  return {
    key: keyCase.name,
    preserveMode: preserveMode.name,
    preserveLabel: preserveMode.label,
    preservedRanges: preserveMode.ranges.map(([name, addr, len]) => ({ name, addr: hex(addr), len })),
    label: keyCase.label,
    result: formatRunResult(rawResult),
    counts,
    firstHits,
    restorations,
    samples,
    afterSamples,
    hotBlocks: Array.from(hotBlocks.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30)
      .map(([pc, count]) => ({ pc, count })),
    lastBlocks: recentBlocks.slice(-64).map((addr) => hex(addr)),
    final: stateSummary(mem, cpu),
    currentBlock: hex(currentBlock),
  };
}

function runScenario(keyCase, preserveMode) {
  const machine = runPhase5WithSnapshot();
  const { mem, peripherals, executor, cpu, phase5, phases } = machine;
  const snapshot = phase5.snapshot?.fields ?? null;
  if (!snapshot) {
    return {
      key: keyCase.name,
      preserveMode: preserveMode.name,
      error: 'phase5-snapshot-not-captured',
      phases: phases.map((phase) => ({ name: phase.name, result: formatRunResult(phase.result) })),
      phase5,
    };
  }

  restoreFields(mem, snapshot);
  const repaint = runRepaint(mem, peripherals, executor, cpu);
  const keyTrace = runKeyTrace(mem, peripherals, executor, cpu, keyCase, preserveMode);

  return {
    key: keyCase.name,
    preserveMode: preserveMode.name,
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
    repaint,
    keyTrace,
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

function staticSection() {
  const lines = ['## Static Low-Route Snippets', ''];
  for (const pc of STATIC_BLOCKS) {
    const row = blockSummary(pc);
    lines.push(`### ${row.pc}`);
    lines.push('');
    if (row.missing) {
      lines.push('- Missing from PRELIFTED_BLOCKS.');
      lines.push('');
      continue;
    }
    lines.push('```text');
    for (const inst of row.instructions) {
      lines.push(`${inst.pc}  ${String(inst.bytes).padEnd(16)} ${inst.dasm}`);
    }
    lines.push('```');
    lines.push('');
    lines.push(`Exits: \`${JSON.stringify(row.exits)}\``);
    lines.push('');
  }
  return lines.join('\n');
}

function scenarioTable(scenarios) {
  return [
    '| Key | Preserve mode | Key trace | Restores | 0x0017FC | 0x0064D0 | 0x006CC6 | 0x006D5D | 0x006D64 | 0x000A92 | 0x000BFE | Token/tail | Final D007CA | Final D008E0 | Final VAT | D0058E | D00121 | D00124 |',
    '|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|---|---|---|',
    ...scenarios.map((row) => {
      if (row.error) return `| ${row.key} | ${row.preserveMode} | ERROR | ${row.error} | | | | | | | | | | | | | | |`;
      const k = row.keyTrace;
      const tokenHits = k.counts.tokenExit08f5e1 + k.counts.tokenGate090992 + k.counts.eolTuple08f54b;
      return `| ${k.label} | ${k.preserveMode} | ${k.result.termination} ${k.result.lastPc} | ${k.restorations.length} | ${k.counts.lowCaller0017fc} | ${k.counts.lowSelect0064d0} | ${k.counts.lowFrame006cc6} | ${k.counts.lowCall006d5d} | ${k.counts.lowBackedge006d64} | ${k.counts.hot000a92} | ${k.counts.hot000bfe} | ${tokenHits} | ${k.final.D007CA} | ${k.final.D008E0} | ${k.final.D02590} | ${k.final.D0058E} | ${k.final.D00121} | ${k.final.D00124} |`;
    }),
  ].join('\n');
}

function compactTrace(row) {
  if (row.error) return row;
  const k = row.keyTrace;
  const wanted = [
    'lowCaller0017fc',
    'lowSelect0064d0',
    'lowFrame006cc6',
    'lowCall006d5d',
    'lowBackedge006d64',
    'hot000a92',
    'hot000bfe',
  ];
  return {
    key: k.label,
    preserveMode: k.preserveMode,
    preserveLabel: k.preserveLabel,
    keyResult: k.result,
    counts: k.counts,
    firstHits: k.firstHits,
    restorations: k.restorations.map((item) => ({
      label: item.label,
      atBlock: item.atBlock,
      atPc: item.atPc,
      afterD007CA: item.after.D007CA,
      afterD008E0: item.after.D008E0,
      afterD02590: item.after.D02590,
      afterD0058E: item.after.D0058E,
      afterD00121: item.after.D00121,
      afterD00124: item.after.D00124,
    })),
    branchSamples: wanted.map((name) => summarizeSample(k.samples.find((sample) => sample.name === name))).filter(Boolean),
    branchOutcomes: wanted.map((name) => summarizeOutcome(k.afterSamples.find((sample) => sample.name === name))).filter(Boolean),
    hotBlocks: k.hotBlocks,
    lastBlocks: k.lastBlocks,
    final: k.final,
  };
}

function firstLowSample(row, name) {
  if (row.error) return null;
  return row.keyTrace.samples.find((sample) => sample.name === name) ?? null;
}

function narrowState(state) {
  if (!state) return null;
  return {
    pc: state.pc,
    sp: state.sp,
    ix: state.ix,
    iy: state.iy,
    af: state.af,
    bc: state.bc,
    de: state.de,
    hl: state.hl,
    flags: state.flags,
    D00121: state.D00121,
    D00124: state.D00124,
    D00587: state.D00587,
    D0058C: state.D0058C,
    D0058D: state.D0058D,
    D0058E: state.D0058E,
    D00080: state.D00080,
    D00081: state.D00081,
    D0009F: state.D0009F,
    D000A0: state.D000A0,
    D000A3: state.D000A3,
    D000C4: state.D000C4,
    D007CA: state.D007CA,
    D008E0: state.D008E0,
    D0231A: state.D0231A,
    D0243A: state.D0243A,
    D0243D: state.D0243D,
    D02590: state.D02590,
    D02A28: state.D02A28,
    D001B8: state.D001B8,
    D001D3: state.D001D3,
    vramPixels: state.vramPixels,
  };
}

function summarizeSample(sample) {
  if (!sample) return null;
  return {
    name: sample.name,
    block: sample.block,
    pc: sample.pc,
    state: narrowState(sample.state),
    ixFrame: sample.ixFrame,
    stackTop: sample.stackTop.slice(0, 5),
    callStackTail: sample.callStackTail.slice(-12),
    recentBlocks: sample.recentBlocks.slice(-16),
  };
}

function summarizeOutcome(sample) {
  if (!sample) return null;
  return {
    name: sample.name,
    targetPc: sample.targetPc,
    beforeBlock: sample.beforeBlock,
    afterBlock: sample.afterBlock,
    afterPc: sample.afterPc,
    before: narrowState(sample.before),
    after: narrowState(sample.after),
  };
}

function buildReport(scenarios) {
  const successful = scenarios.filter((row) => !row.error);
  const repaintGroups = new Map();
  for (const row of successful) {
    const key = row.key;
    if (!repaintGroups.has(key)) repaintGroups.set(key, row.repaint.result);
  }
  const allRepaintClean = successful.every((row) => row.repaint.result.termination === 'halt');
  const allRestored = successful.every((row) => row.keyTrace.restorations.length > 0);
  const lowHotRows = successful.filter((row) => row.keyTrace.counts.hot000a92 > 0 && row.keyTrace.counts.hot000bfe > 0);
  const repeatedClearRows = successful.filter((row) => row.keyTrace.result.termination === 'repeated-0x0A2150-clear-loop');
  const allResolvedRoute = successful.every((row) => {
    const k = row.keyTrace;
    const tokenHits = k.counts.tokenExit08f5e1 + k.counts.tokenGate090992 + k.counts.eolTuple08f54b;
    const sawLowHot = k.counts.lowSelect0064d0 > 0 && k.counts.lowFrame006cc6 > 0 && k.counts.hot000a92 > 0 && k.counts.hot000bfe > 0;
    return tokenHits > 0 || sawLowHot || k.result.termination === 'repeated-0x0A2150-clear-loop';
  });
  const allMissToken = successful.every((row) => (
    row.keyTrace.counts.tokenExit08f5e1 === 0 &&
    row.keyTrace.counts.tokenGate090992 === 0 &&
    row.keyTrace.counts.eolTuple08f54b === 0
  ));
  const broadRows = successful.filter((row) => row.preserveMode === 'broad');
  const broadMissToken = broadRows.every((row) => (
    row.keyTrace.counts.tokenExit08f5e1 === 0 &&
    row.keyTrace.counts.tokenGate090992 === 0 &&
    row.keyTrace.counts.eolTuple08f54b === 0
  ));
  const firstEolBroadLow = firstLowSample(successful.find((row) => row.key === 'eol-clear' && row.preserveMode === 'broad') ?? {}, 'lowFrame006cc6');
  const firstDigitBroadLow = firstLowSample(successful.find((row) => row.key === 'digit2' && row.preserveMode === 'broad') ?? {}, 'lowFrame006cc6');

  return [
    '# Phase 647: Broader State Preservation Test',
    '',
    'Probe: `probe-phase647-broader-state-preserve.mjs`  ',
    'Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase647-broader-state-preserve.mjs`',
    '',
    '## Summary',
    '',
    allRepaintClean
      ? '- **** Clean repaint still halts before all preservation variants.'
      : '- !! Clean repaint failed in at least one traced key burst.',
    allRestored
      ? '- **** Restore hooks fired for every core and broad preservation variant.'
      : '- !! A preservation hook failed to run.',
    allResolvedRoute
      ? '- **** Every variant reached a bounded diagnostic outcome: low/hot route, repeated early-clear loop, or token/tail hit.'
      : '- !! At least one variant did not reach a diagnostic stop condition.',
    lowHotRows.length > 0
      ? `- *** Low/hot route remains active in ${lowHotRows.length}/${successful.length} variants.`
      : '- !! No variant reached the low/hot route.',
    repeatedClearRows.length > 0
      ? `- *** Broad EOL restoration changes the failure mode: ${repeatedClearRows.length} variant enters a repeated \`0x0A2150\` clear loop before low-route selection.`
      : '- *** No repeated early-clear loop was observed.',
    allMissToken
      ? '- **** Token/tail hooks remain bypassed in all variants: `0x08F5E1`, `0x090992`, and `0x08F54B` all stay at zero hits.'
      : '- *** Token/tail hooks fired in at least one run; inspect counters.',
    broadMissToken
      ? '- **** Broad IY/key/edit/low-frame restoration is negative: it preserves more RAM but does not reopen the token/tail route.'
      : '- *** Broad preservation reopened at least one token/tail hook; inspect the dynamic trace.',
    '',
    '## Scenario Results',
    '',
    scenarioTable(scenarios),
    '',
    '## Clean Repaint Controls',
    '',
    '```json',
    JSON.stringify(Object.fromEntries(repaintGroups), null, 2),
    '```',
    '',
    '## First Broad Low-Frame Inputs',
    '',
    '```json',
    JSON.stringify({
      eolClearBroadFirst006cc6: summarizeSample(firstEolBroadLow),
      digit2BroadFirst006cc6: summarizeSample(firstDigitBroadLow),
    }, null, 2),
    '```',
    '',
    staticSection(),
    '',
    '## Dynamic Evidence',
    '',
    '```json',
    JSON.stringify(scenarios.map(compactTrace), null, 2),
    '```',
    '',
    '## Interpretation',
    '',
    'The branch into the low status/transfer machinery is not fixed by restoring a broader pre-key state. The broad variant restores the previous core tuple plus `D00080-D000FF`, `D00587-D0058E`, `D02317-D02448`, and `D00121-D00124` after the destructive cleanup blocks. Digit2 still follows the same low route into `0x006CC6`, `0x006Dxx`, and hot `0x000A92`/`0x000BFE`. Broad EOL does not reopen token/tail either; it repeatedly re-enters the `0x0A2150` context-clear path with `D0058E=0x0F` restored, so preserving the pending EOL key appears to keep the cleanup branch alive.',
    '',
    'The actionable next target is therefore upstream control flow into `0x005B92 -> 0x005A19 -> 0x0059DA -> 0x0059E6 -> 0x0017FC -> 0x0064D0`, not a simple missing RAM tuple in the tested ranges. The broad restore also means the token/tail miss is not explained by key buffers, IY flag bytes, edit descriptors, or low-frame bytes being zero after cleanup.',
    '',
    'No runtime, transpiler, browser, or scheduler source files were modified.',
    '',
  ].join('\n');
}

console.log('phase647: compare core vs broad state preservation after cleanup');
const scenarios = KEY_CASES.flatMap((keyCase) => PRESERVE_MODES.map((mode) => runScenario(keyCase, mode)));
fs.writeFileSync(REPORT_PATH, `${buildReport(scenarios)}\n`);

const pass = scenarios.every((row) => (
  !row.error &&
  row.repaint.result.termination === 'halt' &&
  row.keyTrace.restorations.length > 0 &&
  (
    row.keyTrace.result.termination === 'repeated-0x0A2150-clear-loop' ||
    row.keyTrace.counts.tokenExit08f5e1 + row.keyTrace.counts.tokenGate090992 + row.keyTrace.counts.eolTuple08f54b > 0 ||
    (
      row.keyTrace.counts.lowSelect0064d0 > 0 &&
      row.keyTrace.counts.lowFrame006cc6 > 0 &&
      row.keyTrace.counts.hot000a92 > 0 &&
      row.keyTrace.counts.hot000bfe > 0
    )
  )
));

console.log(JSON.stringify({
  probe: 'phase647-broader-state-preserve',
  pass,
  report: path.basename(REPORT_PATH),
  summary: scenarios.map((row) => row.error ? { key: row.key, error: row.error } : {
    key: row.keyTrace.label,
    preserveMode: row.keyTrace.preserveMode,
    repaint: row.repaint.result,
    keyTrace: row.keyTrace.result,
    restorations: row.keyTrace.restorations.map((item) => ({
      label: item.label,
      atBlock: item.atBlock,
      atPc: item.atPc,
      afterD007CA: item.after.D007CA,
      afterD008E0: item.after.D008E0,
      afterD02590: item.after.D02590,
      afterD0058E: item.after.D0058E,
      afterD00121: item.after.D00121,
      afterD00124: item.after.D00124,
    })),
    counts: {
      lowCaller0017fc: row.keyTrace.counts.lowCaller0017fc,
      lowSelect0064d0: row.keyTrace.counts.lowSelect0064d0,
      lowFrame006cc6: row.keyTrace.counts.lowFrame006cc6,
      lowLoop006cdf: row.keyTrace.counts.lowLoop006cdf,
      lowPoll006d38: row.keyTrace.counts.lowPoll006d38,
      lowCall006d5d: row.keyTrace.counts.lowCall006d5d,
      lowBackedge006d64: row.keyTrace.counts.lowBackedge006d64,
      hot000a92: row.keyTrace.counts.hot000a92,
      hot000bfe: row.keyTrace.counts.hot000bfe,
      tokenExit08f5e1: row.keyTrace.counts.tokenExit08f5e1,
      tokenGate090992: row.keyTrace.counts.tokenGate090992,
      eolTuple08f54b: row.keyTrace.counts.eolTuple08f54b,
    },
    firstHits: row.keyTrace.firstHits,
    final: {
      D007CA: row.keyTrace.final.D007CA,
      D008E0: row.keyTrace.final.D008E0,
      D02590: row.keyTrace.final.D02590,
      D0058E: row.keyTrace.final.D0058E,
      D00121: row.keyTrace.final.D00121,
      D00124: row.keyTrace.final.D00124,
      vramPixels: row.keyTrace.final.vramPixels,
    },
  }),
}, null, 2));

if (!pass) process.exitCode = 1;
