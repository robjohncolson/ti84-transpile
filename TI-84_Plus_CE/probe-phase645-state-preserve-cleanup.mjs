import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase645-state-preserve-cleanup.md');

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

const PRESERVE_RANGES = Object.freeze([
  ['contextTable_D007CA_D007ED', 0xD007CA, 0x24],
  ['errSP_D008E0', 0xD008E0, 3],
  ['vatTuple_D02587_D025A2', 0xD02587, 0x1C],
  ['heapSize_D025C5', 0xD025C5, 3],
]);

const TARGETS = Object.freeze({
  outerLoop08c331: OUTER_LOOP,
  cxMain0585e9: CX_MAIN,
  getCsc03fa09: 0x03FA09,
  earlyContextClear0a2150: 0x0A2150,
  earlySpaceFill0a2156: 0x0A2156,
  bulkGate001872: 0x001872,
  bulkClear001879: 0x001879,
  bulkTail0018f8: 0x0018F8,
  firstLow006d5d: 0x006D5D,
  lowLoop006cdf: 0x006CDF,
  lowLoop006d38: 0x006D38,
  tokenExit08f5e1: 0x08F5E1,
  tokenGate090992: 0x090992,
  tokenStore09098e: 0x09098E,
  eolTuple08f54b: 0x08F54B,
  halt0019b5: HALT_IDLE,
});

