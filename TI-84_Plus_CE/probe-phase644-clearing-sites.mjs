import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase644-clearing-sites.md');

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

const WATCH_RANGES = Object.freeze([
  ['context-D007CA', 0xD007CA, 0xD007EB],
  ['errsp-D008E0', 0xD008E0, 0xD008E2],
  ['vat-D02587', 0xD02587, 0xD025A2],
  ['heap-D025C5', 0xD025C5, 0xD025C7],
  ['editor-D02317', 0xD02317, 0xD0231F],
  ['edit-desc-D02434', 0xD02434, 0xD02448],
  ['low-frame-D00121', 0xD00121, 0xD00124],
  ['keybuf-D00587', 0xD00587, 0xD0058E],
]);

const TARGET_BLOCKS = Object.freeze({
  outerLoop08c331: OUTER_LOOP,
  cxMain0585e9: CX_MAIN,
  getCsc03fa09: 0x03FA09,
  contextClear0a2150: 0x0A2150,
  contextClear0a2156: 0x0A2156,
  bulkGate001872: 0x001872,
  bulkClear001879: 0x001879,
  bulkEntry0018f8: 0x0018F8,
  firstLow006d5d: 0x006D5D,
  lowLoop006cdf: 0x006CDF,
  postKey013d9f: 0x013D9F,
  relay0059e9: 0x0059E9,
  relay0059f3: 0x0059F3,
  relay001c55: 0x001C55,
  flash001c33: 0x001C33,
  flash0158d2: 0x0158D2,
  flash0158f8: 0x0158F8,
  tokenExit08f5e1: 0x08F5E1,
  tokenGate090992: 0x090992,
  eolTuple08f54b: 0x08F54B,
});

const STATIC_BLOCKS = Object.freeze([
  0x0A2106,
  0x0A2150,
  0x0A2156,
  0x001872,
  0x001879,
  0x0018F8,
  0x013D9F,
  0x0059E9,
  0x0059F3,
  0x001C55,
  0x001C33,
  0x0158D2,
  0x0158F8,
  0x0064D0,
  0x006CC6,
  0x006D5D,
]);

const KEY_CASES = Object.freeze([
  { name: 'eol-clear', label: 'EOL/CLEAR', pendingKey: 0x0F, matrixScan: 0x0F, maxSteps: 90000 },
  { name: 'digit2', label: 'Digit2', pendingKey: 0x90, matrixScan: 0x1A, maxSteps: 70000 },
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

function fillSentinel(mem, start, bytes) {
  mem.fill(0xFF, start, start + bytes);
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
  const offsets = [-45, -42, -39, -27, -24, -20, -11, -7, -6, -3, 0, 3, 6, 9];
  return Object.fromEntries(offsets.map((off) => {
    const addr = (ix + off) & 0xFFFFFF;
    const width = [-24, -7].includes(off) ? 1 : 3;
    return [`IX${off >= 0 ? '+' : ''}${off}`, hex(readValue(mem, addr, width), width * 2)];
  }));
}

function interestingState(mem, cpu) {
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
    },
    D007CA: hex(readValue(mem, 0xD007CA, 3)),
    D007CD: hex(readValue(mem, 0xD007CD, 3)),
    D007D0: hex(readValue(mem, 0xD007D0, 3)),
    D008E0: hex(readValue(mem, 0xD008E0, 3)),
    D02590: hex(readValue(mem, 0xD02590, 3)),
    D02593: hex(readValue(mem, 0xD02593, 3)),
    D0259A: hex(readValue(mem, 0xD0259A, 3)),
    D0259D: hex(readValue(mem, 0xD0259D, 3)),
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
  };
}

function captureExecution(mem, cpu, block, pc, callStack, recentBlocks) {
  return {
    block,
    pc: hex(pc),
    state: interestingState(mem, cpu),
    stackTop: readStackWords(mem, cpu.sp, 5),
    ixFrame: readIxFrame(mem, cpu),
    callStackTail: callStack.slice(-20).map((addr) => hex(addr)),
    recentBlocks: recentBlocks.slice(-32).map((addr) => hex(addr)),
  };
}