const KEY_CASES = Object.freeze([
  { name: 'eol-clear', label: 'EOL/CLEAR', pendingKey: 0x0F, matrixScan: 0x0F, maxSteps: 180000 },
  { name: 'digit2', label: 'Digit2', pendingKey: 0x90, matrixScan: 0x1A, maxSteps: 160000 },
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

function captureFields(mem, fields = PHASE5_FIELDS) {
  return fields.map(([name, addr, len]) => ({
    name,
    addr,
    len,
    value: readValue(mem, addr, len),
    bytes: Array.from(mem.slice(addr, addr + len)),
  }));
}

function captureRanges(mem, ranges = PRESERVE_RANGES) {
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
    D007CA: hex(readValue(mem, 0xD007CA, 3)),
    D007CD: hex(readValue(mem, 0xD007CD, 3)),
    D007D0: hex(readValue(mem, 0xD007D0, 3)),
    D008E0: hex(readValue(mem, 0xD008E0, 3)),
    D02587: hex(readValue(mem, 0xD02587, 3)),
    D02590: hex(readValue(mem, 0xD02590, 3)),
    D02593: hex(readValue(mem, 0xD02593, 3)),
    D0259A: hex(readValue(mem, 0xD0259A, 3)),
    D0259D: hex(readValue(mem, 0xD0259D, 3)),
    D025C5: hex(readValue(mem, 0xD025C5, 3)),
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
  mem[0xD00587] = keyCase.matrixScan;
  mem[0xD00080] = (mem[0xD00080] | 0x08) & 0xFF;
  mem[0xD0009F] = (mem[0xD0009F] | 0x20) & 0xFF;
}

function makeCounter(targets) {
  return Object.fromEntries(Object.keys(targets).map((name) => [name, 0]));
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

function runKeyWithPreservation(mem, peripherals, executor, cpu, keyCase) {
  rearmCxMain(mem);
  seedKey(mem, keyCase);
  prepareEventFrame(mem, peripherals, cpu);

  const preKeySnapshot = captureRanges(mem);
  const counts = makeCounter(TARGETS);
  const samples = [];
  const restorations = [];
  const hotBlocks = new Map();
  const recentBlocks = [];

  let block = 0;
  let currentBlock = OUTER_LOOP;
  let prevPc = OUTER_LOOP;
  let pendingRestore = null;
  let firstLowBlock = null;
  let firstTokenBlock = null;
  let firstHaltBlock = null;
  let stopReason = null;

  function rememberBlock(addr) {
    if (recentBlocks.length === 0 || recentBlocks[recentBlocks.length - 1] !== addr) {
      recentBlocks.push(addr);
      if (recentBlocks.length > 80) recentBlocks.shift();
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

        currentBlock = addr;
        hotBlocks.set(hex(addr), (hotBlocks.get(hex(addr)) ?? 0) + 1);
        rememberBlock(addr);

        for (const [name, target] of Object.entries(TARGETS)) {
          if (addr === target) {
            counts[name] += 1;
            if (samples.length < 80) {
              samples.push({
                name,
                block,
                pc: hex(addr),
                state: stateSummary(mem, cpu),
                recentBlocks: recentBlocks.slice(-32).map((x) => hex(x)),
              });
            }
          }
        }

        if (addr === 0x0A2150) pendingRestore = 'after-0x0A2150-LDIR';
        if (addr === 0x001879) pendingRestore = 'after-0x001879-bulk-clear';

        if (addr === 0x006D5D && firstLowBlock === null) firstLowBlock = block;
        if ((addr === 0x08F5E1 || addr === 0x090992 || addr === 0x08F54B) && firstTokenBlock === null) {
          firstTokenBlock = block;
        }
        if (addr === HALT_IDLE && firstHaltBlock === null) firstHaltBlock = block;

        if (firstTokenBlock !== null && block > firstTokenBlock + 64) {
          stopReason = 'after-token-tail-hit';
          throw new EarlyStop(stopReason);
        }
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
  }

  return {
    key: keyCase.name,
    label: keyCase.label,
    result: formatRunResult(rawResult),
    counts,
    restorations,
    firstLowBlock,
    firstTokenBlock,
    firstHaltBlock,
    preKey: stateSummary(mem, cpu),
    samples,
    hotBlocks: Array.from(hotBlocks.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 24)
      .map(([pc, count]) => ({ pc, count })),
    lastBlocks: recentBlocks.slice(-48).map((addr) => hex(addr)),
    final: stateSummary(mem, cpu),
    currentBlock: hex(currentBlock),
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
  const keyTrace = runKeyWithPreservation(mem, peripherals, executor, cpu, keyCase);

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

function scenarioTable(scenarios) {
  return [
    '| Key | Repaint | Key trace | Restores | 0x0A2150 | 0x001879 | 0x0018F8 | First low | Token/tail hits | cxMain | GetCSC | Final D007CA | Final D008E0 | Final VAT |',
    '|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|',
    ...scenarios.map((row) => {
      if (row.error) return `| ${row.key} | ERROR | ${row.error} | | | | | | | | | | | |`;
      const k = row.keyTrace;
      const tokenHits = k.counts.tokenExit08f5e1 + k.counts.tokenGate090992 + k.counts.tokenStore09098e + k.counts.eolTuple08f54b;
      return `| ${k.label} | ${row.repaint.result.termination} ${row.repaint.result.lastPc} | ${k.result.termination} ${k.result.lastPc} | ${k.restorations.length} | ${k.counts.earlyContextClear0a2150} | ${k.counts.bulkClear001879} | ${k.counts.bulkTail0018f8} | ${k.firstLowBlock ?? ''} | ${tokenHits} | ${k.counts.cxMain0585e9} | ${k.counts.getCsc03fa09} | ${k.final.D007CA} | ${k.final.D008E0} | ${k.final.D02590} |`;
    }),
  ].join('\n');
}

function compactTrace(row) {
  if (row.error) return row;
  const k = row.keyTrace;
  return {
    key: k.label,
    repaint: row.repaint,
    keyResult: k.result,
    counts: k.counts,
    firstLowBlock: k.firstLowBlock,
    firstTokenBlock: k.firstTokenBlock,
    firstHaltBlock: k.firstHaltBlock,
    restorations: k.restorations,
    samples: k.samples.filter((sample) => (
      sample.name === 'earlyContextClear0a2150' ||
      sample.name === 'earlySpaceFill0a2156' ||
      sample.name === 'bulkGate001872' ||
      sample.name === 'bulkClear001879' ||
      sample.name === 'bulkTail0018f8' ||
      sample.name === 'firstLow006d5d' ||
      sample.name === 'tokenExit08f5e1' ||
      sample.name === 'tokenGate090992' ||
      sample.name === 'tokenStore09098e' ||
      sample.name === 'eolTuple08f54b'
    )),
    hotBlocks: k.hotBlocks,
    lastBlocks: k.lastBlocks,
    final: k.final,
  };
}

function buildReport(scenarios) {
  const successful = scenarios.filter((row) => !row.error);
  const allRepaintClean = successful.every((row) => row.repaint.result.termination === 'halt');
  const allRestored = successful.every((row) => row.keyTrace.restorations.length > 0);
  const allReachedLow = successful.every((row) => row.keyTrace.firstLowBlock !== null);
  const anyToken = successful.some((row) => (
    row.keyTrace.counts.tokenExit08f5e1 > 0 ||
    row.keyTrace.counts.tokenGate090992 > 0 ||
    row.keyTrace.counts.tokenStore09098e > 0 ||
    row.keyTrace.counts.eolTuple08f54b > 0
  ));

  return [
    '# Phase 645: State Preservation Across Key Cleanup',
    '',
    'Probe: `probe-phase645-state-preserve-cleanup.mjs`  ',
    'Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase645-state-preserve-cleanup.mjs`',
    '',
    '## Summary',
    '',
    allRepaintClean
      ? '- **** Clean-repaint prerequisite held before both key-burst preservation tests.'
      : '- !! Clean repaint failed before at least one key-burst test.',
    allRestored
      ? '- **** The probe restored the live pre-key `D007CA` context table, `D008E0`, and VAT/heap tuple immediately after the destructive cleanup blocks.'
      : '- !! One or more scenarios did not execute a restore hook.',
    allReachedLow
      ? '- **** State preservation does not redirect routing: both EOL/CLEAR and Digit2 still enter the low `0x006Dxx` status/transfer loop.'
      : '- *** At least one scenario avoided first low-route entry; inspect token/halt counters.',
    anyToken
      ? '- *** At least one token/tail hook fired after preservation.'
      : '- **** Token/tail hooks remain bypassed despite preservation (`0x08F5E1`, `0x090992`, `0x09098E`, `0x08F54B` all 0 hits).',
    '',
    '## Scenario Results',
    '',
    scenarioTable(scenarios),
    '',
    '## Dynamic Evidence',
    '',
    '```json',
    JSON.stringify(scenarios.map(compactTrace), null, 2),
    '```',
    '',
    '## Interpretation',
    '',
    'The cleanup wipes are not the sole routing cause. Restoring the live pre-key context table, `D008E0`, and VAT/heap tuple after EOL/CLEAR\'s `0x0A2150` LDIR wipe and after the shared `0x001879` bulk clear keeps those fields nonzero at first low-route entry, but execution still reaches `0x006D5D` before any token-buffer or EOL-tuple hook. That means the branch into the low transfer/status loop has already been selected by control-flow state outside this preserved tuple, or by side effects of the cleanup path that are not covered by `D007CA`/`D008E0`/VAT restoration.',
    '',
    'No runtime, transpiler, browser, or scheduler source files were modified.',
    '',
  ].join('\n');
}

console.log('phase645: test state preservation across key cleanup');
const scenarios = KEY_CASES.map((keyCase) => runScenario(keyCase));
fs.writeFileSync(REPORT_PATH, `${buildReport(scenarios)}\n`);

const pass = scenarios.every((row) => (
  !row.error &&
  row.repaint.result.termination === 'halt' &&
  row.keyTrace.restorations.length > 0 &&
  (row.keyTrace.firstLowBlock !== null || row.keyTrace.firstTokenBlock !== null || row.keyTrace.result.termination === 'step_limit')
));

console.log(JSON.stringify({
  probe: 'phase645-state-preserve-cleanup',
  pass,
  report: path.basename(REPORT_PATH),
  summary: scenarios.map((row) => row.error ? { key: row.key, error: row.error } : {
    key: row.keyTrace.label,
    repaint: row.repaint.result,
    keyTrace: row.keyTrace.result,
    restorations: row.keyTrace.restorations.map((item) => ({
      label: item.label,
      atBlock: item.atBlock,
      atPc: item.atPc,
      afterD007CA: item.after.D007CA,
      afterD008E0: item.after.D008E0,
      afterD02590: item.after.D02590,
    })),
    counts: {
      earlyContextClear0a2150: row.keyTrace.counts.earlyContextClear0a2150,
      bulkClear001879: row.keyTrace.counts.bulkClear001879,
      bulkTail0018f8: row.keyTrace.counts.bulkTail0018f8,
      firstLow006d5d: row.keyTrace.counts.firstLow006d5d,
      tokenExit08f5e1: row.keyTrace.counts.tokenExit08f5e1,
      tokenGate090992: row.keyTrace.counts.tokenGate090992,
      tokenStore09098e: row.keyTrace.counts.tokenStore09098e,
      eolTuple08f54b: row.keyTrace.counts.eolTuple08f54b,
    },
    firstLowBlock: row.keyTrace.firstLowBlock,
    firstTokenBlock: row.keyTrace.firstTokenBlock,
    final: {
      D007CA: row.keyTrace.final.D007CA,
      D008E0: row.keyTrace.final.D008E0,
      D02590: row.keyTrace.final.D02590,
      vramPixels: row.keyTrace.final.vramPixels,
    },
  }),
}, null, 2));

if (!pass) process.exitCode = 1;