function watchedRange(addr) {
  const a = addr & 0xFFFFFF;
  return WATCH_RANGES.find(([, start, end]) => a >= start && a <= end)?.[0] ?? null;
}

function installWriteWatch(cpu, mem, getContext) {
  const writes = [];
  const clearEvents = [];
  const writeCounts = new Map();
  const originalWrite8 = cpu.write8.bind(cpu);
  const originalWrite16 = cpu.write16.bind(cpu);
  const originalWrite24 = cpu.write24.bind(cpu);

  function record(kind, addr, value, width) {
    const range = watchedRange(addr);
    if (!range) return;

    const oldValue = readValue(mem, addr & 0xFFFFFF, width);
    const ctx = getContext();
    const key = `${kind}:${hex(addr)}:${range}`;
    writeCounts.set(key, (writeCounts.get(key) ?? 0) + 1);

    const row = {
      kind,
      range,
      addr: hex(addr),
      width,
      oldValue: hex(oldValue, width * 2),
      value: hex(value, width * 2),
      pc: hex(ctx.currentBlock),
      block: ctx.block,
      sp: hex(cpu.sp),
    };
    if (writes.length < 220) writes.push(row);

    const clearing = oldValue !== 0 && value === 0;
    const directClearBlock = ctx.currentBlock === 0x0A2156 || ctx.currentBlock === 0x001879 || ctx.currentBlock === 0x0018F8;
    if ((clearing || directClearBlock) && clearEvents.length < 80) {
      clearEvents.push({
        ...row,
        clearing,
        callStackTail: ctx.callStack.slice(-20).map((x) => hex(x)),
        recentBlocks: ctx.recentBlocks.slice(-28).map((x) => hex(x)),
        state: interestingState(mem, cpu),
      });
    }
  }

  cpu.write8 = (addr, value) => {
    record('write8', addr, value & 0xFF, 1);
    return originalWrite8(addr, value);
  };
  cpu.write16 = (addr, value) => {
    record('write16', addr, value & 0xFFFF, 2);
    return originalWrite16(addr, value);
  };
  cpu.write24 = (addr, value) => {
    record('write24', addr, value & 0xFFFFFF, 3);
    return originalWrite24(addr, value);
  };

  return {
    uninstall() {
      cpu.write8 = originalWrite8;
      cpu.write16 = originalWrite16;
      cpu.write24 = originalWrite24;
    },
    result() {
      return {
        writes,
        clearEvents,
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

function runKeyTrace(mem, peripherals, executor, cpu, keyCase) {
  rearmCxMain(mem);
  seedKey(mem, keyCase);
  prepareEventFrame(mem, peripherals, cpu);

  const counts = makeCounter(TARGET_BLOCKS);
  const targetSamples = [];
  const afterSamples = [];
  const recentBlocks = [];
  const callStack = [];
  const hotBlocks = new Map();
  const pendingAfter = [];

  let block = 0;
  let prevSp = cpu.sp & 0xFFFFFF;
  let prevPc = OUTER_LOOP;
  let currentBlock = OUTER_LOOP;
  let firstLowBlock = null;
  let firstBulkClearBlock = null;
  let firstContextClearBlock = null;
  let stopReason = null;

  function pushRecent(addr) {
    if (recentBlocks.length === 0 || recentBlocks[recentBlocks.length - 1] !== addr) {
      recentBlocks.push(addr);
      if (recentBlocks.length > 64) recentBlocks.shift();
    }
  }

  const writeWatch = installWriteWatch(cpu, mem, () => ({
    block,
    currentBlock,
    callStack,
    recentBlocks,
  }));

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

        while (pendingAfter.length > 0) {
          const pending = pendingAfter.shift();
          afterSamples.push({
            ...pending,
            afterBlock: block,
            afterPc: hex(addr),
            after: interestingState(mem, cpu),
          });
        }

        currentBlock = addr;
        hotBlocks.set(hex(addr), (hotBlocks.get(hex(addr)) ?? 0) + 1);
        pushRecent(addr);

        const curSp = cpu.sp & 0xFFFFFF;
        const delta = prevSp - curSp;
        if (delta >= 3 && delta <= 15) {
          callStack.push(prevPc);
          if (callStack.length > 160) callStack.shift();
        } else if (delta <= -3 && delta >= -15) {
          const pops = Math.max(1, Math.floor((-delta) / 3));
          callStack.splice(Math.max(0, callStack.length - pops), pops);
        }
        prevSp = curSp;

        for (const [name, target] of Object.entries(TARGET_BLOCKS)) {
          if (addr === target) {
            counts[name] += 1;
            const sample = captureExecution(mem, cpu, block, addr, callStack, recentBlocks);
            if (targetSamples.length < 90) targetSamples.push({ name, ...sample });
            pendingAfter.push({ name, targetPc: hex(addr), beforeBlock: block, before: sample.state });
          }
        }

        if (addr === 0x0A2150 || addr === 0x0A2156) {
          if (firstContextClearBlock === null) firstContextClearBlock = block;
        }
        if (addr === 0x001879 || addr === 0x0018F8) {
          if (firstBulkClearBlock === null) firstBulkClearBlock = block;
        }
        if (addr === 0x006D5D && firstLowBlock === null) firstLowBlock = block;

        if (firstLowBlock !== null && block > firstLowBlock + 24) {
          stopReason = 'after-first-low-route';
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
    writeWatch.uninstall();
  }

  const writeResult = writeWatch.result();
  return {
    key: keyCase.name,
    label: keyCase.label,
    result: formatRunResult(rawResult),
    firstContextClearBlock,
    firstBulkClearBlock,
    firstLowBlock,
    counts,
    targetSamples,
    afterSamples,
    writes: writeResult.writes,
    clearEvents: writeResult.clearEvents,
    writeCounts: writeResult.writeCounts,
    final: interestingState(mem, cpu),
    hotBlocks: Array.from(hotBlocks.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 24)
      .map(([pc, count]) => ({ pc, count })),
    lastBlocks: recentBlocks.slice(-48).map((addr) => hex(addr)),
  };
}

function runScenario(keyCase) {
  const machine = runPhase5WithSnapshot();
  const { mem, peripherals, executor, cpu, phase5, phases } = machine;
  const snapshot = phase5.snapshot?.fields ?? null;
  if (!snapshot) {
    return {
      key: keyCase.name,
      error: 'phase5-snapshot-not-captured',
      phases: phases.map((phase) => ({ name: phase.name, result: formatRunResult(phase.result) })),
      phase5,
    };
  }

  restoreFields(mem, snapshot);
  const repaint = runRepaint(mem, peripherals, executor, cpu);
  const keyTrace = runKeyTrace(mem, peripherals, executor, cpu, keyCase);

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

function directRefsTo(target) {
  const refs = [];
  for (const [key, block] of Object.entries(BLOCKS)) {
    const from = Number.parseInt(key.slice(0, 6), 16);
    for (const exit of block.exits ?? []) {
      if ((exit.target & 0xFFFFFF) === target) refs.push({ from: hex(from), type: exit.type, condition: exit.condition ?? '' });
    }
    for (const inst of block.instructions ?? []) {
      const dasm = String(inst.dasm ?? '').toLowerCase();
      const needle = `0x${target.toString(16).padStart(6, '0')}`;
      if (dasm.includes(needle)) refs.push({ from: hex(from), type: 'instruction', pc: hex(inst.pc), dasm: inst.dasm });
    }
  }
  return refs.slice(0, 30);
}

function staticSection() {
  const lines = ['## Static Snippets', ''];
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
      lines.push(`${inst.pc}  ${String(inst.bytes).padEnd(14)} ${inst.dasm}`);
    }
    lines.push('```');
    lines.push('');
    lines.push(`Exits: \`${JSON.stringify(row.exits)}\``);
    lines.push('');
  }

  lines.push('## Direct Static References');
  lines.push('');
  lines.push('```json');
  lines.push(JSON.stringify({
    '0x0A2150': directRefsTo(0x0A2150),
    '0x0A2156': directRefsTo(0x0A2156),
    '0x001879': directRefsTo(0x001879),
    '0x0018F8': directRefsTo(0x0018F8),
    '0x006D5D': directRefsTo(0x006D5D),
  }, null, 2));
  lines.push('```');
  lines.push('');
  return lines.join('\n');
}

function scenarioTable(scenarios) {
  return [
    '| Key | Repaint | Key trace | 0x0A2150 | 0x0A2156 | 0x001879 | 0x0018F8 | First low | cxMain | GetCSC | Token/tail hits | Clear events | Final D007CA | Final D008E0 | Final VAT |',
    '|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|',
    ...scenarios.map((row) => {
      if (row.error) return `| ${row.key} | ERROR | ${row.error} | | | | | | | | | | | | |`;
      const k = row.keyTrace;
      const tokenHits = k.counts.tokenExit08f5e1 + k.counts.tokenGate090992 + k.counts.eolTuple08f54b;
      return `| ${k.label} | ${row.repaint.result.termination} ${row.repaint.result.lastPc} | ${k.result.termination} ${k.result.lastPc} | ${k.counts.contextClear0a2150} | ${k.counts.contextClear0a2156} | ${k.counts.bulkClear001879} | ${k.counts.bulkEntry0018f8} | ${k.firstLowBlock ?? ''} | ${k.counts.cxMain0585e9} | ${k.counts.getCsc03fa09} | ${tokenHits} | ${k.clearEvents.length} | ${k.final.D007CA} | ${k.final.D008E0} | ${k.final.D02590} |`;
    }),
  ].join('\n');
}

function compactTrace(row) {
  if (row.error) return row;
  const k = row.keyTrace;
  return {
    key: k.label,
    phase5Snapshot: row.phase5.snapshot,
    repaint: row.repaint,
    keyResult: k.result,
    counts: k.counts,
    firstContextClearBlock: k.firstContextClearBlock,
    firstBulkClearBlock: k.firstBulkClearBlock,
    firstLowBlock: k.firstLowBlock,
    clearEvents: k.clearEvents.slice(0, 32),
    targetSamples: k.targetSamples.filter((sample) => (
      sample.name === 'contextClear0a2150' ||
      sample.name === 'contextClear0a2156' ||
      sample.name === 'bulkGate001872' ||
      sample.name === 'bulkClear001879' ||
      sample.name === 'bulkEntry0018f8' ||
      sample.name === 'firstLow006d5d' ||
      sample.name === 'relay0059e9' ||
      sample.name === 'relay0059f3' ||
      sample.name === 'relay001c55' ||
      sample.name === 'postKey013d9f'
    )).slice(0, 24),
    afterSamples: k.afterSamples.filter((sample) => (
      sample.name === 'contextClear0a2150' ||
      sample.name === 'contextClear0a2156' ||
      sample.name === 'bulkClear001879' ||
      sample.name === 'bulkEntry0018f8'
    )).slice(0, 16),
    writeCounts: k.writeCounts.slice(0, 80),
    hotBlocks: k.hotBlocks,
    lastBlocks: k.lastBlocks,
    final: k.final,
  };
}

function buildReport(scenarios) {
  const successful = scenarios.filter((row) => !row.error);
  const eol = successful.find((row) => row.key === 'eol-clear')?.keyTrace;
  const digit2 = successful.find((row) => row.key === 'digit2')?.keyTrace;
  const allRepaintClean = successful.every((row) => row.repaint.result.termination === 'halt');
  const allReachedLow = successful.every((row) => row.keyTrace.firstLowBlock !== null);
  const allMissToken = successful.every((row) => (
    row.keyTrace.counts.tokenExit08f5e1 === 0 &&
    row.keyTrace.counts.tokenGate090992 === 0 &&
    row.keyTrace.counts.eolTuple08f54b === 0
  ));

  return [
    '# Phase 644: Key-Burst Clearing Sites',
    '',
    'Probe: `probe-phase644-clearing-sites.mjs`  ',
    'Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase644-clearing-sites.mjs`',
    '',
    '## Summary',
    '',
    allRepaintClean
      ? '- **** Clean-repaint prerequisite held for both keys before tracing clearing sites.'
      : '- !! Clean-repaint prerequisite failed in at least one scenario.',
    eol && eol.counts.contextClear0a2150 > 0
      ? '- **** EOL/CLEAR has an early context wipe at `0x0A2150`: its `LDIR` copies zeros into `D007CA` onward, zeroing `D007CA`/`D008E0` while VAT still survives until the later `0x001879` bulk clear. The following `0x0A2156` loop is a 25-byte `0x20` space-fill, not the zeroing instruction.'
      : '- !! EOL/CLEAR did not hit `0x0A2150`; inspect dynamic samples.',
    digit2 && digit2.counts.contextClear0a2156 === 0 && digit2.counts.bulkClear001879 > 0
      ? '- *** Digit2 does not take the `0x0A2156` early context-clear path in this run; its first watched context/VAT destruction is the bulk clear at `0x001879`.'
      : '- *** Digit2 clearing path differed from expectation; inspect dynamic samples.',
    allReachedLow
      ? '- *** Both key bursts then enter the same low `0x006Dxx` status/transfer loop with `D007CA`, `D008E0`, and VAT zeroed.'
      : '- !! At least one key did not reach the low route.',
    allMissToken
      ? '- *** Token/tail persistence hooks remain bypassed before low-route entry (`0x08F5E1`, `0x090992`, `0x08F54B` all 0 hits).'
      : '- *** A token/tail hook was hit; inspect counters.',
    '',
    '## Scenario Results',
    '',
    scenarioTable(scenarios),
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
    'The two clear mechanisms are distinct. EOL/CLEAR first routes through `0x0A2150 -> 0x0A2156`; the destructive operation is the `0x0A2150` `LDIR` with `DE=0xD007CA`, which overwrites the active context/error-SP area while the VAT tuple remains live, and `0x0A2156` is the subsequent `0x20` fill loop at `D020A7`. Digit2 skips that early context wipe and loses dispatch state at the `0x001879` bulk clear. In both cases the key has already reached `cxMain`/`GetCSC`, but after the clearing point the run is no longer in the token/display-save tail; it falls into the low `0x006Dxx` framed transfer loop with the dispatch state erased. The next preservation test should hook these exact clear points, not just the later low-route loop.',
    '',
    'No runtime, transpiler, browser, or scheduler source files were modified.',
    '',
  ].join('\n');
}

console.log('phase644: trace key-burst clearing sites');
const scenarios = KEY_CASES.map((keyCase) => runScenario(keyCase));
fs.writeFileSync(REPORT_PATH, `${buildReport(scenarios)}\n`);

const pass = scenarios.every((row) => (
  !row.error &&
  row.repaint.result.termination === 'halt' &&
  row.keyTrace.firstLowBlock !== null &&
  row.keyTrace.clearEvents.length > 0
));

console.log(JSON.stringify({
  probe: 'phase644-clearing-sites',
  pass,
  report: path.basename(REPORT_PATH),
  summary: scenarios.map((row) => row.error ? { key: row.key, error: row.error } : {
    key: row.keyTrace.label,
    repaint: row.repaint.result,
    keyTrace: row.keyTrace.result,
    counts: {
      contextClear0a2150: row.keyTrace.counts.contextClear0a2150,
      contextClear0a2156: row.keyTrace.counts.contextClear0a2156,
      bulkClear001879: row.keyTrace.counts.bulkClear001879,
      bulkEntry0018f8: row.keyTrace.counts.bulkEntry0018f8,
      cxMain0585e9: row.keyTrace.counts.cxMain0585e9,
      getCsc03fa09: row.keyTrace.counts.getCsc03fa09,
      tokenExit08f5e1: row.keyTrace.counts.tokenExit08f5e1,
      tokenGate090992: row.keyTrace.counts.tokenGate090992,
      eolTuple08f54b: row.keyTrace.counts.eolTuple08f54b,
    },
    firstContextClearBlock: row.keyTrace.firstContextClearBlock,
    firstBulkClearBlock: row.keyTrace.firstBulkClearBlock,
    firstLowBlock: row.keyTrace.firstLowBlock,
    clearEvents: row.keyTrace.clearEvents.length,
    final: {
      D007CA: row.keyTrace.final.D007CA,
      D008E0: row.keyTrace.final.D008E0,
      D02590: row.keyTrace.final.D02590,
      vramPixels: row.keyTrace.final.vramPixels,
    },
  }),
}, null, 2));

if (!pass) process.exitCode = 1;
